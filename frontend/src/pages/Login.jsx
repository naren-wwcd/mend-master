import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import Logo from "../components/Logo.jsx";
import { authMessage, useAuth } from "../auth/AuthContext.jsx";
import { PLANS } from "../auth/store.js";

const TABS = [
  ["signin", "Sign in"],
  ["signup", "Create workspace"],
];

const PLAN_LABELS = {
  starter: ["Starter", "Free"],
  team: ["Team", "$49 / mo"],
  enterprise: ["Enterprise", "Custom"],
};

const WAVE_ROWS = [40, 90, 140, 190, 240, 290];

function wavePath(y) {
  let d = `M0 ${y} q50 -26 100 0`;
  for (let i = 0; i < 17; i += 1) d += " t100 0";
  return d;
}

export default function Login() {
  const { session, signIn, createWorkspace } = useAuth();
  const [params] = useSearchParams();
  const requestedPlan = params.get("plan");

  const [mode, setMode] = useState(params.get("mode") === "signup" ? "signup" : "signin");
  const [fields, setFields] = useState({
    workspace: "",
    name: "",
    email: "",
    password: "",
    plan: PLANS.includes(requestedPlan) ? requestedPlan : "starter",
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [shaking, setShaking] = useState(false);
  const tabRefs = useRef({});

  useEffect(() => {
    if (error?.field) document.getElementById(`auth-${error.field}`)?.focus();
  }, [error]);

  if (session) return <Navigate to="/app" replace />;

  const set = (name) => (event) => {
    setFields((current) => ({ ...current, [name]: event.target.value }));
    if (error) setError(null);
  };

  const switchMode = (next) => {
    if (busy) return;
    setMode(next);
    setError(null);
  };

  const onTabKey = (event) => {
    let next;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") next = mode === "signin" ? "signup" : "signin";
    else if (event.key === "Home") next = "signin";
    else if (event.key === "End") next = "signup";
    else return;
    event.preventDefault();
    if (busy) return;
    switchMode(next);
    tabRefs.current[next]?.focus();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "signin") {
        await signIn({ workspace: fields.workspace, email: fields.email, password: fields.password });
      } else {
        await createWorkspace({
          name: fields.name, email: fields.email, password: fields.password, plan: fields.plan,
        });
      }
      // On success the session updates and the <Navigate> above takes over.
    } catch (failure) {
      setError({ message: authMessage(failure), field: failure?.field || null });
      // Timed, not onAnimationEnd: that event never fires in a background tab.
      setShaking(true);
      window.setTimeout(() => setShaking(false), 450);
      setBusy(false);
    }
  };

  const invalid = (name) => (error?.field === name ? "true" : undefined);

  return (
    <div className="frame auth">
      <aside className="auth-brand">
        <Link to="/" className="logo-link" aria-label="Mend home">
          <Logo size={30} wordmark animated />
        </Link>
        <div className="auth-brand-copy">
          <p className="eyebrow">Workspace access</p>
          <h2 className="display">
            Your on-call, <span className="hl">mended</span> before you wake.
          </h2>
          <ul>
            <li>Every workspace is its own tenant</li>
            <li>Risky fixes wait for a human</li>
            <li>Each sign-in lands in the access log</li>
          </ul>
        </div>
        <svg className="auth-waves" viewBox="0 0 1800 330" preserveAspectRatio="none" aria-hidden="true">
          {WAVE_ROWS.map((y, index) => (
            <path key={y} d={wavePath(y)} className={index === 2 ? "accent" : undefined} />
          ))}
        </svg>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <Link to="/" className="auth-back">← Back to site</Link>
          <h1 className="auth-title">{mode === "signin" ? "Sign in to Mend" : "Create your workspace"}</h1>

          <div className="tabs" role="tablist" aria-label="Account" onKeyDown={onTabKey}>
            {TABS.map(([id, label]) => (
              <button
                key={id}
                ref={(node) => { tabRefs.current[id] = node; }}
                type="button"
                role="tab"
                id={`auth-tab-${id}`}
                aria-selected={mode === id}
                aria-controls="auth-panel"
                tabIndex={mode === id ? 0 : -1}
                className="tab"
                onClick={() => switchMode(id)}
              >
                {mode === id && (
                  <motion.span
                    layoutId="auth-pill"
                    className="tab-pill"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                {label}
              </button>
            ))}
          </div>

          <form
            id="auth-panel"
            role="tabpanel"
            aria-labelledby={`auth-tab-${mode}`}
            className={`auth-form${shaking ? " shake" : ""}`}
            onSubmit={submit}
            noValidate
          >
            <div className="auth-fields" key={mode}>
              {mode === "signin" ? (
                <label className="field">
                  <span>Workspace</span>
                  <input
                    id="auth-workspace"
                    value={fields.workspace}
                    onChange={set("workspace")}
                    placeholder="your-workspace"
                    autoComplete="organization"
                    autoCapitalize="none"
                    spellCheck="false"
                    aria-invalid={invalid("workspace")}
                  />
                </label>
              ) : (
                <label className="field">
                  <span>Workspace name</span>
                  <input
                    id="auth-name"
                    value={fields.name}
                    onChange={set("name")}
                    placeholder="Blue Harbor"
                    autoComplete="organization"
                    aria-invalid={invalid("name")}
                  />
                </label>
              )}

              <label className="field">
                <span>Work email</span>
                <input
                  id="auth-email"
                  type="email"
                  value={fields.email}
                  onChange={set("email")}
                  placeholder="you@company.com"
                  autoComplete="email"
                  aria-invalid={invalid("email")}
                />
              </label>

              <label className="field">
                <span>Password</span>
                <input
                  id="auth-password"
                  type="password"
                  value={fields.password}
                  onChange={set("password")}
                  placeholder={mode === "signup" ? "At least 6 characters" : "••••••••"}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  aria-invalid={invalid("password")}
                />
              </label>

              {mode === "signup" && (
                <fieldset className="plan-picker">
                  <legend>Plan</legend>
                  {PLANS.map((plan) => (
                    <label key={plan} className="plan-radio">
                      <input
                        type="radio"
                        name="plan"
                        value={plan}
                        checked={fields.plan === plan}
                        onChange={set("plan")}
                      />
                      <span>
                        <b>{PLAN_LABELS[plan][0]}</b>
                        <small>{PLAN_LABELS[plan][1]}</small>
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
            </div>

            <p className="form-error" role="alert">{error?.message}</p>

            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              {busy && <span className="spinner" aria-hidden="true" />}
              {busy
                ? (mode === "signin" ? "Signing in" : "Creating workspace")
                : (mode === "signin" ? "Sign in" : "Create workspace")}
              {!busy && <span className="arrow" aria-hidden="true">→</span>}
            </button>

          </form>
        </div>
      </main>
    </div>
  );
}
