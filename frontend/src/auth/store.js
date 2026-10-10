export const KEYS = { tenants: "mend.tenants", session: "mend.session", log: "mend.accessLog" };
export const LOG_LIMIT = 200;
export const PLANS = ["starter", "team", "enterprise"];
export const DEMO_USER = { email: "ops@mend.test", password: "mend-demo" };

const SEED_TENANTS = [
  { slug: "acme", name: "Acme Retail", plan: "team" },
  { slug: "northwind", name: "Northwind Logistics", plan: "starter" },
  { slug: "globex", name: "Globex Health", plan: "enterprise" },
];

export const DEMO_WORKSPACES = SEED_TENANTS.map((tenant) => tenant.slug);

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
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
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

const isUser = (value) => Boolean(value) && typeof value.email === "string" && typeof value.password === "string";

function isTenant(value) {
  return Boolean(value) && typeof value.slug === "string" && typeof value.name === "string"
    && PLANS.includes(value.plan) && Array.isArray(value.users) && value.users.every(isUser);
}

function isLogEntry(value) {
  return Boolean(value) && ["ts", "tenant", "email", "event", "detail"].every((key) => typeof value[key] === "string");
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
      useMemory();
      backing.setItem(key, text);
    }
  }

  // Storage stopped accepting writes: carry on in memory with what it held.
  function useMemory() {
    const memory = memoryStorage();
    for (const key of Object.values(KEYS)) {
      try {
        const raw = backing.getItem(key);
        if (raw != null) memory.setItem(key, raw);
      } catch {
        // Unreadable too; start that key empty.
      }
    }
    backing = memory;
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
      // Membership is by email, so a known email must prove itself with its own password.
      const known = tenants.flatMap((item) => item.users).find((user) => user.email === address);
      if (known && known.password !== secret) throw new AuthError("email_taken", "email");
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
        useMemory();
        backing.removeItem(KEYS.session);
      }
    },

    getAccessLog(slug) {
      const stored = read(KEYS.log, {});
      const entries = stored && Array.isArray(stored[slug]) ? stored[slug] : [];
      return entries.filter(isLogEntry).reverse();
    },
  };
}
