import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Logo from "./Logo.jsx";
import { useAuth } from "../auth/AuthContext.jsx";

const LINKS = [
  ["#how", "How it works"],
  ["#features", "Features"],
  ["#pricing", "Pricing"],
];

export default function SiteNav() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuButtonRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      menuButtonRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className={`site-nav ${scrolled ? "scrolled" : ""} ${open ? "open" : ""}`}>
      <Link to="/" className="logo-link" aria-label="Mend home">
        <Logo size={26} wordmark animated />
      </Link>
      <nav id="site-links" className="site-links" aria-label="Sections">
        {LINKS.map(([href, label]) => (
          <a key={href} href={href} onClick={() => setOpen(false)}>{label}</a>
        ))}
      </nav>
      <div className="site-actions">
        {session ? (
          <Link to="/app" className="btn btn-small btn-primary">
            Open console <span className="arrow" aria-hidden="true">→</span>
          </Link>
        ) : (
          <>
            <Link to="/login" className="btn btn-small btn-ghost site-signin">Sign in</Link>
            <Link to="/login?mode=signup" className="btn btn-small btn-primary">Get started</Link>
          </>
        )}
        <button
          ref={menuButtonRef}
          type="button"
          className="site-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="site-links"
          onClick={() => setOpen((value) => !value)}
        >
          <span /><span />
        </button>
      </div>
    </header>
  );
}
