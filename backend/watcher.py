"""Metric watcher that automatically opens sandbox incidents."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import random
import threading
import threading
from typing import Any
from urllib.error import HTTPError
from urllib.request import urlopen

from . import db
from .events import publish

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # Environment may be supplied by the process manager.
    pass

logger = logging.getLogger(__name__)

SANDBOX_URL = os.getenv("SANDBOX_URL", "http://127.0.0.1:8001").rstrip("/")
ERROR_RATE_THRESHOLD = float(os.getenv("ERROR_RATE_THRESHOLD", "0.05"))
POLL_INTERVAL_S = 1.0
CONSECUTIVE_SAMPLES = 3
SCENARIOS = (
    "bad_config",
    "pool_leak",
    "disk_full",
    "payment_down",
    "db_hung",
    "compound",
)
_OPEN_STATUSES = ("open", "investigating", "awaiting_approval")

_hint_lock = threading.Lock()
_pending_fault_hint: str | None = None
_agent_tasks: set[asyncio.Task[Any]] = set()
_watch_task: asyncio.Task[Any] | None = None
_consecutive_bad_samples = 0
# Set once an incident has been opened for the current outage. Cleared by a
# healthy sample, a newly injected fault or a reset, so an outage the agent
# could not fix is escalated once instead of reopening every few seconds.
_outage_already_reported = False


def set_pending_fault_hint(scenario: str | None) -> None:
    """Associate an injected fault with the next incident, internally only."""
    global _pending_fault_hint, _outage_already_reported
    with _hint_lock:
        _pending_fault_hint = scenario
    if scenario is not None:
        _outage_already_reported = False


def clear_pending_fault_hint() -> None:
    set_pending_fault_hint(None)


def reset_watch_state() -> None:
    """Reset watcher debounce state and any pending hidden hint."""
    global _consecutive_bad_samples, _outage_already_reported
    _consecutive_bad_samples = 0
    _outage_already_reported = False
    clear_pending_fault_hint()


def _take_pending_fault_hint() -> str | None:
    global _pending_fault_hint
    with _hint_lock:
        value = _pending_fault_hint
        _pending_fault_hint = None
        return value


def _fetch_metrics_sync() -> dict[str, Any]:
    try:
        with urlopen(f"{SANDBOX_URL}/metrics", timeout=3) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        logger.warning("Sandbox metrics request failed with HTTP %s", exc.code)
    except Exception as exc:
        logger.debug("Sandbox metrics are not available yet: %s", exc)
    return {}


def _has_open_incident() -> bool:
    placeholders = ",".join("?" for _ in _OPEN_STATUSES)
    row = db.query_one(
        f"SELECT id FROM incidents WHERE status IN ({placeholders}) ORDER BY id DESC LIMIT 1",
        _OPEN_STATUSES,
    )
    return row is not None


def _enqueue_rpa_create(incident_id: int, payload: dict[str, Any]) -> int | None:
    try:
        return db.execute(
            """
            INSERT INTO rpa_tasks (incident_id, kind, status, ts, payload_json)
            VALUES (?, 'create_incident', 'queued', ?, ?)
            """,
            (incident_id, db.now_iso(), json.dumps(payload, ensure_ascii=False)),
        )
    except Exception:
        logger.exception("Could not enqueue RPA create_incident task")
        return None


def _send_critical_email(incident_id: int, title: str, severity: str) -> None:
    """Send an incident email in the background when SMTP is configured."""
    required = ("BREVO_SMTP_USER", "BREVO_SMTP_KEY", "ALERT_EMAIL_FROM", "ALERT_EMAIL_TO")
    settings = {name: os.getenv(name, "").strip() for name in required}
    if not all(settings.values()) or any(value.lower().startswith(("your-", "you@")) for value in settings.values()):
        return

    def deliver() -> None:
        import smtplib
        from email.message import EmailMessage

        message = EmailMessage()
        message["Subject"] = f"[Mend] Incident alert #{incident_id}: {title}"
        message["From"] = settings["ALERT_EMAIL_FROM"]
        message["To"] = settings["ALERT_EMAIL_TO"]
        message.set_content(
            f"A high priority incident was opened in Mend.\n\n"
            f"Incident: #{incident_id}\nTitle: {title}\nSeverity: {severity}\n"
        )
        host = os.getenv("BREVO_SMTP_HOST", "smtp-relay.brevo.com")
        port = int(os.getenv("BREVO_SMTP_PORT", "587"))
        try:
            with smtplib.SMTP(host, port, timeout=10) as smtp:
                smtp.starttls()
                smtp.login(settings["BREVO_SMTP_USER"], settings["BREVO_SMTP_KEY"])
                smtp.send_message(message)
            logger.info("Critical incident email sent for incident %s", incident_id)
        except Exception:
            logger.exception("Could not send critical incident email for incident %s", incident_id)

    threading.Thread(target=deliver, name=f"incident-email-{incident_id}", daemon=True).start()


def _escalate_stuck(incident_id: int, reason: str, summary: str) -> None:
    """Hand an incident the agent can no longer drive to on-call."""
    try:
        from .escalation import create_page

        create_page(incident_id, reason, summary, [])
    except Exception:
        logger.exception("Could not escalate stuck incident %s", incident_id)


async def _run_agent(incident_id: int) -> None:
    try:
        from . import agent

        await agent.run_incident(incident_id)
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("Agent task failed for incident %s", incident_id)
        _escalate_stuck(
            incident_id,
            "The agent stopped unexpectedly.",
            "The investigation hit an internal error; inspect the backend logs.",
        )


def start_resume(approval_id: int, incident_id: int | None) -> asyncio.Task[Any]:
    """Resume a paused incident after an approval decision, as a tracked task."""

    async def run() -> None:
        try:
            from . import agent

            await agent.resume_after_approval(approval_id)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Resume after approval %s failed", approval_id)
            if incident_id is not None:
                _escalate_stuck(
                    incident_id,
                    "The agent stopped unexpectedly after the approval decision.",
                    "The remediation could not be completed; inspect the backend logs.",
                )

    task = asyncio.create_task(run(), name=f"resume-{approval_id}")
    _agent_tasks.add(task)
    task.add_done_callback(_agent_tasks.discard)
    return task


def recover_interrupted_incidents() -> int:
    """Escalate incidents a previous backend process left mid-flight.

    Agent sessions live in memory, so after a restart nothing can resume them
    and they would block every new incident.
    """
    placeholders = ",".join("?" for _ in _OPEN_STATUSES)
    rows = db.query(
        f"SELECT id FROM incidents WHERE status IN ({placeholders}) ORDER BY id",
        _OPEN_STATUSES,
    )
    for row in rows:
        _escalate_stuck(
            int(row["id"]),
            "The backend restarted while this incident was in progress.",
            "The investigation was interrupted; review the timeline and decide the next step.",
        )
    return len(rows)


def start_agent(incident_id: int) -> asyncio.Task[Any]:
    """Start the incident agent as an asyncio task and retain it until done."""
    task = asyncio.create_task(_run_agent(incident_id), name=f"agent-{incident_id}")
    _agent_tasks.add(task)
    task.add_done_callback(_agent_tasks.discard)
    return task


def open_incident_now(fault_hint_hidden: str | None = None) -> int | None:
    """Open one incident if none is active; omit the hint from published data."""
    global _outage_already_reported
    if _has_open_incident():
        return None

    # Always consume the pending hint so it cannot leak into a later incident.
    pending = _take_pending_fault_hint()
    hint = fault_hint_hidden if fault_hint_hidden in SCENARIOS else pending
    _outage_already_reported = True
    incident_id = db.execute(
        """
        INSERT INTO incidents
            (title, severity, status, fault_hint_hidden, opened_at)
        VALUES (?, ?, 'open', ?, ?)
        """,
        (
            "5xx on /checkout",
            "high",
            hint,
            db.now_iso(),
        ),
    )
    payload = {
        "title": "5xx on /checkout",
        "severity": "high",
        "diagnosis": "SANDBOX checkout error-rate threshold exceeded.",
    }
    rpa_task_id = _enqueue_rpa_create(incident_id, payload)
    event = {
        "incident_id": incident_id,
        "title": "5xx on /checkout",
        "severity": "high",
        "status": "open",
        "rpa_task_id": rpa_task_id,
    }
    publish("incident_opened", event)
    _send_critical_email(incident_id, event["title"], event["severity"])
    start_agent(incident_id)
    return incident_id


def _observe(error_rate: float) -> int | None:
    """Feed one error-rate sample to the debounce; return a new incident id, if any."""
    global _consecutive_bad_samples, _outage_already_reported
    if error_rate > ERROR_RATE_THRESHOLD:
        _consecutive_bad_samples += 1
    else:
        _consecutive_bad_samples = 0
        _outage_already_reported = False

    if (
        _consecutive_bad_samples >= CONSECUTIVE_SAMPLES
        and not _outage_already_reported
        and not _has_open_incident()
    ):
        _consecutive_bad_samples = 0
        return open_incident_now()
    return None


async def watch_loop() -> None:
    """Poll sandbox metrics and open one incident after three bad samples."""
    while True:
        try:
            metrics = await asyncio.to_thread(_fetch_metrics_sync)
            if metrics:
                try:
                    error_rate = float(metrics.get("error_rate", 0.0))
                except (TypeError, ValueError):
                    error_rate = 0.0

                publish("metrics", metrics)
                _observe(error_rate)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Watcher iteration failed")
        await asyncio.sleep(POLL_INTERVAL_S)


async def wait_for_sandbox(timeout_s: float = 30.0) -> bool:
    """Wait for the sandbox health endpoint without blocking the event loop."""
    import time

    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        try:
            def check() -> bool:
                with urlopen(f"{SANDBOX_URL}/health", timeout=2) as response:
                    return response.status == 200

            if await asyncio.to_thread(check):
                return True
        except Exception:
            await asyncio.sleep(0.5)
    return False


def cancel_agent_tasks() -> None:
    """Request cancellation of currently running incident agents."""
    for task in tuple(_agent_tasks):
        task.cancel()
