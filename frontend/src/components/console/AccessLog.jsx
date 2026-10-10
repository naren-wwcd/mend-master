const TONES = { sign_in: "good", workspace_created: "good", sign_in_failed: "bad" };

export default function AccessLog({ entries }) {
  if (!entries.length) return <div className="empty">No access events for this workspace yet.</div>;
  return (
    <div className="audit-list access-list">
      {entries.map((entry, index) => {
        const when = new Date(entry.ts);
        return (
          <div className="audit-row" key={`${entry.ts}-${index}`}>
            <time>{Number.isNaN(when.getTime()) ? "—" : when.toLocaleString()}</time>
            <span className={`pill ${TONES[entry.event] || "neutral"}`}>{entry.event.replaceAll("_", " ")}</span>
            <span><b>{entry.email}</b> · {entry.detail}</span>
          </div>
        );
      })}
    </div>
  );
}
