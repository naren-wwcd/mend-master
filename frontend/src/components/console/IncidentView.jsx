import { useEffect, useRef } from "react";
import { PORTAL_URL, screenshotUrl } from "../../api.js";
import { PHASES, StatusPill, parseJson } from "./shared.jsx";

function HypothesisCard({ hypothesis }) {
  const confidence = Math.max(0, Math.min(1, Number(hypothesis.confidence) || 0));
  const status = String(hypothesis.status || "open").toLowerCase();
  return (
    <article className="hypothesis-card">
      <div className="hypothesis-top">
        <strong>{hypothesis.cause}</strong>
        <StatusPill value={status} />
      </div>
      <div className="confidence-row">
        <span>Confidence</span><b>{Math.round(confidence * 100)}%</b>
      </div>
      <div className="confidence-track"><div style={{ width: `${confidence * 100}%` }} /></div>
      {parseJson(hypothesis.evidence_json, {}).evidence_for?.length > 0 && (
        <p className="hypothesis-evidence">For: {parseJson(hypothesis.evidence_json).evidence_for.join(" · ")}</p>
      )}
    </article>
  );
}

function stepInfo(step) {
  const payload = parseJson(step.payload_json);
  const action = payload.action || payload;
  const key = step.type === "tool_call" ? "tool_call"
    : step.type === "update_hypotheses" ? "update_hypotheses"
      : step.type === "propose_fix" ? "propose_fix"
        : step.type === "verify" ? "verify"
          : step.type === "act" ? "act"
            : step.type === "escalate" ? "escalate"
              : step.type === "conclude" ? "conclude"
                : step.type;
  const info = PHASES[key] || ["·", step.type || "Step"];
  return { payload, action, icon: info[0], label: info[1] };
}

function Timeline({ steps }) {
  if (!steps?.length) return <div className="empty">No agent steps yet. The watcher may still be opening the incident.</div>;
  return (
    <div className="timeline">
      {steps.map((step) => {
        const { payload, action, icon, label } = stepInfo(step);
        const result = payload.result || payload.verification;
        const quoteLines = result?.lines || result?.detail?.lines || [];
        return (
          <article className="timeline-item" key={step.id || `${step.idx}-${step.type}`}>
            <div className="timeline-icon">{icon}</div>
            <div className="timeline-content">
              <div className="timeline-heading">
                <strong>{label}</strong><span>#{step.idx}</span>
                <time>{step.ts ? new Date(step.ts).toLocaleTimeString() : ""}</time>
              </div>
              <p>{step.thought || action.summary || action.reason || action.fix_name || ""}</p>
              {action.tool && <div className="tool-chip">TOOL · {action.tool}</div>}
              {action.fix_name && <div className="tool-chip">FIX · {action.fix_name}</div>}
              {quoteLines.length > 0 && (
                <blockquote>{quoteLines.map((line, index) => <code key={index}>“{line}”</code>)}</blockquote>
              )}
              {payload.result?.detail && typeof payload.result.detail === "string" && (
                <div className="result-line">{payload.result.detail}</div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ApprovalModal({ approval, action, hypothesis, onApprove, onReject, busy }) {
  const dialogRef = useRef(null);
  const approvalId = approval?.id;
  useEffect(() => {
    if (approvalId != null) dialogRef.current?.focus();
  }, [approvalId]);
  if (!approval) return null;
  const actionPayload = action || {};
  return (
    <div className="modal-backdrop" role="presentation">
      <section ref={dialogRef} tabIndex={-1} className="approval-modal" role="dialog" aria-modal="true" aria-labelledby="approval-title">
        <div className="modal-top"><span className="modal-symbol">!</span><span className="pill warn">HUMAN REVIEW</span></div>
        <h2 id="approval-title">Approval required</h2>
        <p className="modal-diagnosis">{hypothesis?.cause || "Review the proposed sandbox action before it runs."}</p>
        <dl className="approval-details">
          <div><dt>Proposed action</dt><dd>{actionPayload.fix || "Remediation action"}</dd></div>
          <div><dt>Risk</dt><dd>{actionPayload.risk || "Review catalog entry"}</dd></div>
          <div><dt>Blast radius</dt><dd>{actionPayload.blast_radius || "Sandbox services"}</dd></div>
          <div><dt>Reason</dt><dd>{actionPayload.reason || "Guard requires human approval."}</dd></div>
          <div><dt>Rollback plan</dt><dd>{actionPayload.rollback_plan || "Escalate if sandbox verification fails."}</dd></div>
        </dl>
        <div className="modal-actions">
          <button className="button" disabled={busy} onClick={onApprove}>Approve sandbox action</button>
          <button className="button danger-outline" disabled={busy} onClick={onReject}>Reject</button>
        </div>
      </section>
    </div>
  );
}

function EscalationDecisionModal({ incident, page, onAccept, onReject, busy }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    if (page?.id != null) dialogRef.current?.focus();
  }, [page?.id]);
  if (!page) return null;
  const body = parseJson(page.body_json, {});
  return (
    <div className="modal-backdrop" role="presentation">
      <section ref={dialogRef} tabIndex={-1} className="approval-modal" role="dialog" aria-modal="true" aria-labelledby="escalation-decision-title">
        <div className="modal-top"><span className="modal-symbol">!</span><span className="pill bad">ESCALATED</span></div>
        <h2 id="escalation-decision-title">Incident needs your decision</h2>
        <p className="modal-diagnosis">INC-{incident.id} · {incident.title}</p>
        <dl className="approval-details">
          <div><dt>Diagnosis</dt><dd>{body.diagnosis || body.reason || "The agent could not safely resolve this incident."}</dd></div>
          <div><dt>Accept</dt><dd>Reset the sandbox to its healthy state and mark this incident resolved.</dd></div>
          <div><dt>Reject</dt><dd>Keep the sandbox and escalated incident as they are.</dd></div>
        </dl>
        <div className="modal-actions">
          <button className="button" disabled={busy} onClick={onAccept}>{busy ? "Resolving…" : "Accept & resolve"}</button>
          <button className="button danger-outline" disabled={busy} onClick={onReject}>Reject, leave as is</button>
        </div>
      </section>
    </div>
  );
}

function RpaPanel({ tasks }) {
  const latest = tasks?.[0];
  const path = latest?.screenshot_path;
  return (
    <section className="panel">
      <div className="panel-heading">
        <div><div className="eyebrow">LEGACY PORTAL AUTOMATION</div><h3>RPA task queue</h3></div>
        <a className="text-link" href={PORTAL_URL} target="_blank" rel="noreferrer">Open ITSM portal ↗</a>
      </div>
      {latest && path ? (
        <div className="screenshot-preview">
          <a href={screenshotUrl(path)} target="_blank" rel="noreferrer">
            <img src={screenshotUrl(path)} alt="Latest RPA portal screenshot" />
          </a>
          <small>{path}</small>
        </div>
      ) : <div className="empty compact">Screenshots appear after the portal bot completes a task.</div>}
      {!tasks?.length ? <div className="empty compact">No portal tasks yet.</div> : (
        <div className="task-list">
          {tasks.map((task) => (
            <div className="task-row" key={task.id}>
              <div><b>{task.kind.replaceAll("_", " ")}</b><small>Task #{task.id}</small></div>
              <StatusPill value={task.status} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function EscalationCard({ pages, status }) {
  const latest = pages?.[0];
  if (!latest) {
    return <section className="panel"><h3>On-call escalation</h3><div className="empty compact">No page has been sent for this incident.</div></section>;
  }
  const body = parseJson(latest.body_json, {});
  return (
    <section className="panel escalation-panel">
      <div className="panel-heading"><div><div className="eyebrow">MOCK ON-CALL PAGE</div><h3>Escalation sent</h3></div><StatusPill value={status || "escalated"} /></div>
      <p className="diagnosis-text">{body.diagnosis || body.diagnosis_summary || "Diagnosis attached to page."}</p>
      {body.operator_decision && <div className="page-reason">Operator decision: {body.operator_decision}</div>}
      <div className="page-reason">{body.reason}</div>
      <h4>Recommended next step</h4>
      <p>{body.recommended_next_step || "Review the evidence and choose an approved sandbox action."}</p>
      <h4>Evidence sent</h4>
      <ul>{(body.evidence || []).map((item, index) => <li key={index}>{String(item)}</li>)}</ul>
    </section>
  );
}

export default function IncidentView({ incident, onRefresh, busy = false }) {
  if (!incident?.incident) {
    return (
      <section className="panel incident-empty">
        <div className="empty-symbol">⌕</div>
        <h2>No incident selected</h2>
        <p>Inject a sandbox fault or wait for the metric watcher to open an incident automatically.</p>
        <button className="button" onClick={onRefresh}>Refresh incident list</button>
      </section>
    );
  }

  const item = incident.incident;
  const latestPage = [...(incident.pages || [])].sort((a, b) => Number(b.id) - Number(a.id))[0];
  const escalationNeedsDecision = item.status === "escalated" && latestPage && !parseJson(latestPage.body_json, {}).operator_decision;
  const pending = incident.approvals?.find((approval) => approval.status === "pending");
  const pendingAction = pending ? incident.actions?.find((entry) => entry.id === pending.action_id) : null;
  const hypothesis = pendingAction
    ? incident.hypotheses?.find((entry) => String(entry.id) === String(pendingAction.target_hypothesis))
    : null;

  return (
    <div className="incident-layout">
      <main className="incident-main">
        <section className="panel incident-summary">
          <div>
            <div className="eyebrow">INCIDENT #{item.id} · SANDBOX</div>
            <h1>{item.title}</h1>
            <p>Opened {item.opened_at ? new Date(item.opened_at).toLocaleString() : "—"}</p>
          </div>
          <StatusPill value={item.status} />
        </section>
        <section className="panel">
          <div className="panel-heading"><h3>Agent timeline</h3><button className="small-button" onClick={onRefresh}>Refresh</button></div>
          <Timeline steps={incident.steps} />
        </section>
        <section className="panel">
          <h3>Hypotheses</h3>
          {!incident.hypotheses?.length
            ? <div className="empty compact">The agent has not recorded hypotheses yet.</div>
            : <div className="hypothesis-list">{incident.hypotheses.map((h) => <HypothesisCard key={h.id} hypothesis={h} />)}</div>}
        </section>
      </main>
      <aside className="incident-aside">
        <RpaPanel tasks={[...(incident.rpa_tasks || [])].reverse()} />
        <EscalationCard pages={[...(incident.pages || [])].reverse()} status={item.status} />
        <section className="panel">
          <h3>Recent guard decisions</h3>
          {!incident.actions?.length ? <div className="empty compact">No actions proposed yet.</div> : (
            incident.actions.slice().reverse().map((action) => (
              <div className="guard-card" key={action.id}>
                <div className="panel-heading"><b>{action.fix}</b><StatusPill value={action.decision} /></div>
                <p>{action.reason}</p>
                {action.result && <small>{action.result}</small>}
              </div>
            ))
          )}
        </section>
      </aside>
      <ApprovalModal
        approval={pending}
        action={pendingAction}
        hypothesis={hypothesis}
        busy={busy}
        onApprove={() => window.dispatchEvent(new CustomEvent("autoheal-approve", { detail: pending.id }))}
        onReject={() => window.dispatchEvent(new CustomEvent("autoheal-reject", { detail: pending.id }))}
      />
      <EscalationDecisionModal
        incident={item}
        page={escalationNeedsDecision ? latestPage : null}
        busy={busy}
        onAccept={() => window.dispatchEvent(new CustomEvent("autoheal-escalation-accept", { detail: latestPage.id }))}
        onReject={() => window.dispatchEvent(new CustomEvent("autoheal-escalation-reject", { detail: latestPage.id }))}
      />
    </div>
  );
}
