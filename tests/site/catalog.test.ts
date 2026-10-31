import test from "node:test";
import assert from "node:assert/strict";
import { readConfig } from "../../src/server/config.ts";
import {
  CatalogUnavailableError,
  getAvailability,
  getCatalog,
  getProduct,
} from "../../src/server/catalog.ts";

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
