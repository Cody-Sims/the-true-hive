import test from "node:test";
import assert from "node:assert/strict";
import { ConfigurationError, readConfig } from "../../src/server/config.ts";
import { CatalogUnavailableError } from "../../src/server/catalog.ts";
import {
  prepareStartup,
  prepareAdminStartup,
} from "../../src/server/startup.ts";
import { readAdminConfig } from "../../src/server/admin/config.ts";

test("database-mode startup must not proceed without its configured backend", async () => {
  await assert.rejects(
    prepareStartup(readConfig({ CATALOG_SOURCE: "database" })),
    (error: unknown) =>
      error instanceof CatalogUnavailableError &&
      error.code === "NOT_CONFIGURED",
  );
});

test("deliberate showcase startup does not require a running database", async () => {
  await assert.doesNotReject(prepareStartup(readConfig({})));
});

test("native startup rejects an unsupported checkout mode before serving", async () => {
  const previous = process.env["CHECKOUT_MODE"];
  process.env["CHECKOUT_MODE"] = "stripe-live";
  try {
    await assert.rejects(
      prepareStartup(readConfig({}), undefined, readAdminConfig({})),
      ConfigurationError,
    );
  } finally {
    if (previous === undefined) delete process.env["CHECKOUT_MODE"];
    else process.env["CHECKOUT_MODE"] = previous;
  }
});

test("explicit disabled admin startup invokes neither database nor provider", async () => {
  let calls = 0;
  await prepareAdminStartup(readAdminConfig({}), {
    async checkDatabase() {
      calls++;
    },
    async checkProvider() {
      calls++;
    },
  });
  assert.equal(calls, 0);
});

test("enabled admin startup stops on an unsafe writer role before provider work", async () => {
  let providerCalls = 0;
  await assert.rejects(
    prepareAdminStartup(
      { ...readAdminConfig({}), enabled: true },
      {
        async checkDatabase() {
          throw new Error("unsafe role");
        },
        async checkProvider() {
          providerCalls++;
        },
      },
    ),
  );
  assert.equal(providerCalls, 0);
});

test("enabled admin startup requires ready TOTP configuration, not just database availability", async () => {
  let databaseCalls = 0;
  await assert.rejects(
    prepareAdminStartup(
      { ...readAdminConfig({}), enabled: true },
      {
        async checkDatabase() {
          databaseCalls++;
        },
        async checkProvider() {
          throw new Error("TOTP disabled");
        },
      },
    ),
  );
  assert.equal(databaseCalls, 1);
});
