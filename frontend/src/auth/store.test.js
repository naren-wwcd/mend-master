import { describe, it, expect } from "vitest";
import { createStore, DEMO_USER, DEMO_WORKSPACES, KEYS, LOG_LIMIT } from "./store.js";

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

describe("review fixes", () => {
  it("keeps accented and non-Latin workspace names usable", () => {
    const store = createStore(fakeStorage());
    const cafe = store.createWorkspace({ name: "Café Ünïted", email: "a@cafe.test", password: "secret-1", plan: "team" });
    expect(cafe.tenant.slug).toBe("cafe-united");
    store.signOut();
    const kanji = store.createWorkspace({ name: "日本語", email: "b@jp.test", password: "secret-1", plan: "team" });
    expect(kanji.tenant.slug).toBe("日本語");
    store.signOut();
    expect(store.signIn({ workspace: "cafe united", email: "a@cafe.test", password: "secret-1" }).tenant.slug)
      .toBe("cafe-united");
  });

  it("names the seeded demo workspaces", () => {
    expect(DEMO_WORKSPACES).toEqual(["acme", "northwind", "globex"]);
  });

  it("refuses an email that already belongs to another workspace under a different password", () => {
    const store = createStore(fakeStorage());
    const attempt = () => store.createWorkspace({
      name: "Evil Co", email: DEMO_USER.email, password: "hunter22", plan: "starter",
    });
    expect(codeOf(attempt)).toBe("email_taken");
    expect(store.listTenants()).toHaveLength(3);
    expect(store.getSession()).toBeNull();
  });

  it("lets an existing user open another workspace with their own password", () => {
    const store = createStore(fakeStorage());
    store.createWorkspace({ name: "Second Site", ...DEMO_USER, plan: "team" });
    expect(store.listTenantsFor(DEMO_USER.email)).toHaveLength(4);
  });

  it("keeps existing data when writes start failing", () => {
    const good = fakeStorage();
    const first = createStore(good);
    first.createWorkspace({ name: "Kept Co", email: "a@kept.test", password: "secret-1", plan: "team" });
    first.signOut();
    const readOnly = {
      getItem: good.getItem,
      setItem() { throw new Error("quota"); },
      removeItem: good.removeItem,
    };
    const store = createStore(readOnly);
    const session = store.signIn({ workspace: "kept-co", email: "a@kept.test", password: "secret-1" });
    expect(store.getSession()).toEqual(session);
    expect(store.listTenants()).toHaveLength(4);
  });

  it("ignores structurally invalid tenants, sessions and log entries", () => {
    const store = createStore(fakeStorage({
      [KEYS.tenants]: JSON.stringify([{ slug: "x", name: "X", plan: "team", users: [null] }]),
      [KEYS.session]: JSON.stringify({ email: "a@b.c", tenant: { slug: "x" } }),
      [KEYS.log]: JSON.stringify({
        acme: [null, { ts: "t1", event: "sign_in" }, { ts: "t2", tenant: "acme", email: "a@b.c", event: "sign_in", detail: "ok" }],
      }),
    }));
    expect(store.getSession()).toBeNull();
    expect(store.listTenants()).toHaveLength(3);
    expect(store.getAccessLog("acme")).toEqual([
      { ts: "t2", tenant: "acme", email: "a@b.c", event: "sign_in", detail: "ok" },
    ]);
  });
});
