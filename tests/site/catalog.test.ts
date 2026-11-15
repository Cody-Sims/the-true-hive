import test from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { readConfig } from "../../src/server/config.ts";
import {
  CatalogUnavailableError,
  getAvailability,
  getCatalog,
  getProduct,
  checkDatabase,
} from "../../src/server/catalog.ts";

const databaseProduct = {
  key: "test-product",
  slug: "test-product",
  title: "Test-only product",
  summary: "Injected fixture, never persisted",
  details: [],
  ingredients: ["First", "<b>Second</b>"],
  category: "soap",
  imageKey: "soap",
  kind: "active",
  variants: [
    { key: "test-format", label: "Test", priceMinor: 100, currency: "USD" },
  ],
};

test("public database products retain ordered ingredients and never spread private stock fields", async () => {
  const config = readConfig({
    CATALOG_SOURCE: "database",
    STOREFRONT_LOCATION_KEY: "test-location",
  });
  for (const [available, expected] of [
    [6, { state: "available" }],
    [500, { state: "available" }],
    [5, { state: "low_stock", remaining: 5 }],
    [1, { state: "low_stock", remaining: 1 }],
    [0, { state: "out_of_stock" }],
    [-1, { state: "out_of_stock" }],
    [null, { state: "unverified" }],
  ] as const) {
    const calls: unknown[][] = [];
    const pool = {
      async query(_sql: string, parameters: unknown[]) {
        calls.push(parameters);
        return {
          rows: [
            {
              ...databaseProduct,
              variants: [
                {
                  ...databaseProduct.variants[0],
                  internalStock: { active: true, pickup: true, available },
                  onHand: 999,
                },
              ],
            },
          ],
        };
      },
    } as unknown as Pool;
    const result = await getCatalog(config, pool);
    assert.deepEqual(
      result.products[0]!.ingredients,
      databaseProduct.ingredients,
    );
    assert.deepEqual(result.products[0]!.variants[0], {
      ...databaseProduct.variants[0],
      stock: expected,
    });
    assert.deepEqual(calls, [[null, "test-location"]]);
    assert.equal(JSON.stringify(result).includes("999"), false);
  }
});

test("stock is omitted without configuration and concepts retain concept semantics", async () => {
  for (const kind of ["active", "concept"]) {
    const pool = {
      async query() {
        return {
          rows: [
            {
              ...databaseProduct,
              kind,
              variants: [
                {
                  ...databaseProduct.variants[0],
                  internalStock: { active: true, pickup: true, available: 2 },
                },
              ],
            },
          ],
        };
      },
    } as unknown as Pool;
    const config = readConfig({
      CATALOG_SOURCE: "database",
      ...(kind === "concept"
        ? { STOREFRONT_LOCATION_KEY: "test-location" }
        : {}),
    });
    const result = await getProduct(config, "test-product", pool);
    assert.equal("stock" in result!.variants[0]!, false);
    assert.equal(
      result!.variants[0]!.priceMinor,
      kind === "concept" ? null : 100,
    );
  }
});

test("availability uses the same bounded stock states and never invents stock for missing levels", async () => {
  const config = readConfig({ CATALOG_SOURCE: "database" });
  for (const [row, expected] of [
    [
      { kind: "active", active: true, pickup: true, available: 3 },
      { state: "low_stock", remaining: 3 },
    ],
    [
      { kind: "active", active: true, pickup: true, available: 12 },
      { state: "available" },
    ],
    [
      { kind: "active", active: true, pickup: true, available: null },
      { state: "unverified" },
    ],
    [
      { kind: "active", active: false, pickup: true, available: 3 },
      { state: "not_offered" },
    ],
    [
      { kind: "active", active: true, pickup: false, available: 3 },
      { state: "not_offered" },
    ],
    [
      { kind: "concept", active: true, pickup: true, available: 3 },
      { state: "concept" },
    ],
  ]) {
    const pool = {
      async query() {
        return { rows: [row] };
      },
    } as unknown as Pool;
    assert.deepEqual(
      await getAvailability(config, "test-format", "test-location", pool),
      { variantKey: "test-format", locationKey: "test-location", ...expected },
    );
  }
  const calls: unknown[][] = [];
  await checkDatabase(config, {
    async query(sql: string, values: unknown[]) {
      calls.push(values);
      return {
        rows: sql.trimStart().startsWith("SELECT")
          ? [{ purchasesEnabled: false, revision: 1 }]
          : [],
      };
    },
  } as unknown as Pool);
  assert.deepEqual(calls, [[null, null], [null, null], undefined, undefined]);
});

test("intentional showcase content is explicit, has no prices, and is not mutable global inventory", async () => {
  const config = readConfig({});
  const catalog = await getCatalog(config);
  assert.equal(catalog.source, "showcase");
  assert.equal(catalog.products.length, 3);
  assert(
    catalog.products.every(
      (product) =>
        product.kind === "concept" &&
        product.variants.every((variant) => variant.priceMinor === null),
    ),
  );
  catalog.products[0]!.title = "Do not retain this change";
  assert.notEqual(
    (await getCatalog(config)).products[0]!.title,
    "Do not retain this change",
  );
});

test("a missing database configuration cannot fall back to concept stock", async () => {
  const config = readConfig({ CATALOG_SOURCE: "database" });
  await assert.rejects(
    getCatalog(config),
    (error: unknown) =>
      error instanceof CatalogUnavailableError &&
      error.code === "NOT_CONFIGURED",
  );
});

test("concept availability is not a physical count and unknown products remain missing", async () => {
  const config = readConfig({});
  const availability = await getAvailability(config, "soap-concept", "pickup");
  assert.deepEqual(availability, {
    variantKey: "soap-concept",
    locationKey: "pickup",
    state: "concept",
  });
  assert.equal(
    await getAvailability(config, "missing-variant", "pickup"),
    null,
  );
  assert.equal(await getProduct(config, "missing-product"), null);
  assert.equal(
    (await getProduct(config, "everyday-soap"))?.title,
    "Everyday soap",
  );
});
