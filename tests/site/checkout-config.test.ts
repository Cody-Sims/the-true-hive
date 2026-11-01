import test from "node:test";
import assert from "node:assert/strict";
import {
  getCheckoutPresentation,
  prepareCheckoutStartup,
  readCheckoutConfig,
} from "../../src/server/commerce/config.ts";
import { GET as ready } from "../../src/pages/api/health/ready.ts";
import { GET as live } from "../../src/pages/api/health/live.ts";
import type { APIContext } from "astro";

const configured: NodeJS.ProcessEnv = {
  CHECKOUT_MODE: "stripe-test",
  CATALOG_SOURCE: "database",
  DATABASE_URL: "postgresql://offline:offline@db.example/hive",
  ADMIN_DATABASE_URL: "postgresql://offline_writer:offline@db.example/hive",
  CHECKOUT_LOCATION_KEY: "pickup-main",
  SITE_URL: "https://shop.example",
  STRIPE_SECRET_KEY: "sk_test_offlineFixture",
  STRIPE_WEBHOOK_SECRET: "whsec_offlineFixture",
};

test("checkout defaults off and exposes no provider configuration", () => {
  assert.deepEqual(readCheckoutConfig({}), { mode: "disabled" });
  assert.deepEqual(getCheckoutPresentation({}), {
    enabled: false,
    locationKey: null,
  });
  assert.doesNotThrow(() => prepareCheckoutStartup({}));
});

test("only explicitly configured database/test checkout is presented as enabled", () => {
  assert.deepEqual(getCheckoutPresentation(configured), {
    enabled: true,
    locationKey: "pickup-main",
  });
  assert.equal(readCheckoutConfig(configured).mode, "stripe-test");
  assert.doesNotThrow(() => prepareCheckoutStartup(configured));
  assert(!JSON.stringify(getCheckoutPresentation(configured)).includes("sk_"));
});

test("invalid checkout configuration fails closed without credential echoes", () => {
  for (const change of [
    { CHECKOUT_MODE: "stripe-live" },
    { CATALOG_SOURCE: "showcase" },
    { DATABASE_URL: "" },
    { DATABASE_URL: "not-a-database-private-value" },
    {
      DATABASE_URL:
        "postgresql://offline:offline@db.example/hive?sslmode=no-verify",
    },
    { DATABASE_TLS: "disable" },
    { ADMIN_DATABASE_URL: "" },
    { ADMIN_DATABASE_URL: "https://privateSentinel.example/database" },
    {
      ADMIN_DATABASE_URL:
        "postgresql://offline:offline@db.example/hive?sslmode=disable",
    },
    { MIGRATION_DATABASE_URL: configured["ADMIN_DATABASE_URL"] },
    { CHECKOUT_LOCATION_KEY: "" },
    { CHECKOUT_LOCATION_KEY: "../private" },
    { STRIPE_SECRET_KEY: "sk_live_privateSentinel" },
    { STRIPE_SECRET_KEY: "rk_test_privateSentinel" },
    { STRIPE_WEBHOOK_SECRET: "" },
    { STRIPE_WEBHOOK_SECRET: "privateSentinel" },
    { SITE_URL: "" },
    { SITE_URL: "https://privateSentinel:password@shop.example" },
    { SITE_URL: "https://shop.example/redirect" },
    { SITE_URL: "https://shop.example?redirect=privateSentinel" },
    { SITE_URL: "http://shop.example" },
    { SITE_URL: "https://localhost" },
    { SITE_URL: "http://127.0.0.1:4321" },
    { SITE_URL: "https://192.168.1.2" },
  ]) {
    const environment = { ...configured, ...change };
    assert.throws(
      () => prepareCheckoutStartup(environment),
      (error: unknown) => {
        assert(error instanceof Error);
        assert(!error.message.includes("privateSentinel"));
        assert(!error.message.includes("password"));
        return true;
      },
    );
    assert.deepEqual(getCheckoutPresentation(environment), {
      enabled: false,
      locationKey: null,
    });
  }
});

test("disabled mode remains an incident switch even with old private configuration", () => {
  assert.deepEqual(
    getCheckoutPresentation({ ...configured, CHECKOUT_MODE: "disabled" }),
    { enabled: false, locationKey: null },
  );
});

test("showcase readiness remains database-free with checkout off, and liveness stays minimal", async () => {
  const changes: NodeJS.ProcessEnv = {
    CHECKOUT_MODE: "disabled",
    CATALOG_SOURCE: "showcase",
    SITE_INDEXABLE: "false",
    SITE_URL: "https://shop.example",
  };
  const previous = Object.fromEntries(
    Object.keys(changes).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, changes);
  try {
    const response = await ready({} as APIContext);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "ready",
      catalogSource: "showcase",
      inventoryConnected: false,
      checkoutEnabled: false,
    });
    assert.deepEqual(await (await live({} as APIContext)).json(), {
      status: "ok",
    });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
