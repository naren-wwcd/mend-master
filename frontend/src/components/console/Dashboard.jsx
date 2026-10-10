import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FAULTS, StatusPill, formatDuration } from "./shared.jsx";

function HealthTile({ name, value, subtitle }) {
  return (
    <div className="health-tile">
      <div className="tile-heading"><span className="service-dot" />{name}</div>
      <StatusPill value={value} />
      {subtitle && <div className="tile-subtitle">{subtitle}</div>}
    </div>
  );
}

function MetricChart({ title, unit, dataKey, data, color, suffix = "" }) {
  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <h3>{title}</h3>
        <span>{unit}</span>
      </div>
      {data.length < 2 ? (
        <div className="chart-empty">Waiting for live sandbox metrics…</div>
      ) : (
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="rgba(148,176,211,.16)" strokeDasharray="3 5" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: "rgba(190,207,231,.66)", fontSize: 11 }} />
              <YAxis tick={{ fill: "rgba(190,207,231,.66)", fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "#0b1220", border: "1px solid #40536e", borderRadius: 6, fontSize: 12 }}
                labelStyle={{ color: "#e6eefb", fontWeight: 700 }}
                formatter={(value) => [`${Number(value).toFixed(2)}${suffix}`, title]}
              />
              <Area
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                strokeWidth={2}
                fill={color}
                fillOpacity={0.1}
                isAnimationActive
                animationDuration={500}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

export default function Dashboard({ health, chartData, mttr, onFault, onRandom, onReset, busy }) {
  const services = health?.services || {};
  const overall = health?.overall || "DEGRADED";
  return (
    <>
      <section className={`status-banner ${overall.toLowerCase()}`}>
        <div>
          <div className="eyebrow">SANDBOX SERVICE STATUS</div>
          <h1>{overall}</h1>
          <p>{overall === "HEALTHY" ? "Checkout is responding within the recovery thresholds." : "The sandbox is being observed and investigated."}</p>
        </div>
        <div className="banner-metric">
          <span>INCIDENT MTTR</span>
          <strong>{formatDuration(mttr)}</strong>
        </div>
      </section>

      <section className="health-grid">
        <HealthTile name="APP" value={services.app} subtitle="ShopNode :8001" />
        <HealthTile name="DATABASE" value={services.db} />
        <HealthTile name="WORKER" value={services.worker} />
        <HealthTile name="DISK" value={services.disk} subtitle={`${Number(health?.disk_used_pct || 0).toFixed(0)}% used`} />
        <HealthTile name="PAYMENT" value={services.payment} />
      </section>

      <section className="charts-grid">
        <MetricChart title="Checkout error rate" unit="rolling window · %" dataKey="error_rate" data={chartData} color="#E8622C" suffix="%" />
        <MetricChart title="Checkout p95 latency" unit="rolling window · ms" dataKey="p95_ms" data={chartData} color="#12232E" suffix=" ms" />
      </section>

      <section className="panel break-panel">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">CONTROLLED FAILURE INJECTION</div>
            <h2>Break the sandbox</h2>
          </div>
          <button className="button danger-outline" disabled={busy} onClick={onReset}>Reset sandbox</button>
        </div>
        <div className="fault-grid">
          {FAULTS.map(([name, title, detail]) => (
            <button className="fault-button" key={name} disabled={busy} onClick={() => onFault(name)}>
              <span className="fault-symbol">+</span>
              <span><b>{title}</b><small>{detail}</small></span>
            </button>
          ))}
          <button className="fault-button random" disabled={busy} onClick={onRandom}>
            <span className="fault-symbol">?</span>
            <span><b>Random fault</b><small>Cause hidden from the agent</small></span>
          </button>
        </div>
        <p className="microcopy">Fault injection and remediation affect only this local SANDBOX.</p>
      </section>
    </>
  );
}
