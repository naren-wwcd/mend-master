"""Offline replay tests; no API key or network access is needed."""

from __future__ import annotations

import json
from pathlib import Path

from backend import llm


def test_replay_returns_trace_steps_in_order(tmp_path: Path, monkeypatch) -> None:
    trace = {
        "scenario": "bad_config",
        "steps": [
            {
                "thought": "Inspect the alert.",
                "action": {"type": "tool_call", "tool": "get_alert", "args": {}},
            },
            {
                "thought": "Check database connectivity.",
                "action": {
                    "type": "tool_call",
                    "tool": "check_connectivity",
                    "args": {"target": "db"},
                },
            },
        ],
    }
    (tmp_path / "bad_config.json").write_text(json.dumps(trace), encoding="utf-8")
    monkeypatch.setattr(llm, "TRACE_DIR", tmp_path)
    monkeypatch.setenv("LLM_MODE", "replay")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    llm.reset_replay()

    messages = [{"role": "user", "content": "Scenario bad_config; investigate."}]
    first = llm.next_step(101, messages)
    # A real tool result in context does not alter or get replaced by replay.
    messages.append({
        "role": "tool",
        "name": "get_alert",
        "content": '{"title":"5xx on /checkout","error_rate":0.25}',
    })
    second = llm.next_step(101, messages)

    assert first["action"]["tool"] == "get_alert"
    assert second["action"]["tool"] == "check_connectivity"
    assert llm.get_llm_status()["mode"] == "REPLAY"


def test_replay_infers_scenario_from_hidden_incident_metadata(
    tmp_path: Path,
    monkeypatch,
) -> None:
    (tmp_path / "pool_leak.json").write_text(
        json.dumps({
            "scenario": "pool_leak",
            "steps": [{
                "thought": "Check pool pressure.",
                "action": {
                    "type": "tool_call",
                    "tool": "get_metrics",
                    "args": {"window_s": 60},
                },
            }],
        }),
        encoding="utf-8",
    )
    monkeypatch.setattr(llm, "TRACE_DIR", tmp_path)
    monkeypatch.setenv("LLM_MODE", "replay")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(
        llm,
        "_scenario_for_incident",
        lambda incident_id, messages: "pool_leak",
    )

    result = llm.next_step(202, [{"role": "user", "content": "Investigate."}])
    assert result["action"]["tool"] == "get_metrics"


def test_invalid_trace_shape_returns_error(tmp_path: Path, monkeypatch) -> None:
    (tmp_path / "bad_config.json").write_text(
        json.dumps({
            "scenario": "bad_config",
            "steps": [{"thought": "missing action"}],
        }),
        encoding="utf-8",
    )
    monkeypatch.setattr(llm, "TRACE_DIR", tmp_path)
    monkeypatch.setenv("LLM_MODE", "replay")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    result = llm.next_step(
        303,
        [{"role": "user", "content": "Scenario bad_config"}],
    )
    assert result["error"] == "trace_unavailable"


def _write_trace(directory: Path, name: str, tools: list[str]) -> None:
    steps = [
        {"thought": f"{name}: {tool}", "action": {"type": "tool_call", "tool": tool, "args": {}}}
        for tool in tools
    ]
    (directory / f"{name}.json").write_text(
        json.dumps({"scenario": name, "steps": steps}), encoding="utf-8"
    )


def _replay_env(tmp_path: Path, monkeypatch, hint: str | None) -> None:
    _write_trace(tmp_path, "bad_config", ["get_alert", "get_metrics", "get_config_diff", "tail_logs"])
    _write_trace(tmp_path, "disk_full", ["get_alert", "get_metrics", "check_connectivity", "db_status"])
    _write_trace(tmp_path, "pool_leak", ["get_alert", "get_metrics", "db_status", "db_status"])
    monkeypatch.setattr(llm, "TRACE_DIR", tmp_path)
    monkeypatch.setenv("LLM_MODE", "replay")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(llm, "_hidden_hint", lambda incident_id: hint)
    llm.reset_replay()


HEALTHY_LOOKING_METRICS = {
    "error_rate": 1.0, "p95_ms": 34.8, "db_pool_used": 2, "db_pool_max": 10,
    "disk_used_pct": 41.0, "worker_status": "running", "db_status": "ok", "payment_status": "ok",
}


def test_replay_stays_on_one_trace_despite_noisy_context(tmp_path: Path, monkeypatch) -> None:
    _replay_env(tmp_path, monkeypatch, hint="bad_config")
    messages: list[dict] = [{"role": "user", "content": "Investigate the alert."}]
    additions = [
        None,
        {"role": "tool", "name": "get_alert", "content": json.dumps({"title": "5xx on /checkout"})},
        {"role": "tool", "name": "get_metrics", "content": json.dumps(HEALTHY_LOOKING_METRICS)},
        {
            "role": "assistant",
            "content": "Could be disk full (no space left on device) or pool exhausted; checking.",
        },
    ]
    seen = []
    for extra in additions:
        if extra:
            messages.append(extra)
        seen.append(llm.next_step(303, messages)["action"]["tool"])

    assert seen == ["get_alert", "get_metrics", "get_config_diff", "tail_logs"]


def test_replay_without_a_hint_judges_metric_values_not_key_names(tmp_path: Path, monkeypatch) -> None:
    _replay_env(tmp_path, monkeypatch, hint=None)

    def run(incident_id: int, metrics: dict) -> list[str]:
        messages: list[dict] = [{"role": "user", "content": "Investigate the alert."}]
        tools = [llm.next_step(incident_id, messages)["action"]["tool"]]
        messages.append({"role": "tool", "name": "get_alert", "content": "{}"})
        tools.append(llm.next_step(incident_id, messages)["action"]["tool"])
        messages.append({"role": "tool", "name": "get_metrics", "content": json.dumps(metrics)})
        tools.append(llm.next_step(incident_id, messages)["action"]["tool"])
        return tools

    assert run(401, HEALTHY_LOOKING_METRICS) == ["get_alert", "get_metrics", "get_config_diff"]
    assert run(402, {**HEALTHY_LOOKING_METRICS, "disk_used_pct": 100.0}) == [
        "get_alert", "get_metrics", "check_connectivity",
    ]
    assert run(403, {**HEALTHY_LOOKING_METRICS, "db_pool_used": 10}) == [
        "get_alert", "get_metrics", "db_status",
    ]


def test_the_alert_alone_does_not_decide_the_scenario(tmp_path: Path, monkeypatch) -> None:
    _replay_env(tmp_path, monkeypatch, hint=None)
    messages: list[dict] = [
        # The agent's opening message lists the catalog, which mentions fault names in passing.
        {"role": "user", "content": json.dumps({"remediation_catalog": ["fixes bad_config drift"]})},
    ]
    llm.next_step(501, messages)
    messages.append({
        "role": "tool", "name": "get_alert",
        "content": json.dumps({"title": "5xx on /checkout", "status": "firing", "error_rate": 1.0}),
    })
    llm.next_step(501, messages)
    messages.append({
        "role": "tool", "name": "get_metrics",
        "content": json.dumps({**HEALTHY_LOOKING_METRICS, "disk_used_pct": 100.0}),
    })

    assert llm.next_step(501, messages)["action"]["tool"] == "check_connectivity"
