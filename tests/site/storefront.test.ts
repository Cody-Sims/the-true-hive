import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { readConfig } from "../../src/server/config.ts";
import { getStorefrontStatus } from "../../src/server/storefront.ts";
import { StoreClosedError } from "../../src/server/commerce/rules.ts";
import { checkoutErrorResponse } from "../../src/server/commerce/stripe.ts";
import { GET, PUT } from "../../src/pages/api/admin/store.ts";

const config = readConfig({
  CATALOG_SOURCE: "database",
  DATABASE_URL: "postgresql://127.0.0.1/true_hive_test",
  DATABASE_TLS: "disable",
});
function settingsPool(rows: unknown[]): Pool {
  return {
    async query() {
      return { rows };
    },
  } as unknown as Pool;
}

test("showcase and missing database configuration never access a settings pool", async () => {
  const pool = {
    query() {
      assert.fail("Showcase must not query a database.");
    },
  } as unknown as Pool;
  assert.deepEqual(await getStorefrontStatus(readConfig({}), true, pool), {
    purchasesEnabled: false,
    checkoutEnabled: false,
    state: "unconfigured",
  });
  const missingDatabase = readConfig({ CATALOG_SOURCE: "database" });
  assert.deepEqual(await getStorefrontStatus(missingDatabase, true, pool), {
    purchasesEnabled: false,
    checkoutEnabled: false,
    state: "unconfigured",
  });
});

test("persisted purchases and runtime payment readiness must both permit checkout", async () => {
  for (const purchasesEnabled of [false, true]) {
    for (const paymentReady of [false, true]) {
      assert.deepEqual(
        await getStorefrontStatus(
          config,
          paymentReady,
          settingsPool([{ purchasesEnabled, revision: 1 }]),
        ),
        {
          purchasesEnabled,
          checkoutEnabled: purchasesEnabled && paymentReady,
          state: !purchasesEnabled
            ? "closed"
            : paymentReady
              ? "open"
              : "unconfigured",
        },
      );
    }
  }
});

test("missing, malformed and unreadable settings fail closed without internal details", async () => {
  const pools = [
    settingsPool([]),
    settingsPool([{ purchasesEnabled: "true", revision: 1 }]),
    settingsPool([{ purchasesEnabled: true, revision: 0 }]),
    settingsPool([{ purchasesEnabled: true, revision: 2147483648 }]),
    {
      async query() {
        throw new Error("private connection details");
      },
    } as unknown as Pool,
  ];
  for (const pool of pools)
    assert.deepEqual(await getStorefrontStatus(config, true, pool), {
      purchasesEnabled: false,
      checkoutEnabled: false,
      state: "unavailable",
    });
  assert.deepEqual(
    await getStorefrontStatus({ ...config, databaseUrl: "invalid-url" }, true),
    {
      purchasesEnabled: false,
      checkoutEnabled: false,
      state: "unavailable",
    },
  );
});

test("a definitely closed new checkout has a safe distinct response", async () => {
  const response = checkoutErrorResponse(new StoreClosedError());
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: {
      code: "STORE_CLOSED",
      message: "Store purchases are currently closed.",
    },
  });
});

test("store admin routes require the existing administrator boundary before acquiring a pool", async () => {
  for (const handler of [GET, PUT]) {
    const response = await handler({ locals: {} } as Parameters<
      typeof handler
    >[0]);
    assert(response);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});
