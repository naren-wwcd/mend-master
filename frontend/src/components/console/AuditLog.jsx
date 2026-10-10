import { useMemo } from "react";

export default function AuditLog({ incident }) {
  const records = useMemo(() => {
    if (!incident) return [];
    const events = [
      ...(incident.steps || []).map((item) => ({ ...item, kind: "step", at: item.ts })),
      ...(incident.actions || []).map((item) => ({ ...item, kind: "action", at: item.ts })),
      ...(incident.approvals || []).map((item) => ({ ...item, kind: "approval", at: item.ts })),
    ];
    return events.sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
  }, [incident]);

  if (!records.length) return <div className="empty">No audit records for this incident yet.</div>;
  return (
    <div className="audit-list">
      {records.map((record, index) => (
        <div className="audit-row" key={`${record.kind}-${record.id || index}`}>
          <time>{record.at ? new Date(record.at).toLocaleString() : "—"}</time>
          <span className="audit-type">{record.kind}</span>
          <span>
            {record.kind === "step"
              ? `${record.type}: ${record.thought || ""}`
              : record.kind === "action"
                ? `${record.fix} · ${record.decision} · ${record.result || record.reason}`
                : `Approval ${record.status} · ${record.decided_by || "pending"}`}
          </span>
        </div>
      ))}
    </div>
  );
}
