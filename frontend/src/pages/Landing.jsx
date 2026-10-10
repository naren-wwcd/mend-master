import { Link } from "react-router-dom";
import HeroScene from "../components/HeroScene.jsx";
import Logo from "../components/Logo.jsx";
import Pricing from "../components/Pricing.jsx";
import Reveal from "../components/Reveal.jsx";
import SiteNav from "../components/SiteNav.jsx";
import { useAuth } from "../auth/AuthContext.jsx";

const HEADLINE = [
  <>Incidents that <span className="hl">mend</span></>,
  <>themselves, <span className="hl">guarded</span></>,
  <>by your team</>,
];

const FAULTS = ["Bad config", "Pool leak", "Disk full", "Payment down", "DB hung", "Compound failure"];

const STEPS = [
  ["Detect", "A watcher tracks checkout error rate and p95 latency, and opens an incident the moment they drift."],
  ["Diagnose", "The agent reads logs and metrics, keeps ranked hypotheses, and updates its confidence as evidence arrives."],
  ["Guard", "Every proposed fix is checked against a catalog. Low-risk fixes run; risky ones wait for your approval."],
  ["Mend", "The fix runs and is verified against live metrics. Anything unresolved is escalated with the evidence."],
];

const FEATURES = [
  ["Ranked hypotheses", "See every cause the agent is weighing, with the log lines for and against it.", "M4 16l4-5 3 3 5-8M4 4v14h14"],
  ["Guarded fix catalog", "Fixes come from a reviewed catalog with risk, blast radius and rollback written down.", "M11 3l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V6zM8 11l2 2 4-4"],
  ["Human approval", "High-risk actions stop at a review step until someone on your team says yes.", "M11 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM4 19c0-4 3-6 7-6s7 2 7 6"],
  ["Legacy portal automation", "A bot files and updates tickets in the old ITSM portal and attaches screenshots.", "M3 5h16v11H3zM3 9h16M8 19h6"],
  ["Full audit trail", "Each step, decision and approval is recorded in order, per incident.", "M5 5h12M5 10h12M5 15h7M16 14l2 2 3-4"],
  ["Escalation with evidence", "When Mend can't fix it, on-call gets the diagnosis and the next step to try.", "M11 3l8 15H3zM11 9v4M11 15.5v.5"],
];

export default function Landing() {
  const { session } = useAuth();
  const startPath = session ? "/app" : "/login?mode=signup";

  return (
    <div className="frame landing">
      <SiteNav />

      <main>
        <section className="hero">
          <p className="eyebrow hero-label">Introduction</p>
          <div className="hero-copy">
            <h1 className="display hero-title">
              {HEADLINE.map((line, index) => (
                <span className="line" key={index}>
                  <span style={{ "--i": index }}>{line}</span>
                </span>
              ))}
            </h1>
            <div className="hero-actions">
              <Link to={startPath} className="btn btn-primary">
                {session ? "Open console" : "Get started"} <span className="arrow" aria-hidden="true">→</span>
              </Link>
              <a href="#pricing" className="btn btn-ghost">See pricing</a>
            </div>
          </div>
          <p className="hero-intro">
            Mend watches your services, works out <span className="hl">what broke</span>, and applies
            a fix from a catalog you control. Risky steps wait for a human.
          </p>
          <HeroScene />
        </section>

        <div className="ticker" aria-hidden="true">
          <div className="ticker-track">
            {[0, 1].map((copy) => (
              <span key={copy}>
                {FAULTS.map((fault) => <i key={fault}>{fault}</i>)}
              </span>
            ))}
          </div>
        </div>

        <section id="how" className="section">
          <Reveal className="section-head">
            <p className="eyebrow">How it works</p>
            <h2 className="display">Four steps from <span className="hl">alert</span> to all-clear</h2>
          </Reveal>
          <ol className="steps">
            {STEPS.map(([title, text], index) => (
              <Reveal as="li" key={title} delay={index * 0.1} className="step">
                <span className="step-number">0{index + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        <section id="features" className="section">
          <Reveal className="section-head">
            <p className="eyebrow">Features</p>
            <h2 className="display">Automation you can <span className="hl">audit</span></h2>
          </Reveal>
          <div className="features">
            {FEATURES.map(([title, text, icon], index) => (
              <Reveal as="article" key={title} delay={(index % 3) * 0.08} className="feature">
                <span className="feature-icon">
                  <svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true">
                    <path d={icon} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <Pricing />

        <Reveal as="section" className="cta-band">
          <h2 className="display">Break something. <span className="hl">Watch it mend.</span></h2>
          <p>Sign in to the sandbox, inject a fault, and follow the agent from first alert to verified fix.</p>
          <Link to={startPath} className="btn btn-primary">
            {session ? "Open console" : "Try the sandbox"} <span className="arrow" aria-hidden="true">→</span>
          </Link>
        </Reveal>
      </main>

      <footer className="site-footer">
        <Logo size={22} wordmark />
        <nav aria-label="Footer">
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <Link to="/login">Sign in</Link>
        </nav>
        <p>Sandbox demo. Nothing here touches production.</p>
      </footer>
    </div>
  );
}
