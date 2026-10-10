import { useEffect, useRef } from "react";
import { useAuth } from "../../auth/AuthContext.jsx";
import { StatusPill } from "./shared.jsx";

const LINKS = [
  ["dashboard", "Operations overview", "M3 3h6v6H3zM11 3h6v6h-6zM3 11h6v6H3zM11 11h6v6h-6z"],
  ["incident", "Incident room", "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM10 8.5v3"],
  ["audit", "Audit log", "M4 5h12M4 10h12M4 15h8"],
  ["access", "Access log", "M7.5 9a3.5 3.5 0 1 0 0 .01zM10.5 11.5l6 6M14 15l2-2"],
];

export default function Sidebar({
  open, onClose, activeTab, setActiveTab, incidents, selectedId, onSelectIncident, catalog,
}) {
  const { session } = useAuth();
  const asideRef = useRef(null);

  // As a drawer: move focus in on open, and hand it back to the opener on close.
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    asideRef.current?.querySelector("button")?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (asideRef.current?.contains(document.activeElement)) opener?.focus?.();
    };
  }, [open, onClose]);

  return (
    <>
      <div className={`drawer-backdrop ${open ? "open" : ""}`} onClick={onClose} aria-hidden="true" />
      <aside id="console-sidebar" ref={asideRef} className={`sidebar ${open ? "open" : ""}`} aria-label="Workspace navigation">
        <div className="sidebar-title">WORKSPACE <span>{session?.tenant.name}</span></div>
        {LINKS.map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            className={`side-link ${activeTab === id ? "active" : ""}`}
            onClick={() => setActiveTab(id)}
          >
            <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
              <path d={icon} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {label}
          </button>
        ))}
        <div className="sidebar-divider" />
        <div className="sidebar-title">ACTIVE INCIDENT</div>
        {incidents.length ? incidents.slice(0, 8).map((item) => (
          <button
            key={item.id}
            type="button"
            className={`incident-link ${Number(item.id) === Number(selectedId) ? "active" : ""}`}
            onClick={() => onSelectIncident(item.id)}
          >
            <span className="incident-link-dot" />
            <span><b>INC-{item.id}</b><small>{item.title}</small></span>
            <StatusPill value={item.status} />
          </button>
        )) : <div className="sidebar-empty">No incidents yet</div>}
        <div className="catalog-mini">
          <div className="sidebar-title">FIX CATALOG <span>{catalog.length}</span></div>
          {catalog.slice(0, 5).map((fix) => <div key={fix.name}><span>{fix.name}</span><small>{fix.risk}</small></div>)}
        </div>
        <div className="sidebar-footer">Mend<br />SANDBOX environment</div>
      </aside>
    </>
  );
}
