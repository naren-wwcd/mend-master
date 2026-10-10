import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { MotionConfig, MotionGlobalConfig, motion } from "motion/react";
import { AuthProvider } from "./auth/AuthContext.jsx";
import RequireAuth from "./auth/RequireAuth.jsx";
import Console from "./pages/Console.jsx";
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import "./index.css";
import "./styles/auth.css";
import "./styles/console.css";
import "./styles/landing.css";

// reducedMotion="user" only drops transforms; the spec wants every transition instant.
if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
  MotionGlobalConfig.skipAnimations = true;
}

function Pages() {
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname, location.hash]);

  // Enter-only fade: an exit animation would keep the old route mounted, and a
  // stale RequireAuth there would redirect again after sign-out.
  return (
    <motion.div
      key={location.pathname}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      <Routes location={location}>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/app" element={<RequireAuth><Console /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </motion.div>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <MotionConfig reducedMotion="user">
        <AuthProvider>
          <Pages />
        </AuthProvider>
      </MotionConfig>
    </BrowserRouter>
  </React.StrictMode>,
);
