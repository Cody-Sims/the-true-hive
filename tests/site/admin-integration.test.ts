import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { deleteApp, getApps } from "firebase-admin/app";
import {
  AdminConfigurationError,
  type AdminConfig,
} from "../../src/server/admin/config.ts";
import {
  createAdminBoundary,
  cookieNames,
} from "../../src/server/auth/http.ts";
import { createAdminAuth, hashSession } from "../../src/server/auth/service.ts";

function config(): AdminConfig {
  return {
    enabled: true,
    origin: "https://inventory.example.test",
    secureCookies: true,
    databaseUrl: null,
    csrfSecret: randomBytes(32).toString("base64"),
    projectId: "fixture-project",
    apiKey: null,
    serviceAccount: null,
  };
}

test("opening another admin tab preserves the first tab's signed mutation token", async () => {
  const settings = config();
  const auth = createAdminAuth(settings, {
    async verifyIdToken() {
      throw new Error("Unexpected identity-token verification");
    },
    async verifySessionCookie(cookie) {
      assert.equal(cookie, "fixture-session");
      return {
        uid: "fixture-admin",
        aud: "fixture-project",
        iss: "https://session.firebase.google.com/fixture-project",
        auth_time: Math.floor(Date.now() / 1000),
        email_verified: true,
        firebase: {
          sign_in_provider: "google.com",
          sign_in_second_factor: "totp",
        },
      };
    },
    async createSessionCookie() {
      throw new Error("Unexpected session creation");
    },
    async isMember(uid) {
      return uid === "fixture-admin";
    },
    async isSessionActive(hash, uid) {
      return hash === hashSession("fixture-session") && uid === "fixture-admin";
    },
    async saveSession() {
      throw new Error("Unexpected session persistence");
    },
    async revokeSession() {
      throw new Error("Unexpected session revocation");
    },
  });
  const boundary = createAdminBoundary(settings, auth);
  const names = cookieNames(settings);
  let cookies = `${names.session}=fixture-session`;
  function request(path: string, token?: string) {
    return new Request(`${settings.origin}${path}`, {
      method: token ? "POST" : "GET",
      headers: {
        host: new URL(settings.origin).host,
        cookie: cookies,
        ...(token ? { origin: settings.origin, "x-csrf-token": token } : {}),
      },
    });
  }
  function acceptNonce(values: string[]) {
    const nonce = values
      .find((value) => value.startsWith(`${names.csrf}=`))
      ?.split(";")[0];
    assert(nonce);
    cookies = `${names.session}=fixture-session; ${nonce}`;
  }
  const first: { csrfToken?: string } = {};
  const firstResult = await boundary.gate(
    request("/inventory/products"),
    first,
  );
  assert.equal(firstResult.response, null);
  acceptNonce(firstResult.cookies);
  assert(first.csrfToken);
  const secondResult = await boundary.gate(request("/inventory/orders"), {});
  assert.equal(secondResult.response, null);
  acceptNonce(secondResult.cookies);
  const mutation = await boundary.gate(
    request("/api/admin/adjustments", first.csrfToken),
    {},
  );
  assert.equal(mutation.response, null);
});

async function firebaseModule() {
  const url = new URL("../../src/server/auth/firebase.ts", import.meta.url);
  url.searchParams.set("test-load", randomUUID());
  return import(url.href) as Promise<
    typeof import("../../src/server/auth/firebase.ts")
  >;
}

function credentialConfig(): AdminConfig {
  const settings = config();
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  return {
    ...settings,
    serviceAccount: {
      project_id: settings.projectId!,
      client_email: `fixture-adminsdk@${settings.projectId}.iam.gserviceaccount.com`,
      private_key: privateKey,
    },
  };
}

async function closeFixtureApp() {
  for (const app of getApps()) {
    if (app.name === "true-hive-inventory") await deleteApp(app);
  }
}

test("source preflight and bundled runtime reuse one Firebase app without remote calls", async () => {
  const settings = credentialConfig();
  try {
    const first = await firebaseModule();
    const second = await firebaseModule();
    assert.equal(
      first.getAdminFirebase(settings),
      second.getAdminFirebase(settings),
    );
  } finally {
    await closeFixtureApp();
  }
});

test("cross-module Firebase reuse rejects a different identity project", async () => {
  const settings = credentialConfig();
  try {
    const first = await firebaseModule();
    const second = await firebaseModule();
    first.getAdminFirebase(settings);
    assert.throws(
      () =>
        second.getAdminFirebase({
          ...settings,
          projectId: "other-project",
          serviceAccount: {
            ...settings.serviceAccount!,
            project_id: "other-project",
            client_email:
              "fixture-adminsdk@other-project.iam.gserviceaccount.com",
          },
        }),
      AdminConfigurationError,
    );
  } finally {
    await closeFixtureApp();
  }
});
