import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import Logo from "../Logo.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { CONSOLE_TABS } from "./shared.jsx";

function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() || "")
    .join("");
}

export default function ConsoleHeader({ llmMode, connection, activeTab, setActiveTab, onMenu, menuOpen }) {
  const { session, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const tenantButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      tenantButtonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const tenant = session?.tenant;
  const liveModel = llmMode === "LIVE";
  const streaming = connection === "connected";

  return (
    <header className="topbar">
      <button
        className="menu-button"
        type="button"
        aria-label="Open navigation"
        aria-expanded={Boolean(menuOpen)}
        aria-controls="console-sidebar"
        onClick={onMenu}
      >
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <path d="M3 5h14M3 10h14M3 15h9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <Link to="/" className="brand" aria-label="Mend home">
        <Logo size={24} wordmark />
      </Link>
      <nav className="topnav" aria-label="Console sections">
        {CONSOLE_TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`nav-button ${activeTab === id ? "selected" : ""}`}
            aria-current={activeTab === id ? "page" : undefined}
            onClick={() => setActiveTab(id)}
          >
            {label}
            {activeTab === id && (
              <motion.span
                layoutId="nav-underline"
                className="nav-underline"
                transition={{ type: "spring", stiffness: 480, damping: 38 }}
              />
            )}
          </button>
        ))}
      </nav>
      <div className="badges">
        <dl className="status-strip" aria-label="Environment status">
          <div className="status-cell status-env">
            <dt>Env</dt>
            <dd><i className="status-mark hollow" aria-hidden="true" />Sandbox</dd>
          </div>
          <div className="status-cell">
            <dt>Agent</dt>
            <dd>
              <i className={`status-mark ${liveModel ? "good" : "warn"}`} aria-hidden="true" />
              {liveModel ? "Live model" : "Replay"}
            </dd>
          </div>
          <div className="status-cell">
            <dt>Stream</dt>
            <dd>
              <i className={`status-mark ${streaming ? "good beat" : "warn"}`} aria-hidden="true" />
              {streaming ? "Live" : connection}
            </dd>
          </div>
        </dl>
        <div className="tenant" ref={menuRef}>
          <button
            ref={tenantButtonRef}
            type="button"
            className="tenant-button"
            aria-expanded={open}
            aria-controls="tenant-menu"
            onClick={() => setOpen((value) => !value)}
          >
            <span className="tenant-avatar" aria-hidden="true">{initials(tenant?.name)}</span>
            <span className="tenant-text">
              <b>{tenant?.name}</b>
              <small>{tenant?.plan} plan</small>
            </span>
            <span className={`tenant-chevron ${open ? "open" : ""}`} aria-hidden="true">▾</span>
          </button>
          <AnimatePresence>
            {open && (
              <motion.div
                id="tenant-menu"
                className="tenant-menu"
                role="group"
                aria-label="Account"
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.16 }}
              >
                <dl className="account-info">
                  <div><dt>Signed in as</dt><dd>{session?.email}</dd></div>
                  <div><dt>Workspace</dt><dd>{tenant?.name}</dd></div>
                  <div><dt>Plan</dt><dd className="account-plan">{tenant?.plan}</dd></div>
                </dl>
                <button type="button" className="tenant-option tenant-signout" onClick={signOut}>
                  Sign out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
