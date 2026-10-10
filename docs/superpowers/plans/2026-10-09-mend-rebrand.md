# Mend Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the AutoHeal Ops dashboard into Mend: an animated landing page with pricing, demo multi-tenant sign-in, and the existing console, all in the cream / navy / orange style of `ref/refv.mp4`.

**Architecture:** React Router gives three routes (`/`, `/login`, `/app`). A pure, storage-injected auth store (`auth/store.js`) holds tenants, session and access log, wrapped by a React context. The current `App.jsx` is split into `pages/Console.jsx` plus view components, keeping class names so the reskin is mostly CSS. Looping illustration motion is CSS on inline SVG; React-level transitions use `motion`.

**Tech Stack:** Vite 5, React 18, `react-router-dom` 6, `motion` (`motion/react`), Recharts, plain CSS (Tailwind stays installed but only its base layer is used), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-09-mend-rebrand-design.md`

**Deviation from the spec:** `jsdom` is not installed. The auth store is pure and takes its storage as a parameter, so Vitest's default `node` environment is enough.

**A note on the visual tasks:** Tasks 1 and 3 (logic) carry complete code. Tasks 2 and 4 to 7 (markup and CSS) specify exact file names, component signatures, class names, tokens, keyframes and acceptance checks, but not every line of markup and CSS; those are judged in the browser, not by unit tests.

## Global Constraints

- All commands run from `frontend/`.
- No changes under `backend/`, `itsm_portal/`, `rpa/`, `sandbox_app/`. `src/api.js` and `src/hooks/useSSE.js` stay byte-identical.
- Colour tokens: paper `#F5F1EC`, ink `#12232E`, accent `#E8622C`, good `#1F8A5B`, warn `#B7791F`, bad `#C8372D`; line is ink at 14%, muted is ink at 60%.
- Fonts: Bricolage Grotesque 700/800 (headings, uppercase), Plus Jakarta Sans 400 to 700 (body), JetBrains Mono 400/500 (labels).
- Storage keys: `mend.tenants`, `mend.session`, `mend.accessLog`.
- Demo user: `ops@mend.test` / `mend-demo`, member of `acme`, `northwind`, `globex`.
- Prices: Starter $0; Team $49 monthly, $39 per month billed yearly; Enterprise "Custom".
- Breakpoints: 1100px, 800px, 580px. Minimum width 320px with no horizontal scroll.
- Every animation stops or becomes instant under `prefers-reduced-motion: reduce`.
- No glows or gradients on panels; hairline ink borders.
- Do not commit `ref/`; `frontend/package-lock.json` is committed with Task 1.

## Review Focus

Inputs the spec implies but does not spell out, most likely first. Each is pinned by a test in Task 1.

1. Workspace typed as a name or with odd case and spaces (`" ACME "`, `"Acme Retail"`): signs in to `acme`.
2. Email with capitals or surrounding spaces (`" Ops@Mend.Test "`): treated as the same user.
3. A stored session whose tenant no longer exists (tenants key cleared or corrupted): `getSession()` returns `null`, no crash.
4. A new workspace name that slugifies to nothing (`"!!!"`) or collides with an existing one by case (`"ACME"`): `invalid_input` / `workspace_exists`.
5. An unknown `plan` value (from a hand-edited `?plan=` URL): the workspace is created on `starter`.

---

### Task 1: Tooling and auth store

**Files:**
- Modify: `frontend/package.json`, `frontend/vite.config.js`
- Create: `frontend/src/auth/store.js`
- Test: `frontend/src/auth/store.test.js`

**Interfaces:**
- Produces: `createStore(storage, now?)` returning `{ listTenants, listTenantsFor, signIn, createWorkspace, switchTenant, signOut, getSession, getAccessLog }`; `AuthError` with `.code` and `.field`; constants `KEYS`, `LOG_LIMIT`, `DEMO_USER`, `PLANS`.
- Error codes: `invalid_input`, `unknown_workspace`, `bad_credentials`, `workspace_exists`, `not_signed_in`, `not_a_member`.
- Session: `{ email, tenant: { slug, name, plan }, signedInAt }`. Log entry: `{ ts, tenant, email, event, detail }`.

- [ ] **Step 1: Install dependencies and add the test script**

```bash
npm install react-router-dom@6 motion
npm install -D vitest
```

In `package.json` scripts add `"test": "vitest run"`. In `vite.config.js` add `test: { environment: "node", include: ["src/**/*.test.js"] }` to the config object.

- [ ] **Step 2: Write the failing tests**

`src/auth/store.test.js`:

```js
import { describe, it, expect } from "vitest";
import { createStore, DEMO_USER, KEYS, LOG_LIMIT } from "./store.js";

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}

function codeOf(fn) {
  try { fn(); } catch (error) { return error.code; }
  return null;
}

const demo = { workspace: "acme", ...DEMO_USER };

describe("tenants", () => {
  it("seeds three tenants without exposing users", () => {
    const store = createStore(fakeStorage());
    expect(store.listTenants()).toEqual([
      { slug: "acme", name: "Acme Retail", plan: "team" },
      { slug: "northwind", name: "Northwind Logistics", plan: "starter" },
      { slug: "globex", name: "Globex Health", plan: "enterprise" },
    ]);
  });

  it("falls back to seeds when stored tenants are corrupt", () => {
    const store = createStore(fakeStorage({ [KEYS.tenants]: "{not json" }));
    expect(store.listTenants()).toHaveLength(3);
  });

  it("works when storage throws on every call", () => {
    const broken = {
      getItem() { throw new Error("denied"); },
      setItem() { throw new Error("denied"); },
      removeItem() { throw new Error("denied"); },
    };
    const store = createStore(broken);
    expect(store.listTenants()).toHaveLength(3);
    expect(store.getSession()).toBeNull();
    expect(store.signIn(demo).tenant.slug).toBe("acme");
  });
});

describe("signIn", () => {
  it("returns and persists a session", () => {
    const storage = fakeStorage();
    const store = createStore(storage, () => "2026-10-09T10:00:00.000Z");
    const session = store.signIn(demo);
    expect(session).toEqual({
      email: "ops@mend.test",
      tenant: { slug: "acme", name: "Acme Retail", plan: "team" },
      signedInAt: "2026-10-09T10:00:00.000Z",
    });
    expect(createStore(storage).getSession()).toEqual(session);
  });

  it("accepts the workspace by name, case and spacing", () => {
    const store = createStore(fakeStorage());
    expect(store.signIn({ ...demo, workspace: " ACME " }).tenant.slug).toBe("acme");
    expect(store.signIn({ ...demo, workspace: "Acme Retail" }).tenant.slug).toBe("acme");
  });

  it("normalises the email", () => {
    const store = createStore(fakeStorage());
    expect(store.signIn({ ...demo, email: " Ops@Mend.Test " }).email).toBe("ops@mend.test");
  });

  it("rejects an unknown workspace without logging", () => {
    const store = createStore(fakeStorage());
    expect(codeOf(() => store.signIn({ ...demo, workspace: "nope" }))).toBe("unknown_workspace");
    expect(store.getAccessLog("nope")).toEqual([]);
  });

  it("rejects a bad password and logs the failure to that workspace", () => {
    const store = createStore(fakeStorage());
    expect(codeOf(() => store.signIn({ ...demo, password: "wrong" }))).toBe("bad_credentials");
    expect(store.getSession()).toBeNull();
    expect(store.getAccessLog("acme")[0]).toMatchObject({
      event: "sign_in_failed", email: "ops@mend.test", tenant: "acme",
    });
  });

  it("rejects missing fields and names the field", () => {
    const store = createStore(fakeStorage());
    try {
      store.signIn({ ...demo, email: "  " });
      throw new Error("expected a throw");
    } catch (error) {
      expect(error.code).toBe("invalid_input");
      expect(error.field).toBe("email");
    }
  });
});

describe("createWorkspace", () => {
  const input = { name: "Blue Harbor", email: "kai@blueharbor.test", password: "harbor-1", plan: "team" };

  it("creates the tenant, signs in and logs it", () => {
    const store = createStore(fakeStorage());
    const session = store.createWorkspace(input);
    expect(session.tenant).toEqual({ slug: "blue-harbor", name: "Blue Harbor", plan: "team" });
    expect(store.listTenants()).toHaveLength(4);
    expect(store.getAccessLog("blue-harbor")[0].event).toBe("workspace_created");
    store.signOut();
    expect(store.signIn({ workspace: "blue-harbor", email: input.email, password: input.password }).tenant.slug)
      .toBe("blue-harbor");
  });

  it("rejects a name that collides by case", () => {
    const store = createStore(fakeStorage());
    expect(codeOf(() => store.createWorkspace({ ...input, name: "ACME" }))).toBe("workspace_exists");
    expect(codeOf(() => store.createWorkspace({ ...input, name: "acme retail" }))).toBe("workspace_exists");
  });

  it("rejects a name with no usable characters, a bad email and a short password", () => {
    const store = createStore(fakeStorage());
    expect(codeOf(() => store.createWorkspace({ ...input, name: "!!!" }))).toBe("invalid_input");
    expect(codeOf(() => store.createWorkspace({ ...input, email: "kai" }))).toBe("invalid_input");
    expect(codeOf(() => store.createWorkspace({ ...input, password: "12345" }))).toBe("invalid_input");
  });

  it("falls back to starter for an unknown plan", () => {
    const store = createStore(fakeStorage());
    expect(store.createWorkspace({ ...input, plan: "platinum" }).tenant.plan).toBe("starter");
  });
});

describe("session, switching and sign-out", () => {
  it("returns null when the session's tenant no longer exists", () => {
    const storage = fakeStorage();
    const store = createStore(storage);
    store.createWorkspace({ name: "Gone Co", email: "a@gone.test", password: "secret-1", plan: "starter" });
    storage.removeItem(KEYS.tenants);
    expect(createStore(storage).getSession()).toBeNull();
  });

  it("lists only the tenants the email belongs to", () => {
    const store = createStore(fakeStorage());
    store.createWorkspace({ name: "Solo", email: "me@solo.test", password: "secret-1", plan: "starter" });
    expect(store.listTenantsFor("me@solo.test").map((t) => t.slug)).toEqual(["solo"]);
    expect(store.listTenantsFor(DEMO_USER.email)).toHaveLength(3);
  });

  it("switches between memberships and logs it on the target", () => {
    const store = createStore(fakeStorage());
    store.signIn(demo);
    expect(store.switchTenant("globex").tenant.slug).toBe("globex");
    expect(store.getSession().tenant.slug).toBe("globex");
    expect(store.getAccessLog("globex")[0]).toMatchObject({ event: "tenant_switch", detail: "Switched from Acme Retail" });
  });

  it("refuses to switch to a tenant the user is not in, or when signed out", () => {
    const store = createStore(fakeStorage());
    expect(codeOf(() => store.switchTenant("acme"))).toBe("not_signed_in");
    store.createWorkspace({ name: "Solo", email: "me@solo.test", password: "secret-1", plan: "starter" });
    expect(codeOf(() => store.switchTenant("acme"))).toBe("not_a_member");
    expect(store.getSession().tenant.slug).toBe("solo");
  });

  it("signs out, logs it and clears the session", () => {
    const store = createStore(fakeStorage());
    store.signIn(demo);
    store.signOut();
    expect(store.getSession()).toBeNull();
    expect(store.getAccessLog("acme").map((e) => e.event)).toEqual(["sign_out", "sign_in"]);
  });

  it("keeps only the latest entries per tenant", () => {
    let tick = 0;
    const store = createStore(fakeStorage(), () => `t${String(tick++).padStart(4, "0")}`);
    for (let i = 0; i < LOG_LIMIT + 5; i += 1) {
      try { store.signIn({ ...demo, password: "wrong" }); } catch { /* expected */ }
    }
    const log = store.getAccessLog("acme");
    expect(log).toHaveLength(LOG_LIMIT);
    expect(log[0].ts).toBe(`t${String(LOG_LIMIT + 4).padStart(4, "0")}`);
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `npm test`
Expected: FAIL, cannot resolve `./store.js`.

- [ ] **Step 4: Implement the store**

`src/auth/store.js`:

```js
export const KEYS = { tenants: "mend.tenants", session: "mend.session", log: "mend.accessLog" };
export const LOG_LIMIT = 200;
export const PLANS = ["starter", "team", "enterprise"];
export const DEMO_USER = { email: "ops@mend.test", password: "mend-demo" };

const SEED_TENANTS = [
  { slug: "acme", name: "Acme Retail", plan: "team" },
  { slug: "northwind", name: "Northwind Logistics", plan: "starter" },
  { slug: "globex", name: "Globex Health", plan: "enterprise" },
];

export class AuthError extends Error {
  constructor(code, field = null) {
    super(code);
    this.name = "AuthError";
    this.code = code;
    this.field = field;
  }
}

export function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}

const normaliseEmail = (value) => String(value ?? "").trim().toLowerCase();
const publicTenant = ({ slug, name, plan }) => ({ slug, name, plan });
const isMember = (tenant, email) => tenant.users.some((user) => user.email === email);

function isTenant(value) {
  return Boolean(value) && typeof value.slug === "string" && typeof value.name === "string"
    && PLANS.includes(value.plan) && Array.isArray(value.users);
}

/** Demo-only auth: everything lives in the given storage, passwords included. */
export function createStore(storage, now = () => new Date().toISOString()) {
  let backing = storage || memoryStorage();

  function read(key, fallback) {
    try {
      const raw = backing.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    const text = JSON.stringify(value);
    try {
      backing.setItem(key, text);
    } catch {
      backing = memoryStorage();
      backing.setItem(key, text);
    }
  }

  function loadTenants() {
    const stored = read(KEYS.tenants, null);
    if (Array.isArray(stored) && stored.length > 0 && stored.every(isTenant)) return stored;
    const seeded = SEED_TENANTS.map((tenant) => ({ ...tenant, users: [{ ...DEMO_USER }] }));
    write(KEYS.tenants, seeded);
    return seeded;
  }

  function log(slug, email, event, detail) {
    const stored = read(KEYS.log, {});
    const all = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
    const entries = Array.isArray(all[slug]) ? all[slug] : [];
    all[slug] = [...entries, { ts: now(), tenant: slug, email, event, detail }].slice(-LOG_LIMIT);
    write(KEYS.log, all);
  }

  function startSession(tenant, email) {
    const session = { email, tenant: publicTenant(tenant), signedInAt: now() };
    write(KEYS.session, session);
    return session;
  }

  function getSession() {
    const stored = read(KEYS.session, null);
    if (!stored || typeof stored.email !== "string" || typeof stored.tenant?.slug !== "string") return null;
    const tenant = loadTenants().find((item) => item.slug === stored.tenant.slug);
    if (!tenant || !isMember(tenant, stored.email)) return null;
    return { email: stored.email, tenant: publicTenant(tenant), signedInAt: stored.signedInAt };
  }

  return {
    getSession,

    listTenants: () => loadTenants().map(publicTenant),

    listTenantsFor(email) {
      const wanted = normaliseEmail(email);
      return loadTenants().filter((tenant) => isMember(tenant, wanted)).map(publicTenant);
    },

    signIn({ workspace, email, password } = {}) {
      const wanted = slugify(workspace);
      const address = normaliseEmail(email);
      const secret = String(password ?? "");
      if (!wanted) throw new AuthError("invalid_input", "workspace");
      if (!address) throw new AuthError("invalid_input", "email");
      if (!secret) throw new AuthError("invalid_input", "password");

      const tenant = loadTenants().find((item) => item.slug === wanted || slugify(item.name) === wanted);
      if (!tenant) throw new AuthError("unknown_workspace", "workspace");

      const matches = tenant.users.some((user) => user.email === address && user.password === secret);
      if (!matches) {
        log(tenant.slug, address, "sign_in_failed", "Wrong email or password");
        throw new AuthError("bad_credentials");
      }
      log(tenant.slug, address, "sign_in", "Signed in");
      return startSession(tenant, address);
    },

    createWorkspace({ name, email, password, plan } = {}) {
      const title = String(name ?? "").trim();
      const slug = slugify(title);
      const address = normaliseEmail(email);
      const secret = String(password ?? "");
      if (!slug) throw new AuthError("invalid_input", "name");
      if (!/^\S+@\S+\.\S+$/.test(address)) throw new AuthError("invalid_input", "email");
      if (secret.length < 6) throw new AuthError("invalid_input", "password");

      const tenants = loadTenants();
      if (tenants.some((item) => item.slug === slug || slugify(item.name) === slug)) {
        throw new AuthError("workspace_exists", "name");
      }
      const tenant = {
        slug,
        name: title,
        plan: PLANS.includes(plan) ? plan : "starter",
        users: [{ email: address, password: secret }],
      };
      write(KEYS.tenants, [...tenants, tenant]);
      log(slug, address, "workspace_created", `Created on the ${tenant.plan} plan`);
      return startSession(tenant, address);
    },

    switchTenant(slug) {
      const session = getSession();
      if (!session) throw new AuthError("not_signed_in");
      const tenant = loadTenants().find((item) => item.slug === slug);
      if (!tenant || !isMember(tenant, session.email)) throw new AuthError("not_a_member");
      if (tenant.slug === session.tenant.slug) return session;
      log(tenant.slug, session.email, "tenant_switch", `Switched from ${session.tenant.name}`);
      return startSession(tenant, session.email);
    },

    signOut() {
      const session = getSession();
      if (session) log(session.tenant.slug, session.email, "sign_out", "Signed out");
      try {
        backing.removeItem(KEYS.session);
      } catch {
        backing = memoryStorage();
      }
    },

    getAccessLog(slug) {
      const stored = read(KEYS.log, {});
      const entries = stored && Array.isArray(stored[slug]) ? stored[slug] : [];
      return [...entries].reverse();
    },
  };
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.js frontend/src/auth
git commit -m "Add demo tenant auth store with tests"
```

---

### Task 2: Design tokens, fonts and logo

**Files:**
- Modify: `frontend/index.html`, `frontend/src/index.css`, `frontend/tailwind.config.js`
- Create: `frontend/src/components/Logo.jsx`, `frontend/public/favicon.svg`

**Interfaces:**
- Produces: CSS custom properties `--paper`, `--paper-2`, `--ink`, `--accent`, `--good`, `--warn`, `--bad`, `--line`, `--muted`, `--font-display`, `--font-body`, `--font-mono`, `--radius`, `--ease`.
- Produces shared classes: `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-small`, `.btn-arrow`, `.eyebrow`, `.display`, `.hl` (accent highlight word), `.frame`, `.panel`, `.pill` (+ `.good .warn .bad .neutral`), `.field`, `.sr-only`.
- Produces: `<Logo size={28} wordmark animated />`. The mark is four wave bands redrawn from `ref/logo.jpg` as stroked paths using `currentColor`, viewBox `0 0 64 56`.

- [ ] **Step 1: `index.html`.** Title `Mend · Self-healing operations`, description updated, `theme-color` `#12232E`, favicon link, and Google Fonts `preconnect` plus one stylesheet link for `Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800`, `Plus+Jakarta+Sans:wght@400;500;600;700`, `JetBrains+Mono:wght@400;500`.
- [ ] **Step 2: `index.css`.** Remove the old `@import` and every component rule (they move to `styles/console.css` in Task 4). Keep the three `@tailwind` lines. Define the tokens on `:root`, the base (`body` on `--ink` so the frame shows, `#root` min-height), the grain (an inline SVG `feTurbulence` data URI at 6% opacity on `.frame::before`), the shared classes listed above, the keyframes `rise-in`, `shake`, `spin`, `pulse-ring`, and a single `@media (prefers-reduced-motion: reduce)` block that sets `animation-duration: .001ms`, `animation-iteration-count: 1` and `transition-duration: .001ms` on `*`.
- [ ] **Step 3: Button micro-interactions.** `.btn` scales to `.97` on `:active`, shows a 2px accent `:focus-visible` ring offset 2px, and `.btn-arrow` slides its arrow 4px on hover.
- [ ] **Step 4: `tailwind.config.js`.** Replace the old colour set with `paper`, `ink`, `accent`.
- [ ] **Step 5: `Logo.jsx`.** Four paths, each `M4,y C22,y 30,y+16 60,y+16` style S-curves at 12px pitch with `stroke-width: 7`, clipped to the mark's rectangle. With `animated`, each path draws in via `stroke-dashoffset` with a 70ms stagger; on hover of `.logo` the bands shift ±2px in sequence (`logo-ripple`).
- [ ] **Step 6: Verify.** `npm run build` succeeds. The app will look unstyled until Task 4; that is expected.
- [ ] **Step 7: Commit** `Add Mend design tokens, fonts and logo`.

---

### Task 3: Routing, auth context and login page

**Files:**
- Create: `frontend/src/auth/AuthContext.jsx`, `frontend/src/auth/RequireAuth.jsx`, `frontend/src/pages/Login.jsx`, `frontend/src/styles/auth.css`
- Modify: `frontend/src/main.jsx`

**Interfaces:**
- Consumes: `createStore`, `AuthError`, `DEMO_USER`, `PLANS` from Task 1; `Logo` and shared classes from Task 2.
- Produces: `useAuth()` returning `{ session, tenants, allTenants, signIn(input), createWorkspace(input), switchTenant(slug), signOut(), accessLog() }`. `signIn` and `createWorkspace` return promises that reject with `AuthError` after a 600ms delay. `tenants` is the signed-in user's memberships; `allTenants` is every tenant (for quick picks).
- Produces: `authMessage(error)` mapping codes to copy.

- [ ] **Step 1: `AuthContext.jsx`**

```jsx
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

  useEffect(() => {
    const sync = () => setSession(store.getSession());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const signIn = useCallback(async (input) => {
    await wait(600);
    const next = store.signIn(input);
    setSession(next);
    return next;
  }, []);

  const createWorkspace = useCallback(async (input) => {
    await wait(600);
    const next = store.createWorkspace(input);
    setSession(next);
    return next;
  }, []);

  const switchTenant = useCallback((slug) => {
    const next = store.switchTenant(slug);
    setSession(next);
    return next;
  }, []);

  const signOut = useCallback(() => {
    store.signOut();
    setSession(null);
  }, []);

  const value = useMemo(() => ({
    session,
    tenants: session ? store.listTenantsFor(session.email) : [],
    allTenants: store.listTenants(),
    signIn,
    createWorkspace,
    switchTenant,
    signOut,
    accessLog: () => (session ? store.getAccessLog(session.tenant.slug) : []),
  }), [session, signIn, createWorkspace, switchTenant, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
```

- [ ] **Step 2: `RequireAuth.jsx`**

```jsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

export default function RequireAuth({ children }) {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
```

- [ ] **Step 3: `main.jsx`.** Wrap in `BrowserRouter`, `MotionConfig reducedMotion="user"` and `AuthProvider`. Routes: `/login` → `Login`, `/app` → `RequireAuth` around the existing `App`, `*` → `Navigate to="/login"` (replaced by the landing page in Task 5). Import `./index.css` and `./styles/auth.css`.
- [ ] **Step 4: `Login.jsx`.** Two-column layout inside `.frame`: left a brand panel (logo, one headline, the "Demo sign-in, no real account is created" note); right the card.
  - If `session` exists, `<Navigate to="/app" replace />`.
  - Tabs `Sign in` / `Create workspace` as a `role="tablist"` with a `motion` `layoutId="auth-pill"` pill; initial tab from `?mode=signup`. Left and Right arrow keys move between tabs.
  - Sign in: workspace, email, password; quick-pick chips from `allTenants` set the workspace; `Use demo credentials` fills `acme` plus `DEMO_USER`.
  - Create workspace: name, email, password, plan radio group from `PLANS`, preselected from `?plan` when it is one of `PLANS`, otherwise `starter`.
  - Submit: set busy, `await signIn(...)` or `createWorkspace(...)`, then `navigate("/app", { replace: true })`. On `AuthError`: show `authMessage(error)` in a `role="alert"` line, mark `error.field` with `aria-invalid`, and replay the `shake` animation on the card by bumping a `key`.
  - The submit button shows a spinner and is disabled while busy.
- [ ] **Step 5: `auth.css`.** `.auth`, `.auth-brand`, `.auth-card`, `.tabs`, `.tab`, `.tab-pill`, `.field`, `.chip`, `.plan-radio`, `.form-error`. Under 800px the brand panel collapses to a logo bar and the card fills the width.
- [ ] **Step 6: Verify in the browser.** `npm run dev`, then: `/app` redirects to `/login`; demo credentials reach `/app`; a wrong password shakes and shows the message; creating `Blue Harbor` reaches `/app`; reloading `/app` stays signed in; `/login` while signed in goes to `/app`.
- [ ] **Step 7: Commit** `Add routing, auth context and login page`.

---

### Task 4: Console split, reskin, tenant header and access log

**Files:**
- Create: `frontend/src/pages/Console.jsx`, `frontend/src/styles/console.css`, and in `frontend/src/components/console/`: `shared.jsx`, `ConsoleHeader.jsx`, `Sidebar.jsx`, `Dashboard.jsx`, `IncidentView.jsx`, `AuditLog.jsx`, `AccessLog.jsx`
- Delete: `frontend/src/App.jsx`
- Modify: `frontend/src/main.jsx` (route `/app` renders `Console`)

**Interfaces:**
- Consumes: `useAuth()` from Task 3, tokens and `Logo` from Task 2.
- `shared.jsx` exports `parseJson`, `timeLabel`, `formatDuration`, `StatusPill`, `FAULTS`, `PHASES`, moved verbatim from `App.jsx`.
- `Dashboard.jsx`, `IncidentView.jsx`, `AuditLog.jsx` keep the props they have today.
- `ConsoleHeader({ llmMode, connection, activeTab, setActiveTab, onMenu })`, `Sidebar({ open, onClose, activeTab, setActiveTab, incidents, selectedId, onSelectIncident, catalog })`, `AccessLog({ entries })`.

- [ ] **Step 1: Move code.** Cut each component from `App.jsx` into the file above, unchanged apart from imports. `Console.jsx` holds the state, effects and handlers of today's `App` default export. Delete `App.jsx`. Run `npm run build`.
- [ ] **Step 2: Tabs.** Add `access` → `Access log` to the header nav and sidebar. `Console` renders `<AccessLog entries={accessLog()} />` for it and re-reads on tab change.
- [ ] **Step 3: `ConsoleHeader`.** `Logo` with wordmark in place of the `AH` mark; caption stays. Right side: the sandbox and LLM badges, then a tenant button showing name and plan that opens a small menu listing `tenants` (current one checked; choosing one calls `switchTenant`) and `Sign out` (calls `signOut`, then `navigate("/")`). The menu closes on Escape and outside click. A menu button (visible under 800px) calls `onMenu`.
- [ ] **Step 4: `Sidebar`.** Sidebar title reads `WORKSPACE` with the tenant name. Under 800px it is a fixed drawer translated off-screen, with a backdrop; it closes on navigation, Escape and backdrop tap. Footer text becomes `Mend · SANDBOX environment`.
- [ ] **Step 5: `AccessLog`.** Rows of time, event pill (`sign_in` good, `sign_in_failed` bad, others neutral), email, detail; empty state `No access events for this workspace yet.`
- [ ] **Step 6: `console.css`.** Restyle every existing class with the tokens: paper panels with `--line` borders, ink text, mono eyebrows, accent for selected nav and primary buttons, status banner as a bordered panel whose left edge and heading take the status colour, pills using good / warn / bad at 12% tint. In `MetricChart` change the grid stroke to `rgba(18,35,46,.12)`, tick fill to `rgba(18,35,46,.6)`, tooltip to paper with an ink border, and the two series colours to `#E8622C` (error rate) and `#12232E` (latency). Copy the headings `AUTOHEAL` → `Mend` and eyebrow `PS-12 · AGENTIC AUTO-HEAL` → `MEND · AGENTIC AUTO-HEAL`.
- [ ] **Step 7: Micro-interactions.** Tab content keyed by `activeTab` inside `AnimatePresence mode="wait"` (opacity and 6px rise, 180ms). Notice becomes a toast fixed bottom-right sliding in. `StatusPill` replays `pulse-ring` when its value changes (key the span on the value). Fault buttons and tiles lift 2px on hover. Modal keeps `modal-in`.
- [ ] **Step 8: Verify in the browser** with and without the backend running: tabs switch, the notice toast shows `Backend unavailable` when it is down, tenant switch updates header and sidebar, access log lists the sign-in, the drawer works at 390px, no horizontal scroll at 320px.
- [ ] **Step 9: Commit** `Split and reskin the console, add tenant header and access log`.

---

### Task 5: Landing page and hero scene

**Files:**
- Create: `frontend/src/pages/Landing.jsx`, `frontend/src/components/SiteNav.jsx`, `frontend/src/components/HeroScene.jsx`, `frontend/src/components/Reveal.jsx`, `frontend/src/styles/landing.css`
- Modify: `frontend/src/main.jsx` (`/` → `Landing`, `*` → `Navigate to="/"`)

**Interfaces:**
- Consumes: `Logo`, shared classes, `useAuth()` (the nav shows `Open console` when signed in, otherwise `Sign in`).
- Produces: `<Reveal delay={0} as="div">` (fades and rises 16px once when 20% in view, via `motion`'s `whileInView` with `viewport={{ once: true }}`); section ids `how`, `features`, `pricing`.

- [ ] **Step 1: `SiteNav`.** Logo, links to `#how`, `#features`, `#pricing` with an underline wipe, and the sign-in / console button. Under 800px the links move into a menu toggled by a button with `aria-expanded`.
- [ ] **Step 2: Hero markup.** Inside `.frame`: a mono side label `INTRODUCTION`; the headline `INCIDENTS THAT <hl>MEND</hl> THEMSELVES, <hl>GUARDED</hl> BY YOUR TEAM` split into three lines, each in an overflow-hidden wrapper rising in with a 90ms stagger; a short intro paragraph at the left; a primary button `Get started` → `/login?mode=signup` and a ghost button `See pricing` → `#pricing`.
- [ ] **Step 3: `HeroScene`.** One SVG, viewBox `0 0 1200 460`, `stroke: var(--ink)`, `stroke-width: 2`, `fill: none`, `aria-hidden`. Groups:
  - `.scene-ground`: horizontal baseline plus short dashed segments.
  - `.scene-grid`: a 5 by 6 grid of 18px cells on a pole at the left; a fixed subset of cells carries `.cell-a` or `.cell-b`, which alternate fill between `--accent` and `--ink` on `cell-flip` (2.4s, steps, staggered delays).
  - `.scene-core`: the wave mark at 3x inside a faceted crystal outline at the centre, on `core-bob` (4s, ±5px).
  - `.scene-nodes`: five service boxes (APP, DB, WORKER, DISK, PAY) drawn as isometric-looking outlined blocks with mono labels.
  - `.scene-wires`: paths joining the grid, core and nodes; each has a twin `.pulse` path with `stroke: var(--accent)`, `stroke-dasharray: 26 600` animated on `wire-pulse` (dashoffset `626` → `0`, 3s linear, staggered).
  - `.scene-mend`: the wire to DISK; on a 6s `mend-cycle` it turns dashed and the node fill goes accent at 30 to 55%, a pulse arrives, then it returns to solid and the node flashes `--good`.
- [ ] **Step 4: Sections.** `How it works`: four numbered steps (Detect, Diagnose, Guard, Mend) joined by a line that draws as the section reveals. `Features`: six cards in a 3-column grid (2 at 1100px, 1 at 580px) with hover lift. `Footer`: logo, links, `Sandbox demo. Nothing here touches production.` Wrap blocks in `Reveal`.
- [ ] **Step 5: `landing.css`.** Layout for the above; under 800px the frame margin is removed, the hero stacks and `HeroScene` scales to the width with `preserveAspectRatio="xMidYMax meet"`.
- [ ] **Step 6: Verify in the browser** at 1440, 820 and 390px: the scene loops, headline animates once, anchors scroll smoothly, nav menu works on a phone, reduced-motion emulation shows a still scene.
- [ ] **Step 7: Commit** `Add animated landing page`.

---

### Task 6: Pricing

**Files:**
- Create: `frontend/src/components/Pricing.jsx`
- Modify: `frontend/src/pages/Landing.jsx`, `frontend/src/styles/landing.css`

**Interfaces:**
- Consumes: `PLANS` ids from Task 1; `Reveal` from Task 5.
- Plan data lives in `Pricing.jsx`: `{ id, name, blurb, monthly, yearly, features[], cta, featured }` with Starter `0 / 0`, Team `49 / 39`, Enterprise `null / null` shown as `Custom`.

- [ ] **Step 1: Tabs.** `role="tablist"` with `Monthly` and `Yearly` tabs, roving `tabIndex`, Left / Right / Home / End keys, `aria-selected`, and a `motion.span layoutId="billing-pill"` behind the selected tab. Yearly carries a `Save 20%` tag.
- [ ] **Step 2: Price roll.** A `RollingPrice({ value })` component: `AnimatePresence mode="popLayout"` keyed on the value, old number exits upward, new one enters from below (220ms). Team's caption reads `per month` or `per month, billed yearly`.
- [ ] **Step 3: Cards.** Three cards; Team is featured (ink background, paper text, `Most popular` tag). Each lists its features with a small check mark and a button linking to `/login?mode=signup&plan=<id>`. Cards lift on hover; they stack under 800px with Team first.
- [ ] **Step 4: Verify.** Switching tabs slides the pill and rolls `$49` ↔ `$39`; arrow keys change tabs; each button lands on the Create workspace tab with that plan selected.
- [ ] **Step 5: Commit** `Add pricing section`.

---

### Task 7: Route transitions, cleanup and final verification

**Files:**
- Modify: `frontend/src/main.jsx`, `README.md`, `run.bat` / `run.sh` only if they print the old product name

- [ ] **Step 1: Route cross-fade.** Wrap `Routes` in `AnimatePresence mode="wait"` keyed on `location.pathname`, each page in a `motion.div` fading over 200ms. Scroll to top on path change.
- [ ] **Step 2: Naming sweep.** `grep -ri "autoheal" frontend/src frontend/index.html` returns nothing user-visible (the `autoheal-approve` / `autoheal-reject` event names may stay).
- [ ] **Step 3: README.** Add a short "Frontend" section: routes, demo credentials, the fact that auth is client-side only.
- [ ] **Step 4: Full verification.** `npm test` passes; `npm run build` succeeds with no warnings about unresolved imports; walk the whole flow at 1440, 820 and 390px (landing → pricing → create workspace → console → switch tenant → access log → sign out → `/app` redirects to `/login`); check the console for errors.
- [ ] **Step 5: Commit** `Add route transitions and finish Mend rename`.
