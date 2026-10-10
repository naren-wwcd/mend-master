"""Watcher debounce tests; the database, event bus and agent are stubbed."""

from __future__ import annotations

from backend import watcher


def _stub(monkeypatch) -> list[int]:
    opened: list[int] = []
    monkeypatch.setattr(watcher.db, "query_one", lambda *args, **kwargs: None)
    monkeypatch.setattr(watcher.db, "execute", lambda *args, **kwargs: len(opened) + 1)
    monkeypatch.setattr(watcher, "publish", lambda *args, **kwargs: None)
    monkeypatch.setattr(watcher, "start_agent", opened.append)
    watcher.reset_watch_state()
    return opened


def test_watcher_opens_one_incident_after_three_bad_samples(monkeypatch) -> None:
    opened = _stub(monkeypatch)
    watcher._observe(1.0)
    watcher._observe(1.0)
    assert opened == []
    watcher._observe(1.0)
    assert len(opened) == 1


def test_watcher_does_not_reopen_while_the_service_stays_unhealthy(monkeypatch) -> None:
    opened = _stub(monkeypatch)
    # The first incident has been escalated (no open incident), yet errors continue.
    for _ in range(30):
        watcher._observe(1.0)
    assert len(opened) == 1


def test_watcher_rearms_after_a_healthy_sample(monkeypatch) -> None:
    opened = _stub(monkeypatch)
    for _ in range(5):
        watcher._observe(1.0)
    watcher._observe(0.0)
    for _ in range(3):
        watcher._observe(1.0)
    assert len(opened) == 2


def test_a_newly_injected_fault_rearms_the_watcher(monkeypatch) -> None:
    opened = _stub(monkeypatch)
    for _ in range(5):
        watcher._observe(1.0)
    watcher.set_pending_fault_hint("disk_full")
    for _ in range(3):
        watcher._observe(1.0)
    assert len(opened) == 2


def test_opening_with_an_explicit_hint_consumes_the_pending_one(monkeypatch) -> None:
    _stub(monkeypatch)
    watcher.set_pending_fault_hint("bad_config")
    watcher.open_incident_now("bad_config")
    assert watcher._take_pending_fault_hint() is None
