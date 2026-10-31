import test from "node:test";
import assert from "node:assert/strict";
import { readConfig } from "../../src/server/config.ts";
import { CatalogUnavailableError } from "../../src/server/catalog.ts";
import { prepareStartup } from "../../src/server/startup.ts";

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
