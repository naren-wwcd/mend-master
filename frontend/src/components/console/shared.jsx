import { useEffect, useRef, useState } from "react";

export const FAULTS = [
  ["bad_config", "Bad config", "Wrong database host"],
  ["pool_leak", "Pool leak", "Connections accumulate"],
  ["disk_full", "Disk full", "Log growth exhausts disk"],
  ["payment_down", "Payment down", "Gateway becomes unavailable"],
  ["db_hung", "DB hung", "Database becomes unresponsive"],
  ["compound", "Compound", "Bad config + full disk"],
];

export const PHASES = {
  tool_call: ["⌕", "Investigate"],
  update_hypotheses: ["◇", "Hypothesize"],
  propose_fix: ["◎", "Decide"],
  guard_decision: ["⬡", "Guard"],
  act: ["⚡", "Act"],
  verify: ["✓", "Verify"],
  escalate: ["!", "Escalate"],
  conclude: ["✓", "Conclude"],
};

export const CONSOLE_TABS = [
  ["dashboard", "Overview"],
  ["incident", "Incident"],
  ["audit", "Audit log"],
  ["access", "Access log"],
];

export function parseJson(value, fallback = {}) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "{}");
  } catch {
    return fallback;
  }
}

export function timeLabel() {
  return new Date().toLocaleTimeString([], { hour12: false });
}

export function formatDuration(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(safe / 60);
  return `${String(minutes).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export function StatusPill({ value }) {
  const normalized = String(value || "unknown").toLowerCase();
  const tone = ["healthy", "running", "ok", "resolved", "done", "approved"].includes(normalized)
    ? "good"
    : ["degraded", "pending", "investigating", "awaiting_approval"].includes(normalized)
      ? "warn"
      : ["down", "unresponsive", "failed", "rejected", "escalated"].includes(normalized)
        ? "bad"
        : "neutral";
  // Replay the ring only when the value changes, not on first paint.
  const [pulse, setPulse] = useState(0);
  const previous = useRef(normalized);
  useEffect(() => {
    if (previous.current === normalized) return;
    previous.current = normalized;
    setPulse((count) => count + 1);
  }, [normalized]);
  return (
    <span key={pulse} className={`pill ${tone}${pulse ? " pill-pulse" : ""}`}>
      {String(value || "unknown").replaceAll("_", " ")}
    </span>
  );
}
