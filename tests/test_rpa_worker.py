"""RPA worker queue tests; no browser is started."""

from __future__ import annotations

from pathlib import Path

import pytest

from backend import db
from rpa import worker


def _queue(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, statuses: list[str]) -> None:
    monkeypatch.setenv("DB_PATH", str(tmp_path / "autoheal.db"))
    db.init_db()
    incident_id = db.execute(
        "INSERT INTO incidents (title, severity, status, opened_at) VALUES ('t', 'high', 'open', ?)",
        (db.now_iso(),),
    )
    for status in statuses:
        db.execute(
            "INSERT INTO rpa_tasks (incident_id, kind, status, ts, payload_json) VALUES (?, 'add_note', ?, ?, '{}')",
            (incident_id, status, db.now_iso()),
        )


def test_tasks_left_running_by_a_stopped_worker_are_requeued(tmp_path, monkeypatch) -> None:
    _queue(tmp_path, monkeypatch, ["running", "done", "queued", "running"])

    assert worker.requeue_interrupted() == 2

    statuses = [row["status"] for row in db.query("SELECT status FROM rpa_tasks ORDER BY id")]
    assert statuses == ["queued", "done", "queued", "queued"]


def test_a_task_that_keeps_failing_is_marked_failed_once(tmp_path, monkeypatch) -> None:
    _queue(tmp_path, monkeypatch, ["queued"])
    calls: list[int] = []

    def failing(task):
        calls.append(task["id"])
        return {"ok": False, "detail": "portal unreachable", "screenshot_path": None}

    monkeypatch.setattr(worker, "process_task", failing)
    monkeypatch.setattr(worker, "publish", lambda *args, **kwargs: None)

    assert worker.process_one_task() is True
    assert worker.process_one_task() is False
    assert len(calls) == worker.MAX_ATTEMPTS
    assert db.query_one("SELECT status FROM rpa_tasks")["status"] == "failed"
