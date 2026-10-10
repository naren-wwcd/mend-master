"""Tests for the paths that used to leave an incident stuck or unfixable."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend import agent, api, db, guard, watcher
from scripts.seed import seed

TRACES = Path(__file__).resolve().parents[1] / "traces"


@pytest.fixture
def incident_id(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> int:
    monkeypatch.setenv("DB_PATH", str(tmp_path / "recovery-test.db"))
    db.init_db()
    seed()
    return db.execute(
        "INSERT INTO incidents (title, severity, status, opened_at) VALUES (?, ?, ?, ?)",
        ("SANDBOX recovery test", "high", "open", db.now_iso()),
    )


@pytest.fixture
def client(incident_id: int, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("AUTOHEAL_DISABLE_BACKGROUND", "1")
    with TestClient(api.app) as test_client:
        yield test_client


def _status(incident_id: int) -> str:
    return db.query_one("SELECT status FROM incidents WHERE id = ?", (incident_id,))["status"]


def _pages(incident_id: int) -> int:
    return db.query_one("SELECT COUNT(*) AS n FROM pages WHERE incident_id = ?", (incident_id,))["n"]


# --- guard -----------------------------------------------------------------

def test_rollback_dry_run_reads_the_config_endpoint_the_sandbox_has(monkeypatch) -> None:
    def sandbox(path: str) -> dict:
        if path == "/admin/config":
            return {
                "active_version": 4,
                "config": {"db_host": "db-prod-02"},
                "history": [
                    {"version": 3, "diff": "+ db_pool_size=10"},
                    {"version": 4, "diff": "- db_host=db-prod-01\n+ db_host=db-prod-02"},
                ],
            }
        return {"detail": "Not Found"}

    monkeypatch.setattr(guard, "_sandbox_json", sandbox)
    ok, message = guard._dry_run("rollback_config")
    assert ok, message
    assert "db-prod-02" in message


def test_rollback_dry_run_fails_with_a_single_config_version(monkeypatch) -> None:
    monkeypatch.setattr(guard, "_sandbox_json", lambda path: {"history": [{"version": 1, "diff": ""}]})
    ok, _ = guard._dry_run("rollback_config")
    assert not ok


def test_guard_reads_survive_an_unreachable_sandbox(monkeypatch) -> None:
    monkeypatch.setattr(guard, "_SANDBOX_URL", "http://127.0.0.1:9")
    assert "error" in guard._sandbox_json("/metrics")


# --- agent and watcher -------------------------------------------------------

@pytest.mark.asyncio
async def test_concluding_without_a_verified_fix_escalates(incident_id, monkeypatch) -> None:
    answers = iter([{"thought": "Nothing more to try.", "action": {"type": "conclude", "summary": "Done."}}])
    monkeypatch.setattr(agent, "next_step", lambda _id, _messages: next(answers))

    await agent.run_incident(incident_id)

    assert _status(incident_id) == "escalated"
    assert _pages(incident_id) == 1


@pytest.mark.asyncio
async def test_an_agent_crash_escalates_instead_of_leaving_the_incident_open(incident_id, monkeypatch) -> None:
    async def boom(_incident_id: int) -> None:
        raise RuntimeError("tool exploded")

    monkeypatch.setattr(agent, "run_incident", boom)

    await watcher._run_agent(incident_id)

    assert _status(incident_id) == "escalated"
    assert _pages(incident_id) == 1


def test_incidents_interrupted_by_a_restart_are_escalated(incident_id) -> None:
    db.execute("UPDATE incidents SET status = 'awaiting_approval' WHERE id = ?", (incident_id,))

    assert watcher.recover_interrupted_incidents() == 1

    assert _status(incident_id) == "escalated"
    assert _pages(incident_id) == 1
    assert watcher.recover_interrupted_incidents() == 0


def test_the_step_budget_covers_a_two_fix_incident() -> None:
    assert agent.MAX_STEPS >= 20


def test_compound_trace_updates_hypotheses_between_its_two_fixes() -> None:
    steps = json.loads((TRACES / "compound.json").read_text(encoding="utf-8"))
    kinds = [step["action"]["type"] for step in steps]
    first, second = [index for index, kind in enumerate(kinds) if kind == "propose_fix"]
    assert "update_hypotheses" in kinds[first + 1:second]


# --- api -------------------------------------------------------------------

def test_health_summary_reports_disk_usage(client, monkeypatch) -> None:
    metrics = {
        "ok": True, "error_rate": 0.0, "p95_ms": 12.0, "db_status": "ok",
        "worker_status": "running", "disk_used_pct": 41.0, "payment_status": "ok",
    }
    monkeypatch.setattr(api, "_sandbox_request", lambda path, method="GET": (200, metrics))

    assert client.get("/health-summary").json()["disk_used_pct"] == 41.0


def test_incident_actions_carry_catalog_details_for_the_approval_dialog(client, incident_id) -> None:
    db.execute(
        "INSERT INTO actions (incident_id, fix, risk, decision, reason, ts) VALUES (?, 'restart_db', 'high', 'needs_approval', 'r', ?)",
        (incident_id, db.now_iso()),
    )

    action = client.get(f"/incidents/{incident_id}").json()["actions"][0]

    assert isinstance(action["blast_radius"], str) and action["blast_radius"]


def test_screenshots_are_served_by_file_name_only(client, tmp_path, monkeypatch) -> None:
    shots = tmp_path / "shots"
    shots.mkdir()
    (shots / "rpa_1_done.png").write_bytes(b"\x89PNG fake")
    (tmp_path / "secret.txt").write_text("no", encoding="utf-8")
    monkeypatch.setenv("SCREENSHOT_DIR", str(shots))

    assert client.get("/screenshots/rpa_1_done.png").content == b"\x89PNG fake"
    assert client.get("/screenshots/missing.png").status_code == 404
    assert client.get("/screenshots/..%2Fsecret.txt").status_code == 404


def test_deciding_an_approval_twice_is_a_conflict(client, incident_id) -> None:
    decision = guard.check(incident_id, "restart_db", 0.9, None)
    approval_id = decision["approval_id"]

    assert client.post(f"/approvals/{approval_id}/approve", json={}).status_code == 200
    assert client.post(f"/approvals/{approval_id}/approve", json={}).status_code == 409
    assert client.post("/approvals/99999/approve", json={}).status_code == 404
