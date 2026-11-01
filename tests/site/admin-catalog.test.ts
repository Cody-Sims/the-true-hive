import test from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import {
  adjustAdminStock,
  createAdminLocation,
  createAdminProduct,
  getAdminProduct,
  listAdminHistory,
  listAdminProducts,
  updateAdminLocation,
  updateAdminProduct,
} from "../../src/server/admin/catalog.ts";
import { AdminError } from "../../src/server/admin/errors.ts";
import { adminRoute, readAdminQuery } from "../../src/server/admin/http.ts";
import type { APIContext } from "astro";
import * as products from "../../src/pages/api/admin/products/index.ts";
import * as productRoute from "../../src/pages/api/admin/products/[key].ts";
import * as locations from "../../src/pages/api/admin/locations/index.ts";
import * as locationRoute from "../../src/pages/api/admin/locations/[key].ts";
import * as adjustments from "../../src/pages/api/admin/adjustments.ts";
import * as history from "../../src/pages/api/admin/history.ts";

const pool = {
  connect() {
    throw new Error("Invalid input reached the database.");
  },
  query() {
    throw new Error("Invalid input reached the database.");
  },
} as unknown as Pool;
const operationId = "078c36d4-8ad1-4638-956f-90ce38d60952";
const actor = "operator:test";
const product = {
  key: "soap",
  slug: "soap",
  title: "Soap",
  summary: "Test soap",
  category: "soap",
  imageKey: "soap",
  kind: "draft",
  details: [],
};
const variant = {
  key: "bar",
  sku: "BAR",
  label: "Bar",
  priceMinor: null,
  currency: "USD",
  active: true,
};
const input = { operationId, product, variants: [variant] };
const invalid = (error: unknown) =>
  error instanceof AdminError && error.status === 400;

test("untrusted product content, incomplete edits and identities fail validation before any database work", async () => {
  for (const changed of [
    { operationId: "bad" },
    { product: { ...product, key: "bad/key" } },
    { product: { ...product, title: " " } },
    { product: { ...product, title: "\ud800" } },
    { product: { ...product, summary: "x".repeat(1001) } },
    { product: { ...product, details: [42] } },
    { product: { ...product, category: "unknown" } },
    { product: { ...product, published: true } },
    { variants: [{ ...variant, priceMinor: 0 }] },
    { variants: [{ ...variant, currency: "EUR" }] },
    { variants: [{ ...variant, active: "true" }] },
    { variants: [variant, variant] },
    { variants: [{ ...variant, onHand: 50 }] },
  ])
    await assert.rejects(
      createAdminProduct(pool, { ...input, ...changed }, actor),
      invalid,
    );
  await assert.rejects(
    createAdminProduct(pool, input, "admin@example.com"),
    invalid,
  );
  await assert.rejects(
    updateAdminProduct(
      pool,
      "soap",
      { ...input, action: "save", expectedRevision: 0 },
      actor,
    ),
    invalid,
  );
  await assert.rejects(
    updateAdminProduct(
      pool,
      "soap",
      {
        ...input,
        action: "save",
        expectedRevision: 1,
        product: { title: "Only title" },
      },
      actor,
    ),
    invalid,
  );
  await assert.rejects(
    updateAdminProduct(
      pool,
      "soap",
      { operationId, action: "delete", expectedRevision: 1 },
      actor,
    ),
    invalid,
  );
  await assert.rejects(getAdminProduct(pool, "bad/key"), invalid);
});

test("location eligibility is explicit and bounded; adjustment revision is required even though legacy service permits omission", async () => {
  for (const location of [
    { key: "room", name: "" },
    { key: "room", name: "Test", pickupEnabled: "yes" },
    { key: "room", name: "Test", publicLabel: "x".repeat(161) },
  ])
    await assert.rejects(
      createAdminLocation(pool, { operationId, location }, actor),
      invalid,
    );
  await assert.rejects(
    updateAdminLocation(
      pool,
      "room",
      {
        operationId,
        expectedRevision: 1,
        location: { name: "Test", active: true },
      },
      actor,
    ),
    invalid,
  );
  for (const changed of [
    { expectedRevision: undefined },
    { delta: 0 },
    { reason: " " },
    { reason: "\ud800" },
  ])
    await assert.rejects(
      adjustAdminStock(
        pool,
        {
          operationId,
          variantKey: "bar",
          locationKey: "room",
          delta: 1,
          reason: "Test",
          expectedRevision: 1,
          ...changed,
        },
        actor,
      ),
      invalid,
    );
});

test("paging and movement filters are bounded, typed and cannot become arbitrary SQL or wildcards", async () => {
  for (const query of [
    { limit: 0 },
    { limit: 101 },
    { limit: null },
    { limit: "25" },
    { offset: 1000001 },
    { offset: 0.5 },
    { offset: null },
    { search: "x".repeat(161) },
    { actorId: "someone" },
  ])
    await assert.rejects(listAdminProducts(pool, query), invalid);
  for (const query of [
    { variantKey: "bad/key" },
    { locationKey: "" },
    { limit: 101 },
    { search: "not a movement filter" },
  ])
    await assert.rejects(listAdminHistory(pool, query), invalid);
});

test("private route adapters deny absent trusted admin before touching handlers or runtime configuration", async () => {
  let accessed = false;
  const route = adminRoute(async () => {
    accessed = true;
    return { secret: "must not be disclosed" };
  }, true);
  for (const handler of [
    route,
    products.GET,
    products.POST,
    productRoute.GET,
    productRoute.PUT,
    locations.GET,
    locations.POST,
    locationRoute.PUT,
    adjustments.POST,
    history.GET,
  ]) {
    const response = await handler({
      locals: {},
      request: new Request("http://127.0.0.1/api/admin/products", {
        method: "POST",
        body: "{}",
      }),
    } as APIContext);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.deepEqual(await response.json(), {
      error: {
        code: "UNAUTHORIZED",
        message: "Administrator authentication is required.",
      },
    });
  }
  assert.equal(accessed, false);
});

test("HTTP query adaptation rejects ambiguous/unsupported parameters instead of silently dropping them", () => {
  const allowed = ["limit", "offset", "search"];
  assert.deepEqual(
    readAdminQuery(
      new URL("http://localhost/?limit=25&offset=0&search=Test"),
      allowed,
    ),
    { limit: 25, offset: 0, search: "Test" },
  );
  for (const query of [
    "limit=25&limit=10",
    "limit=1e2",
    "offset=-1",
    "actorId=forged",
    "limit=101",
    "offset=1000001",
  ]) {
    assert.throws(
      () => readAdminQuery(new URL(`http://localhost/?${query}`), allowed),
      invalid,
    );
  }
});

test("database outages never expose SQL, role or connection exceptions through private reads", async () => {
  const unavailablePool = {
    query() {
      throw new Error(
        "SQL SELECT private_table failed for private_role at postgresql://fake-user:fake-password@localhost/db",
      );
    },
  } as unknown as Pool;
  await assert.rejects(
    getAdminProduct(unavailablePool, "soap"),
    (error: unknown) => {
      assert(error instanceof AdminError);
      assert.equal(error.status, 503);
      assert.equal(error.code, "ADMIN_UNAVAILABLE");
      assert.equal(
        error.message,
        "Inventory administration is temporarily unavailable.",
      );
      return true;
    },
  );
});
