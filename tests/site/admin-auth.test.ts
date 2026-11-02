import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  readAdminConfig,
  AdminConfigurationError,
  assertSameDatabaseTarget,
  type AdminConfig,
} from "../../src/server/admin/config.ts";
import {
  createAdminAuth,
  AdminAuthError,
  type AuthDependencies,
  type VerifiedIdentity,
} from "../../src/server/auth/service.ts";
import {
  createAdminBoundary,
  cookieNames,
  type AdminLocals,
} from "../../src/server/auth/http.ts";
import { issueCsrf, verifyCsrf } from "../../src/server/auth/csrf.ts";
import { createAttemptLimiter } from "../../src/server/auth/limiter.ts";

const now = 1800000000000;
const config: AdminConfig = {
  enabled: true,
  origin: "https://inventory.example",
  secureCookies: true,
  databaseUrl: "postgres://writer:private@database.example/hive",
  csrfSecret: randomBytes(32).toString("base64"),
  projectId: "hive-test",
  apiKey: "public-test-key",
  serviceAccount: null,
};

function fixture(overrides: Partial<VerifiedIdentity> = {}) {
  let member = true;
  let active = true;
  let rejected = false;
  let writes = 0;
  const identity: VerifiedIdentity = {
    uid: "test-user",
    aud: "hive-test",
    iss: "https://securetoken.google.com/hive-test",
    email_verified: true,
    auth_time: now / 1000,
    firebase: {
      sign_in_provider: "google.com",
      sign_in_second_factor: "totp",
    },
    ...overrides,
  };
  const deps: AuthDependencies = {
    async verifyIdToken() {
      if (rejected) throw new Error("provider rejected");
      return identity;
    },
    async verifySessionCookie() {
      if (rejected) throw new Error("provider revoked");
      return {
        ...identity,
        iss: `https://session.firebase.google.com/${identity.aud}`,
      };
    },
    async createSessionCookie() {
      writes++;
      return "signed-provider-session";
    },
    async isMember() {
      return member;
    },
    async isSessionActive() {
      return active;
    },
    async saveSession() {
      writes++;
    },
    async revokeSession() {
      active = false;
      writes++;
    },
  };
  return {
    auth: createAdminAuth(config, deps, () => now),
    setMember: (value: boolean) => {
      member = value;
    },
    setActive: (value: boolean) => {
      active = value;
    },
    rejectProvider: () => {
      rejected = true;
    },
    writes: () => writes,
    dependencies: deps,
  };
}

test("login rejects first factor, wrong project, unverified email, stale and future auth without writes", async () => {
  for (const override of [
    { firebase: { sign_in_provider: "google.com" } },
    {
      firebase: {
        sign_in_provider: "google.com",
        sign_in_second_factor: "phone",
      },
    },
    { aud: "personal-project" },
    { iss: "https://securetoken.google.com/personal-project" },
    { email_verified: false },
    { auth_time: now / 1000 - 301 },
    { auth_time: now / 1000 + 1 },
  ]) {
    const f = fixture(override);
    await assert.rejects(f.auth.login("id-token"), AdminAuthError);
    assert.equal(f.writes(), 0);
  }
});

test("current membership, SDK revocation, and local revocation all deny independently", async () => {
  const f = fixture();
  f.setMember(false);
  await assert.rejects(f.auth.login("id-token"), AdminAuthError);
  assert.equal(f.writes(), 0);
  f.setMember(true);
  const session = await f.auth.login("id-token");
  assert.match(session.actorId, /^fb-[a-f0-9]{64}$/);
  const first = await f.auth.authenticate(session.cookie);
  assert.equal(first.actorId, session.actorId);
  f.setMember(false);
  await assert.rejects(f.auth.authenticate(session.cookie), AdminAuthError);
  f.setMember(true);
  f.setActive(false);
  await assert.rejects(f.auth.authenticate(session.cookie), AdminAuthError);
  f.setActive(true);
  f.rejectProvider();
  await assert.rejects(f.auth.authenticate(session.cookie), AdminAuthError);
});

test("enrollment permits only fresh verified Google members and never creates a session", async () => {
  const f = fixture({ firebase: { sign_in_provider: "google.com" } });
  assert.deepEqual(await f.auth.enrollment("first-factor"), { allowed: true });
  assert.equal(f.writes(), 0);
  f.setMember(false);
  await assert.rejects(f.auth.enrollment("first-factor"), AdminAuthError);
  assert.equal(f.writes(), 0);
  await assert.rejects(
    fixture({ auth_time: now / 1000 - 301 }).auth.enrollment("stale"),
    AdminAuthError,
  );
});

test("logout invalidates the local session without user-wide edits", async () => {
  const f = fixture();
  const session = await f.auth.login("id-token");
  await f.auth.logout(session.cookie);
  await assert.rejects(f.auth.authenticate(session.cookie), AdminAuthError);
  assert.equal(f.writes(), 3);
});

test("disabled startup config needs no credentials, unsafe enabled configuration is rejected", () => {
  assert.equal(readAdminConfig({}).enabled, false);
  assert.throws(
    () => readAdminConfig({ INVENTORY_ENABLED: "true" }),
    AdminConfigurationError,
  );
  assert.throws(
    () => readAdminConfig({ INVENTORY_ENABLED: "yes" }),
    AdminConfigurationError,
  );
});

function enabledEnvironment() {
  return {
    INVENTORY_ENABLED: "true",
    INVENTORY_ORIGIN: "https://inventory.example",
    ADMIN_DATABASE_URL: config.databaseUrl!,
    ADMIN_CSRF_SECRET: randomBytes(32).toString("base64"),
    FIREBASE_PROJECT_ID: config.projectId!,
    FIREBASE_WEB_API_KEY: config.apiKey!,
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      type: "service_account",
      project_id: "hive-test",
      client_email: "inventory@hive-test.iam.gserviceaccount.com",
      private_key:
        "-----BEGIN PRIVATE KEY-----\noperator-only-test-placeholder",
    }),
  };
}

test("enabled configuration needs at least 32 decoded secret bytes and rejects emulator or wrong project credentials", () => {
  const env = enabledEnvironment();
  assert.equal(readAdminConfig(env).enabled, true);
  assert.throws(
    () =>
      readAdminConfig({
        ...env,
        ADMIN_CSRF_SECRET: randomBytes(24).toString("base64"),
      }),
    AdminConfigurationError,
  );
  assert.throws(
    () =>
      readAdminConfig({
        ...env,
        FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
      }),
    AdminConfigurationError,
  );
  assert.throws(
    () =>
      readAdminConfig({
        ...env,
        FIREBASE_PROJECT_ID: "personal-project",
      }),
    AdminConfigurationError,
  );
});

test("HTTP inventory cookies are loopback-development-only, never a production relaxation", () => {
  const env = {
    ...enabledEnvironment(),
    INVENTORY_ORIGIN: "http://127.0.0.1:4321",
  };
  assert.throws(
    () => readAdminConfig({ ...env, NODE_ENV: "production" }),
    AdminConfigurationError,
  );
  const dev = readAdminConfig({ ...env, NODE_ENV: "development" });
  assert.equal(dev.secureCookies, false);
  assert.match(cookieNames(dev).session, /^dev-/);
  assert.throws(
    () =>
      readAdminConfig({
        ...env,
        INVENTORY_ORIGIN: "http://inventory.example",
        NODE_ENV: "development",
      }),
    AdminConfigurationError,
  );
});

test("exact inventory origin rejects replayed cookies and forwarded host spoofing before data access", async () => {
  const f = fixture();
  const boundary = createAdminBoundary(config, f.auth);
  for (const [url, headers] of [
    [
      "https://shop.example/inventory/products",
      { "x-forwarded-host": "inventory.example" },
    ],
    ["https://shop.example/api/admin/products", { host: "inventory.example" }],
    ["https://inventory.example/api/admin/products", { host: "shop.example" }],
  ] as const) {
    const locals = {};
    const result = await boundary.gate(
      new Request(url, {
        headers: {
          ...headers,
          cookie: "__Host-hive-admin=signed-provider-session",
        },
      }),
      locals,
    );
    assert.equal(result.response?.status, 404);
    assert.deepEqual(locals, {});
  }
  const publicShop = await boundary.gate(
    new Request("https://inventory.example/shop"),
    {},
  );
  assert.equal(publicShop.response?.status, 404);
  const root = await boundary.gate(
    new Request("https://inventory.example/"),
    {},
  );
  assert.equal(root.response?.headers.get("location"), "/inventory/products");
  const anonymous = await boundary.gate(
    new Request("https://inventory.example/inventory/products"),
    {},
  );
  assert.equal(anonymous.response?.headers.get("location"), "/inventory/login");
  assert.equal(
    (
      await boundary.gate(
        new Request("https://inventory.example/api/admin/products"),
        {},
      )
    ).response?.status,
    401,
  );
});

async function loginShell(boundary: ReturnType<typeof createAdminBoundary>) {
  const locals: { csrfToken?: string } = {};
  const result = await boundary.gate(
    new Request("https://inventory.example/inventory/login"),
    locals,
  );
  assert.ok(locals.csrfToken);
  return {
    csrf: locals.csrfToken,
    cookie: result.cookies.map((value) => value.split(";")[0]).join("; "),
  };
}

test("inventory root and private HEAD requests receive authenticated CSRF shell locals", async () => {
  const f = fixture();
  const login = await f.auth.login("id-token");
  const boundary = createAdminBoundary(config, f.auth);
  for (const path of ["/inventory", "/inventory/products"]) {
    for (const method of ["GET", "HEAD"]) {
      const locals: AdminLocals = {};
      const result = await boundary.gate(
        new Request(`${config.origin}${path}`, {
          method,
          headers: { cookie: `${cookieNames(config).session}=${login.cookie}` },
        }),
        locals,
      );
      assert.equal(result.response, null);
      assert.equal(locals.admin?.uid, login.uid);
      assert(locals.csrfToken);
      assert.equal(result.cookies.length, 1);
    }
  }
});

test("anonymous login HEAD receives the public CSRF shell without a private session", async () => {
  const f = fixture();
  const locals: AdminLocals = {};
  const result = await createAdminBoundary(config, f.auth).gate(
    new Request(`${config.origin}/inventory/login`, { method: "HEAD" }),
    locals,
  );
  assert.equal(result.response, null);
  assert(locals.csrfToken);
  assert.equal(locals.admin, undefined);
  assert.equal(f.writes(), 0);
});

function mutation(
  path: string,
  cookie: string,
  csrf: string,
  origin = config.origin,
) {
  return new Request(`${config.origin}/api/admin/${path}`, {
    method: "POST",
    headers: {
      cookie,
      origin,
      "x-csrf-token": csrf,
      "content-type": "application/json",
    },
    body: JSON.stringify({ idToken: "id-token" }),
  });
}

test("signed preauth CSRF and exact Origin reject forgeries and sibling domain without mutations", async () => {
  const f = fixture();
  const boundary = createAdminBoundary(config, f.auth);
  const shell = await loginShell(boundary);
  const other = await loginShell(boundary);
  for (const request of [
    mutation("session", shell.cookie, shell.csrf, "https://shop.example"),
    mutation("session", shell.cookie, "unsigned-token"),
    mutation("session", other.cookie, shell.csrf),
    mutation("enrollment", shell.cookie, shell.csrf, "null"),
  ]) {
    assert.equal(
      (
        await boundary.endpoint(
          request,
          request.url.endsWith("enrollment") ? "enrollment" : "session",
        )
      ).status,
      403,
    );
    assert.equal(f.writes(), 0);
  }
});

test("session cookie is host-only, secure and HttpOnly; CSRF rotates and binds to session; logout revokes before clearing", async () => {
  const f = fixture();
  const boundary = createAdminBoundary(config, f.auth);
  const shell = await loginShell(boundary);
  const response = await boundary.endpoint(
    mutation("session", shell.cookie, shell.csrf),
    "session",
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { redirect: "/inventory/products" });
  const cookies = response.headers.getSetCookie();
  const sessionCookie = cookies.find((value) =>
    value.startsWith(`${cookieNames(config).session}=`),
  );
  assert.ok(sessionCookie);
  assert.match(sessionCookie, /; Secure/);
  assert.match(sessionCookie, /; HttpOnly/);
  assert.match(sessionCookie, /; SameSite=Strict/);
  assert.doesNotMatch(sessionCookie, /Domain=/i);
  const cookie = cookies.map((value) => value.split(";")[0]).join("; ");
  const locals: AdminLocals = {};
  const result = await boundary.gate(
    new Request("https://inventory.example/inventory/products", {
      headers: { cookie },
    }),
    locals,
  );
  assert.equal(result.response, null);
  assert.ok(locals.admin);
  assert.ok(locals.csrfToken);
  const currentCookie = [
    sessionCookie.split(";")[0],
    ...result.cookies.map((value) => value.split(";")[0]),
  ].join("; ");
  assert.equal(
    (
      await boundary.endpoint(
        mutation("logout", currentCookie, shell.csrf),
        "logout",
      )
    ).status,
    403,
  );
  const logout = await boundary.endpoint(
    mutation("logout", currentCookie, locals.csrfToken),
    "logout",
  );
  assert.equal(logout.status, 200);
  assert.ok(
    logout.headers.getSetCookie().every((value) => value.includes("Max-Age=0")),
  );
  await assert.rejects(
    f.auth.authenticate("signed-provider-session"),
    AdminAuthError,
  );
});

test("all private mutation methods require signed session CSRF before continuation", async () => {
  const f = fixture();
  await f.auth.login("id-token");
  const boundary = createAdminBoundary(config, f.auth);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const locals = {};
    const result = await boundary.gate(
      new Request("https://inventory.example/api/admin/products", {
        method,
        headers: {
          cookie: "__Host-hive-admin=signed-provider-session",
          origin: config.origin,
        },
      }),
      locals,
    );
    assert.equal(result.response?.status, 403);
    assert.deepEqual(locals, {});
  }
});

test("disabled boundary never needs auth or persistence and does not expose login", async () => {
  const boundary = createAdminBoundary(
    { ...config, enabled: false },
    fixture().auth,
  );
  assert.equal(
    (
      await boundary.gate(
        new Request("https://inventory.example/inventory/login"),
        {},
      )
    ).response?.status,
    503,
  );
  assert.equal(
    (await boundary.endpoint(mutation("session", "", ""), "session")).status,
    503,
  );
});

test("CSRF expiry and session binding reject a correctly signed token from a different session", () => {
  const signed = issueCsrf(config.csrfSecret!, "first-session", now);
  const request = mutation("logout", "", signed.token);
  assert.throws(
    () =>
      verifyCsrf(
        request,
        config.origin,
        config.csrfSecret!,
        "second-session",
        signed.nonce,
        now,
      ),
    AdminAuthError,
  );
  assert.throws(
    () =>
      verifyCsrf(
        request,
        config.origin,
        config.csrfSecret!,
        "first-session",
        signed.nonce,
        now + 3600001,
      ),
    AdminAuthError,
  );
});

test("logout failure keeps cookies intact instead of claiming local revocation", async () => {
  const f = fixture();
  const login = await f.auth.login("id-token");
  f.dependencies.revokeSession = async () => {
    throw new Error("database unavailable");
  };
  const boundary = createAdminBoundary(config, f.auth);
  const signed = issueCsrf(config.csrfSecret!, login.cookie);
  const names = cookieNames(config);
  const cookie = `${names.session}=${login.cookie}; ${names.csrf}=${signed.nonce}`;
  const response = await boundary.endpoint(
    mutation("logout", cookie, signed.token),
    "logout",
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.getSetCookie().length, 0);
  assert.equal(f.writes(), 2);
  assert.equal((await f.auth.authenticate(login.cookie)).uid, login.uid);
  assert.doesNotMatch(await response.text(), /database unavailable/);
});

test("unauthenticated quota remains bounded even when attackers rotate proxy headers", async () => {
  let time = now;
  const f = fixture();
  const boundary = createAdminBoundary(
    config,
    f.auth,
    createAttemptLimiter(2, 60000, () => time),
  );
  const shell = await loginShell(boundary);
  const request = mutation(
    "enrollment",
    shell.cookie,
    shell.csrf,
    "https://wrong.example",
  );
  request.headers.set("x-forwarded-for", "198.51.100.1");
  assert.equal((await boundary.endpoint(request, "enrollment")).status, 403);
  const rotated = mutation("enrollment", shell.cookie, shell.csrf);
  rotated.headers.set("x-forwarded-for", "198.51.100.2");
  assert.equal((await boundary.endpoint(rotated, "enrollment")).status, 429);
  assert.equal(f.writes(), 0);
  time += 60000;
  assert.equal(
    (
      await boundary.endpoint(
        mutation("enrollment", shell.cookie, shell.csrf),
        "enrollment",
      )
    ).status,
    200,
  );
});

test("database authority matches credentials-independent Neon pooler aliases, default ports and encoded database names", () => {
  assert.doesNotThrow(() =>
    assertSameDatabaseTarget(
      "postgres://public_reader@EP-STAGING-pooler.us-east-2.aws.neon.tech/hive%2Dstaging?sslmode=require",
      "postgresql://private_writer@ep-staging.us-east-2.aws.neon.tech:5432/hive-staging?sslmode=verify-full",
    ),
  );
  assert.doesNotThrow(() =>
    assertSameDatabaseTarget(
      "postgres://reader@127.0.0.1/hive?sslmode=disable",
      "postgres://writer@127.0.0.1:5432/hive",
      "disable",
    ),
  );
});

test("database authority rejects other branches, ports, databases, arbitrary pooler aliases and schema overrides safely", () => {
  const publicUrl =
    "postgres://reader@ep-staging-pooler.us-east-2.aws.neon.tech/hive-staging";
  for (const adminUrl of [
    "postgres://writer@ep-operational.us-east-2.aws.neon.tech/hive-staging",
    "postgres://writer@ep-staging.us-west-2.aws.neon.tech/hive-staging",
    "postgres://writer@ep-staging.us-east-2.aws.neon.tech:6432/hive-staging",
    "postgres://writer@ep-staging.us-east-2.aws.neon.tech/operational",
    "postgres://writer@ep-staging.us-east-2.aws.neon.tech/Hive-staging",
    "postgres://writer@ep-staging.us-east-2.aws.neon.tech/hive-staging?schema=private",
    "postgres://writer@ep-staging.us-east-2.aws.neon.tech/hive-staging?options=-c%20search_path%3Dprivate",
    "postgres://writer@ep-staging.us-east-2.aws.neon.tech/hive-staging#private",
  ]) {
    assert.throws(
      () => assertSameDatabaseTarget(publicUrl, adminUrl),
      (error: unknown) =>
        error instanceof AdminConfigurationError &&
        !error.message.includes("postgres") &&
        !error.message.includes("ep-staging"),
    );
  }
  for (const [reader, writer] of [
    ["db-pooler.example", "db.example"],
    ["ep-staging-pooler.neon.tech.example", "ep-staging.neon.tech.example"],
    ["ep-staging.region-pooler.neon.tech", "ep-staging.region.neon.tech"],
  ]) {
    assert.throws(
      () =>
        assertSameDatabaseTarget(
          `postgres://reader@${reader}/hive`,
          `postgres://writer@${writer}/hive`,
        ),
      AdminConfigurationError,
    );
  }
});

test("enabled database catalog cannot drift from the private writer, while showcase staging and disabled mode remain offline", () => {
  const env = enabledEnvironment();
  assert.throws(
    () =>
      readAdminConfig({
        ...env,
        CATALOG_SOURCE: "database",
        DATABASE_URL: "postgres://reader@other-database.example/hive",
      }),
    AdminConfigurationError,
  );
  assert.throws(
    () =>
      readAdminConfig({
        ...env,
        CATALOG_SOURCE: "database",
      }),
    AdminConfigurationError,
  );
  assert.doesNotThrow(() =>
    readAdminConfig({
      ...env,
      CATALOG_SOURCE: "database",
      DATABASE_URL: "postgres://reader@database.example:5432/hive",
    }),
  );
  assert.doesNotThrow(() =>
    readAdminConfig({
      ...env,
      CATALOG_SOURCE: "showcase",
      DATABASE_URL: "postgres://reader@other-database.example/hive",
    }),
  );
  assert.equal(
    readAdminConfig({
      INVENTORY_ENABLED: "false",
      CATALOG_SOURCE: "database",
      DATABASE_URL: "not-configured",
      ADMIN_DATABASE_URL: "not-configured",
    }).enabled,
    false,
  );
});

test("stripe-test activation cannot skip enabled inventory authentication or database-mode startup", () => {
  assert.throws(
    () =>
      readAdminConfig({
        INVENTORY_ENABLED: "false",
        CHECKOUT_MODE: "stripe-test",
        CATALOG_SOURCE: "database",
      }),
    AdminConfigurationError,
  );
  const env = { ...enabledEnvironment(), CHECKOUT_MODE: "stripe-test" };
  assert.throws(
    () => readAdminConfig({ ...env, CATALOG_SOURCE: "showcase" }),
    AdminConfigurationError,
  );
  assert.doesNotThrow(() =>
    readAdminConfig({
      ...env,
      CATALOG_SOURCE: "database",
      DATABASE_URL: "postgres://reader@database.example/hive",
    }),
  );
});

test("wrong-host encoded and noncanonical private prefixes never continue to Astro routing", async () => {
  const f = fixture();
  let verifications = 0;
  const verify = f.dependencies.verifySessionCookie;
  f.dependencies.verifySessionCookie = async (cookie) => {
    verifications++;
    return verify(cookie);
  };
  const boundary = createAdminBoundary(config, f.auth);
  for (const path of [
    "/%69nventory/products",
    "/%2569nventory/products",
    "/inventory//products",
    "//inventory/products",
    "/%61pi/admin/products",
    "/api/%61dmin/products",
    "/api//admin/products",
    "/api%2Fadmin/products",
    "/shop/%252e%252e/inventory/products",
  ]) {
    const locals: AdminLocals = {};
    const result = await boundary.gate(
      new Request(`https://shop.example${path}`, {
        headers: {
          cookie: "__Host-hive-admin=signed-provider-session",
          "x-forwarded-host": "inventory.example",
        },
      }),
      locals,
    );
    assert.equal(result.response?.status, 404, path);
    assert.deepEqual(locals, {});
  }
  assert.equal(verifications, 0);
  assert.equal(f.writes(), 0);
});

test("noncanonical inventory login and auth endpoint aliases are rejected rather than exempted", async () => {
  const f = fixture();
  const boundary = createAdminBoundary(config, f.auth);
  for (const [path, method] of [
    ["/%69nventory/login", "GET"],
    ["/api/%61dmin/session", "POST"],
    ["/api//admin/enrollment", "POST"],
  ] as const) {
    const locals: AdminLocals = {};
    const result = await boundary.gate(
      new Request(`${config.origin}${path}`, {
        method,
        headers: { origin: config.origin },
      }),
      locals,
    );
    assert.equal(result.response?.status, 400, path);
    assert.deepEqual(locals, {});
    assert.equal(result.cookies.length, 0);
  }
  assert.equal(f.writes(), 0);
});
