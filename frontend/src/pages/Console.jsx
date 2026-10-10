import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { API_BASE, PORTAL_URL, api } from "../api.js";
import { useSSE } from "../hooks/useSSE.js";
import { useAuth } from "../auth/AuthContext.jsx";
import AccessLog from "../components/console/AccessLog.jsx";
import AuditLog from "../components/console/AuditLog.jsx";
import ConsoleHeader from "../components/console/ConsoleHeader.jsx";
import Dashboard from "../components/console/Dashboard.jsx";
import IncidentView from "../components/console/IncidentView.jsx";
import Sidebar from "../components/console/Sidebar.jsx";
import { StatusPill, timeLabel } from "../components/console/shared.jsx";

const TITLES = {
  dashboard: "Operations overview",
  incident: "Incident command",
  audit: "Audit log",
  access: "Access log",
};

export default function Console() {
  const [health, setHealth] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [incident, setIncident] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [catalog, setCatalog] = useState([]);
  const [connection, setConnection] = useState("connecting");
  const [llmMode, setLlmMode] = useState("REPLAY");
  const [elapsed, setElapsed] = useState(0);

  const refreshIncidents = useCallback(async () => {
    try {
      const rows = await api.incidents();
      setIncidents(rows);
      if (rows.length) {
        setSelectedId((current) => current || rows[0].id);
      }
    } catch (error) {
      setNotice(`Backend unavailable: ${error.message}`);
    }
  }, []);

  const refreshHealth = useCallback(async () => {
    try {
      const value = await api.health();
      setHealth(value);
      const mode = value.llm_mode?.mode || value.llm_mode || "REPLAY";
      setLlmMode(String(mode).toUpperCase());
      setChartData((current) => [...current, {
        time: timeLabel(),
        error_rate: Number(value.error_rate || 0) * 100,
        p95_ms: Number(value.p95_ms || 0),
      }].slice(-40));
    } catch (error) {
      setNotice(`Health summary unavailable: ${error.message}`);
    }
  }, []);

  const refreshIncident = useCallback(async (id = selectedId) => {
    if (!id) {
      setIncident(null);
      return;
    }
    try {
      setIncident(await api.incident(id));
    } catch (error) {
      if (/not found/i.test(error.message)) {
        // Deleted by a reset from elsewhere: drop the selection quietly.
        setIncident(null);
        setSelectedId((current) => (Number(current) === Number(id) ? null : current));
        return;
      }
      setNotice(`Could not load incident: ${error.message}`);
    }
  }, [selectedId]);

  useEffect(() => {
    refreshIncidents();
    refreshHealth();
    api.catalog().then(setCatalog).catch(() => {});
    const timer = window.setInterval(() => {
      refreshHealth();
      refreshIncidents();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [refreshHealth, refreshIncidents]);

  useEffect(() => {
    refreshIncident(selectedId);
  }, [selectedId, refreshIncident]);

  // Portal task progress is published inside the RPA worker process and never
  // reaches this page's event stream, so poll the open incident as well.
  useEffect(() => {
    if (!selectedId) return undefined;
    const timer = window.setInterval(() => refreshIncident(selectedId), 5000);
    return () => window.clearInterval(timer);
  }, [selectedId, refreshIncident]);

  useEffect(() => {
    const openedAt = incident?.incident?.opened_at;
    const resolved = Number(incident?.incident?.mttr_s);
    if (Number.isFinite(resolved) && resolved > 0) {
      setElapsed(resolved);
      return undefined;
    }
    if (!openedAt) {
      setElapsed(0);
      return undefined;
    }
    const update = () => {
      const start = new Date(openedAt).getTime();
      if (Number.isFinite(start)) setElapsed(Math.max(0, (Date.now() - start) / 1000));
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [incident]);

  const handleEvent = useCallback((event) => {
    const { type, data } = event || {};
    if (type === "llm_mode") setLlmMode(String(data?.mode || "REPLAY").toUpperCase());
    if (type === "metrics") {
      setChartData((current) => [...current, {
        time: timeLabel(),
        error_rate: Number(data?.error_rate || 0) * 100,
        p95_ms: Number(data?.p95_ms || 0),
      }].slice(-40));
      setHealth((current) => current ? {
        ...current,
        error_rate: data?.error_rate ?? current.error_rate,
        p95_ms: data?.p95_ms ?? current.p95_ms,
        services: {
          ...current.services,
          db: data?.db_status === "ok" ? "healthy" : (data?.db_status || current.services?.db),
          worker: data?.worker_status || current.services?.worker,
          disk: Number(data?.disk_used_pct) >= 100 ? "down"
            : Number(data?.disk_used_pct) >= 90 ? "degraded" : "healthy",
          payment: data?.payment_status === "ok" ? "healthy" : (data?.payment_status || current.services?.payment),
        },
      } : current);
    }
    if (type === "incident_updated" && data?.status === "reset") {
      setIncident(null);
      setSelectedId(null);
      refreshIncidents();
      return;
    }
    if (type === "incident_escalated") setActiveTab("incident");
    if (["incident_opened", "incident_updated", "incident_resolved", "incident_escalated"].includes(type)) {
      refreshIncidents();
      if (data?.incident_id) {
        setSelectedId(data.incident_id);
        refreshIncident(data.incident_id);
      }
    } else if (data?.incident_id && Number(data.incident_id) === Number(selectedId)) {
      refreshIncident(selectedId);
    }
  }, [refreshIncident, refreshIncidents, selectedId]);

  const sseConnection = useSSE(handleEvent);
  useEffect(() => setConnection(sseConnection), [sseConnection]);

  useEffect(() => {
    const approveListener = async (event) => {
      try {
        await api.approve(event.detail);
        setNotice("Approval recorded. The agent is resuming.");
        await refreshIncident();
      } catch (error) {
        setNotice(`Approval failed: ${error.message}`);
      }
    };
    const rejectListener = async (event) => {
      try {
        await api.reject(event.detail);
        setNotice("Rejection recorded. The agent will replan or escalate.");
        await refreshIncident();
      } catch (error) {
        setNotice(`Rejection failed: ${error.message}`);
      }
    };
    const acceptEscalationListener = async (event) => {
      setBusy(true);
      try {
        await api.decideEscalation(event.detail, "accepted");
        setNotice("Accepted. The sandbox is healthy and the incident is resolved.");
        await refreshIncident();
        await refreshIncidents();
        await refreshHealth();
      } catch (error) {
        setNotice(`Could not resolve incident: ${error.message}`);
      } finally {
        setBusy(false);
      }
    };
    const rejectEscalationListener = async (event) => {
      setBusy(true);
      try {
        await api.decideEscalation(event.detail, "rejected");
        setNotice("Rejected. The sandbox and escalated incident are unchanged.");
        await refreshIncident();
      } catch (error) {
        setNotice(`Could not record decision: ${error.message}`);
      } finally {
        setBusy(false);
      }
    };
    window.addEventListener("autoheal-approve", approveListener);
    window.addEventListener("autoheal-reject", rejectListener);
    window.addEventListener("autoheal-escalation-accept", acceptEscalationListener);
    window.addEventListener("autoheal-escalation-reject", rejectEscalationListener);
    return () => {
      window.removeEventListener("autoheal-approve", approveListener);
      window.removeEventListener("autoheal-reject", rejectListener);
      window.removeEventListener("autoheal-escalation-accept", acceptEscalationListener);
      window.removeEventListener("autoheal-escalation-reject", rejectEscalationListener);
    };
  }, [refreshIncident, refreshIncidents, refreshHealth]);

  const inject = async (scenario, random = false) => {
    setBusy(true);
    setNotice(random ? "Injecting a hidden random sandbox fault…" : `Injecting ${scenario}…`);
    try {
      const result = random ? await api.injectFault("random") : await api.demo(scenario);
      if (result.incident_id) setSelectedId(result.incident_id);
      setActiveTab("incident");
      setNotice(result.detail || "SANDBOX fault injected.");
      await refreshIncidents();
      await refreshHealth();
    } catch (error) {
      setNotice(`Fault injection failed: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      await api.reset();
      setIncident(null);
      setSelectedId(null);
      setNotice("SANDBOX reset. Incident state cleared.");
      await refreshIncidents();
      await refreshHealth();
    } catch (error) {
      setNotice(`Reset failed: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const activeIncident = incidents.find((item) => Number(item.id) === Number(selectedId));
  const mttr = incident?.incident?.mttr_s ?? elapsed;

  const { session, accessLog } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const goTab = (tab) => {
    setActiveTab(tab);
    setDrawerOpen(false);
  };
  const accessEntries = activeTab === "access" ? accessLog() : [];

  return (
    <div className="frame app-shell">
      <ConsoleHeader
        llmMode={llmMode}
        connection={connection}
        activeTab={activeTab}
        setActiveTab={goTab}
        onMenu={() => setDrawerOpen(true)}
        menuOpen={drawerOpen}
      />
      <div className="workspace">
        <Sidebar
          open={drawerOpen}
          onClose={closeDrawer}
          activeTab={activeTab}
          setActiveTab={goTab}
          incidents={incidents}
          selectedId={selectedId}
          onSelectIncident={(id) => { setSelectedId(id); goTab("incident"); }}
          catalog={catalog}
        />

        <main className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">MEND · AGENTIC AUTO-HEAL · {session?.tenant.name}</div>
              <h1 className="display">{TITLES[activeTab]}</h1>
            </div>
            <div className="header-actions">
              <span className="endpoint">{API_BASE}</span>
              <a className="text-link" href={PORTAL_URL} target="_blank" rel="noreferrer">Legacy portal ↗</a>
            </div>
          </div>

          {/* A CSS fade on a keyed panel: the new tab is in the DOM at once, where a
              scripted exit-then-enter left the page blank until the animation ran. */}
          <div key={activeTab} className="tab-panel">
              {activeTab === "dashboard" && (
                <Dashboard
                  health={health}
                  chartData={chartData}
                  mttr={mttr}
                  onFault={(fault) => inject(fault)}
                  onRandom={() => inject("random", true)}
                  onReset={reset}
                  busy={busy}
                />
              )}
              {activeTab === "dashboard" && activeIncident && (
                <section className="panel current-incident-strip">
                  <div><div className="eyebrow">CURRENT INCIDENT</div><b>INC-{activeIncident.id} · {activeIncident.title}</b></div>
                  <StatusPill value={activeIncident.status} />
                  <button className="small-button" onClick={() => goTab("incident")}>Open incident room →</button>
                </section>
              )}
              {activeTab === "incident" && (
                <div className="incident-selector-row">
                  {incidents.length > 1 && (
                    <label className="incident-select">Incident
                      <select className="select" value={selectedId || ""} onChange={(event) => setSelectedId(event.target.value)}>
                        {incidents.map((item) => <option value={item.id} key={item.id}>INC-{item.id} · {item.title}</option>)}
                      </select>
                    </label>
                  )}
                  <button className="small-button" onClick={() => refreshIncident()}>Refresh incident</button>
                </div>
              )}
              {activeTab === "incident" && <IncidentView incident={incident} onRefresh={() => refreshIncident()} busy={busy} />}
              {activeTab === "audit" && (
                <section className="panel">
                  <div className="panel-heading">
                    <div><div className="eyebrow">CHRONOLOGICAL RECORD</div><h2>Incident audit log</h2></div>
                    {incidents.length > 0 && (
                      <select className="select" value={selectedId || ""} onChange={(event) => setSelectedId(event.target.value)}>
                        {incidents.map((item) => <option value={item.id} key={item.id}>INC-{item.id} · {item.title}</option>)}
                      </select>
                    )}
                  </div>
                  <AuditLog incident={incident} />
                </section>
              )}
              {activeTab === "access" && (
                <section className="panel">
                  <div className="panel-heading">
                    <div><div className="eyebrow">WORKSPACE SIGN-INS · DEMO AUTH</div><h2>{session?.tenant.name} access log</h2></div>
                    <span>{accessEntries.length} events</span>
                  </div>
                  <AccessLog entries={accessEntries} />
                </section>
              )}
          </div>

          <footer className="main-footer">
            <span>Everything shown here runs in a local SANDBOX.</span>
            <span>Catalog entries: {catalog.length} · Live event stream: {connection}</span>
          </footer>
        </main>
      </div>

      <AnimatePresence>
        {notice && (
          <motion.div
            className="notice"
            role="status"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.22 }}
          >
            <span>{notice}</span>
            <button type="button" aria-label="Dismiss" onClick={() => setNotice("")}>×</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
