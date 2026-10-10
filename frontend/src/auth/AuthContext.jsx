import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createStore } from "./store.js";

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const store = createStore(browserStorage());
const AuthContext = createContext(null);
const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const MESSAGES = {
  unknown_workspace: "We couldn't find that workspace.",
  bad_credentials: "That email and password don't match this workspace.",
  workspace_exists: "A workspace with that name already exists.",
  email_taken: "That email already has a Mend account. Use its current password.",
  not_a_member: "You don't have access to that workspace.",
  not_signed_in: "Sign in to continue.",
};
const FIELD_MESSAGES = {
  workspace: "Enter your workspace.",
  name: "Give the workspace a name with letters or numbers.",
  email: "Enter a valid email address.",
  password: "Use a password of at least 6 characters.",
};

export function authMessage(error) {
  if (error?.code === "invalid_input") return FIELD_MESSAGES[error.field] || "Check the form and try again.";
  return MESSAGES[error?.code] || "Something went wrong. Try again.";
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => store.getSession());
  // True after a deliberate sign-out, so the route guard sends people home, not to /login.
  const [signedOut, setSignedOut] = useState(false);

  useEffect(() => {
    const sync = () => setSession(store.getSession());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const signIn = useCallback(async (input) => {
    await wait(600);
    const next = store.signIn(input);
    setSignedOut(false);
    setSession(next);
    return next;
  }, []);

  const createWorkspace = useCallback(async (input) => {
    await wait(600);
    const next = store.createWorkspace(input);
    setSignedOut(false);
    setSession(next);
    return next;
  }, []);

  const switchTenant = useCallback((slug) => {
    try {
      const next = store.switchTenant(slug);
      setSession(next);
      return next;
    } catch {
      // The stored session or membership changed underneath us; show what is really there.
      const current = store.getSession();
      setSession(current);
      return current;
    }
  }, []);

  const signOut = useCallback(() => {
    store.signOut();
    setSignedOut(true);
    setSession(null);
  }, []);

  const value = useMemo(() => ({
    session,
    signedOut,
    tenants: session ? store.listTenantsFor(session.email) : [],
    allTenants: store.listTenants(),
    signIn,
    createWorkspace,
    switchTenant,
    signOut,
    accessLog: () => (session ? store.getAccessLog(session.tenant.slug) : []),
  }), [session, signedOut, signIn, createWorkspace, switchTenant, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
