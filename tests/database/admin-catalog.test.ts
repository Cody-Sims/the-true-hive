import test, { after, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import {
  adjustAdminStock,
  createAdminLocation,
  createAdminProduct,
  getAdminProduct,
  listAdminHistory,
  listAdminLocations,
  listAdminProducts,
  updateAdminLocation,
  updateAdminProduct,
} from "../../src/server/admin/catalog.ts";
import { AdminError } from "../../src/server/admin/errors.ts";
import { getCatalog } from "../../src/server/catalog.ts";
import { readConfig } from "../../src/server/config.ts";

const connection = process.env["TEST_DATABASE_URL"];
assert(
  connection,
  "TEST_DATABASE_URL must identify the isolated native database.",
);
const url = new URL(connection);
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55483");
assert.equal(url.pathname, "/true_hive_test");
const admin = new Pool({ connectionString: connection, max: 1 });
let schema: string;
let pool: Pool;
const actor = "operator:catalog-test";
const product = {
  key: "test-soap",
  slug: "test-soap",
  title: "Test soap",
  summary: "Private test-only draft",
  details: ["A test-only detail"],
  category: "soap",
  imageKey: "soap",
  kind: "draft",
};
const variants = [
  {
    key: "test-bar",
    sku: "TEST-BAR",
    label: "Bar",
    priceMinor: null,
    currency: "USD",
    active: true,
  },
  {
    key: "test-box",
    sku: "TEST-BOX",
    label: "Box",
    priceMinor: null,
    currency: "USD",
    active: false,
  },
];
const draft = () => ({ operationId: randomUUID(), product, variants });
const location = () => ({
  operationId: randomUUID(),
  location: { key: "test-room", name: "Private test room" },
});
const status = (expected: number, code?: string) => (error: unknown) =>
  error instanceof AdminError &&
  error.status === expected &&
  (!code || error.code === code);
const config = readConfig({
  CATALOG_SOURCE: "database",
  DATABASE_SSL: "disable",
});

beforeEach(async () => {
  schema = `admin_catalog_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  pool = new Pool({
    connectionString: connection,
    options: `-c search_path=${schema}`,
  });
  for (const file of ["001_inventory.sql", "002_admin_commerce.sql"]) {
    await pool.query(
      await readFile(
        new URL(`../../migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  }
});
afterEach(async () => {
  await pool?.end();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
});
after(async () => {
  await admin.end();
});

test("draft creation is atomic, private, zero-balanced across genuine locations and retry-safe", async () => {
  const place = await createAdminLocation(pool, location(), actor);
  assert.deepEqual(place.location, {
    key: "test-room",
    name: "Private test room",
    publicLabel: null,
    active: false,
    pickupEnabled: false,
    revision: 1,
  });
  const input = draft();
  const result = await createAdminProduct(pool, input, actor);
  assert.equal(result.replayed, false);
  assert.equal(result.product.status, "draft");
  assert.equal(result.product.revision, 1);
  assert.deepEqual(
    result.product.variants.map((v) => v.key),
    ["test-bar", "test-box"],
  );
  assert.deepEqual(result.product.variants[0].levels, [
    {
      variantKey: "test-bar",
      locationKey: "test-room",
      onHand: 0,
      held: 0,
      committed: 0,
      unavailable: 0,
      sellable: 0,
      revision: 1,
    },
  ]);
  assert.equal(result.product.variants[0].sku, "TEST-BAR");
  assert.equal(result.product.variants[0].priceMinor, null);
  assert.deepEqual(await getCatalog(config, pool), {
    source: "database",
    products: [],
  });
  assert.deepEqual(await createAdminProduct(pool, input, actor), {
    ...result,
    replayed: true,
  });
  assert.deepEqual(
    (
      await pool.query(
        "SELECT (SELECT count(*)::int FROM products) AS products,(SELECT count(*)::int FROM inventory_levels) AS levels,(SELECT count(*)::int FROM admin_operations) AS operations,(SELECT count(*)::int FROM inventory_movements) AS movements",
      )
    ).rows,
    [{ products: 1, levels: 2, operations: 2, movements: 0 }],
  );
  const audit = (
    await pool.query(
      "SELECT actor_key,action,result FROM admin_operations WHERE operation_id=$1",
      [input.operationId],
    )
  ).rows[0];
  assert.equal(audit.actor_key, actor);
  assert.equal(audit.action, "create_product");
  assert.equal("levels" in audit.result.product.variants[0], false);
});

test("publish validates the complete active USD product and public reads use the committed source; archive preserves allocations and immutable references", async () => {
  await createAdminLocation(pool, location(), actor);
  await createAdminProduct(pool, draft(), actor);
  const edit = {
    operationId: randomUUID(),
    expectedRevision: 1,
    action: "publish",
    product,
    variants,
  };
  await assert.rejects(
    updateAdminProduct(pool, product.key, edit, actor),
    status(400),
  );
  await assert.rejects(
    updateAdminProduct(
      pool,
      product.key,
      { ...edit, product: { ...product, kind: "active" } },
      actor,
    ),
    status(400),
  );
  assert.equal((await getAdminProduct(pool, product.key))?.revision, 1);
  const published = await updateAdminProduct(
    pool,
    product.key,
    {
      ...edit,
      product: { ...product, kind: "active" },
      variants: variants.map((v) => ({ ...v, priceMinor: 800 })),
    },
    actor,
  );
  assert.equal(published.product.status, "published");
  assert.equal(published.product.revision, 2);
  const publicView = await getCatalog(config, pool);
  assert.equal(publicView.products.length, 1);
  assert.deepEqual(publicView.products[0]?.variants, [
    { key: "test-bar", label: "Bar", priceMinor: 800, currency: "USD" },
  ]);
  assert.equal("sku" in publicView.products[0]!.variants[0]!, false);
  await adjustAdminStock(
    pool,
    {
      operationId: randomUUID(),
      variantKey: "test-bar",
      locationKey: "test-room",
      delta: 5,
      reason: "Test receipt before archive",
      expectedRevision: 1,
    },
    actor,
  );
  await pool.query(
    "UPDATE inventory_levels SET held=2,committed=1 WHERE variant_key='test-bar'",
  );
  const orderId = randomUUID();
  await pool.query(
    "INSERT INTO orders (order_key,request_hash,location_key,total_minor) VALUES ($1,$2,'test-room',800)",
    [orderId, "a".repeat(64)],
  );
  await pool.query(
    "INSERT INTO order_lines (order_key,variant_key,quantity,price_minor,title,label) VALUES ($1,'test-bar',1,800,'Test soap','Bar')",
    [orderId],
  );
  const archived = await updateAdminProduct(
    pool,
    product.key,
    { operationId: randomUUID(), expectedRevision: 2, action: "archive" },
    actor,
  );
  assert.equal(archived.product.status, "archived");
  assert.equal(archived.product.revision, 3);
  assert.deepEqual((await getCatalog(config, pool)).products, []);
  assert.deepEqual(
    (
      await pool.query(
        "SELECT on_hand,held,committed FROM inventory_levels WHERE variant_key='test-bar'",
      )
    ).rows,
    [{ on_hand: 5, held: 2, committed: 1 }],
  );
  assert.equal(
    (await pool.query("SELECT count(*)::int AS n FROM order_lines")).rows[0].n,
    1,
  );
  assert.equal(
    (await pool.query("SELECT count(*)::int AS n FROM product_variants"))
      .rows[0].n,
    2,
  );
  assert.equal((await listAdminHistory(pool)).length, 1);
});

test("revision and canonical intent conflicts preserve original receipts even after later edits", async () => {
  const input = draft();
  const created = await createAdminProduct(pool, input, actor);
  const edit = {
    operationId: randomUUID(),
    expectedRevision: 1,
    action: "save",
    product: { ...product, title: "Edited title" },
    variants,
  };
  const competingEdit = {
    ...edit,
    operationId: randomUUID(),
    product: { ...product, title: "Competing title" },
  };
  const [a, b] = await Promise.allSettled([
    updateAdminProduct(pool, product.key, edit, actor),
    updateAdminProduct(pool, product.key, competingEdit, actor),
  ]);
  assert.equal([a, b].filter((r) => r.status === "fulfilled").length, 1);
  const rejected = [a, b].find((r) => r.status === "rejected");
  assert(rejected?.status === "rejected" && status(409)(rejected.reason));
  assert.equal((await getAdminProduct(pool, product.key))?.revision, 2);
  const winningEdit = a.status === "fulfilled" ? edit : competingEdit;
  const winner =
    a.status === "fulfilled"
      ? a.value
      : b.status === "fulfilled"
        ? b.value
        : null;
  assert(winner);
  assert.deepEqual(
    await updateAdminProduct(pool, product.key, winningEdit, actor),
    { ...winner, replayed: true },
  );
  assert.deepEqual(await createAdminProduct(pool, input, actor), {
    ...created,
    replayed: true,
  });
  for (const changed of [
    { ...input, product: { ...product, title: "Different intent" } },
    { ...input, variants: [...variants].reverse() },
  ])
    await assert.rejects(createAdminProduct(pool, changed, actor), status(409));
  await assert.rejects(
    createAdminProduct(pool, input, "operator:other"),
    status(409),
  );
  await assert.rejects(
    createAdminLocation(
      pool,
      {
        operationId: input.operationId,
        location: { key: product.key, name: "Other resource" },
      },
      actor,
    ),
    status(409),
  );
  assert.equal(
    (await pool.query("SELECT count(*)::int AS n FROM admin_operations"))
      .rows[0].n,
    2,
  );
});

test("new locations and new variants create only zero pairs; incomplete edits and stable key/SKU changes are rejected", async () => {
  await createAdminProduct(pool, draft(), actor);
  await createAdminLocation(pool, location(), actor);
  const change = {
    operationId: randomUUID(),
    expectedRevision: 1,
    location: {
      key: "test-room",
      name: "Real test pickup",
      publicLabel: "Test pickup",
      active: true,
      pickupEnabled: true,
    },
  };
  const updated = await updateAdminLocation(pool, "test-room", change, actor);
  assert.equal(updated.location.revision, 2);
  assert.deepEqual(
    await updateAdminLocation(pool, "test-room", change, actor),
    { ...updated, replayed: true },
  );
  await assert.rejects(
    updateAdminLocation(
      pool,
      "test-room",
      { ...change, operationId: randomUUID() },
      actor,
    ),
    status(409),
  );
  await assert.rejects(
    updateAdminLocation(
      pool,
      "test-room",
      {
        operationId: randomUUID(),
        expectedRevision: 2,
        location: { name: "Missing eligibility" },
      },
      actor,
    ),
    status(400),
  );
  const edit = {
    operationId: randomUUID(),
    expectedRevision: 1,
    action: "save",
    product,
    variants,
  };
  await assert.rejects(
    updateAdminProduct(
      pool,
      product.key,
      { ...edit, variants: [variants[0]] },
      actor,
    ),
    status(409),
  );
  await assert.rejects(
    updateAdminProduct(
      pool,
      product.key,
      {
        ...edit,
        variants: variants.map((v) => ({ ...v, sku: `${v.sku}-changed` })),
      },
      actor,
    ),
    status(409),
  );
  await assert.rejects(
    updateAdminProduct(
      pool,
      product.key,
      { ...edit, product: { title: "Missing required content" } },
      actor,
    ),
    status(400),
  );
  await updateAdminProduct(
    pool,
    product.key,
    {
      ...edit,
      variants: [
        ...variants,
        { ...variants[0], key: "test-extra", sku: "TEST-EXTRA" },
      ],
    },
    actor,
  );
  assert.deepEqual(
    (
      await pool.query(
        "SELECT variant_key,on_hand,revision FROM inventory_levels ORDER BY variant_key",
      )
    ).rows,
    [
      { variant_key: "test-bar", on_hand: 0, revision: 1 },
      { variant_key: "test-box", on_hand: 0, revision: 1 },
      { variant_key: "test-extra", on_hand: 0, revision: 1 },
    ],
  );
  assert.equal((await listAdminLocations(pool)).length, 1);
});

test("stock requires a reviewed revision, trusts only the server actor, protects held units and distinguishes original receipt from current balance", async () => {
  await createAdminLocation(pool, location(), actor);
  await createAdminProduct(pool, draft(), actor);
  const input = {
    operationId: randomUUID(),
    variantKey: "test-bar",
    locationKey: "test-room",
    delta: 5,
    expectedRevision: 1,
    reason: "Test receipt",
    actorId: "forged:browser",
  };
  const first = await adjustAdminStock(pool, input, actor);
  assert.deepEqual(first.adjustment, {
    operationId: input.operationId,
    variantKey: "test-bar",
    locationKey: "test-room",
    beforeOnHand: 0,
    onHand: 5,
    replayed: false,
  });
  await pool.query(
    "UPDATE inventory_levels SET held=3,committed=1,revision=revision+1 WHERE variant_key='test-bar'",
  );
  await assert.rejects(
    adjustAdminStock(
      pool,
      { ...input, operationId: randomUUID(), delta: -2, expectedRevision: 3 },
      actor,
    ),
    status(409),
  );
  await assert.rejects(
    adjustAdminStock(
      pool,
      { ...input, operationId: randomUUID(), expectedRevision: undefined },
      actor,
    ),
    status(400),
  );
  await adjustAdminStock(
    pool,
    { ...input, operationId: randomUUID(), delta: 2, expectedRevision: 3 },
    actor,
  );
  const retry = await adjustAdminStock(pool, input, actor);
  assert.deepEqual(retry.adjustment, { ...first.adjustment, replayed: true });
  assert.deepEqual(retry.level, {
    variantKey: "test-bar",
    locationKey: "test-room",
    onHand: 7,
    held: 3,
    committed: 1,
    unavailable: 0,
    sellable: 3,
    revision: 4,
  });
  await assert.rejects(
    adjustAdminStock(pool, input, "operator:other"),
    status(409),
  );
  const history = await listAdminHistory(pool, {
    variantKey: "test-bar",
    locationKey: "test-room",
    limit: 1,
  });
  assert.equal(history.length, 1);
  assert.equal(history[0].actorId, actor);
  assert.equal(history[0].onHand, 7);
  assert.equal(typeof history[0].createdAt, "string");
  assert.equal(
    (await pool.query("SELECT count(*)::int AS n FROM inventory_movements"))
      .rows[0].n,
    2,
  );
});

test("duplicate SKU and the native audit JSON budget roll back product, variants, levels and operation writes", async () => {
  await createAdminLocation(pool, location(), actor);
  const input = draft();
  const tooLarge = {
    ...input,
    product: {
      ...product,
      details: Array.from({ length: 12 }, () => "🧪".repeat(2000)),
    },
  };
  await assert.rejects(
    createAdminProduct(pool, tooLarge, actor),
    status(400, "AUDIT_TOO_LARGE"),
  );
  assert.deepEqual(
    (
      await pool.query(
        "SELECT (SELECT count(*)::int FROM products) AS p,(SELECT count(*)::int FROM product_variants) AS v,(SELECT count(*)::int FROM inventory_levels) AS l,(SELECT count(*)::int FROM admin_operations) AS a",
      )
    ).rows,
    [{ p: 0, v: 0, l: 0, a: 1 }],
  );
  await createAdminProduct(pool, input, actor);
  await assert.rejects(
    createAdminProduct(
      pool,
      {
        operationId: randomUUID(),
        product: { ...product, key: "other-soap", slug: "other-soap" },
        variants: [{ ...variants[0], key: "other-bar" }],
      },
      actor,
    ),
    status(409),
  );
  await assert.rejects(
    updateAdminProduct(
      pool,
      product.key,
      {
        operationId: randomUUID(),
        expectedRevision: 1,
        action: "save",
        product: { ...product, title: "Must roll back" },
        variants: [
          ...variants,
          { ...variants[0], key: "collision", sku: variants[1]!.sku },
        ],
      },
      actor,
    ),
    status(400),
  );
  await assert.rejects(
    updateAdminProduct(
      pool,
      product.key,
      {
        operationId: randomUUID(),
        expectedRevision: 1,
        action: "save",
        product: tooLarge.product,
        variants,
      },
      actor,
    ),
    status(400, "AUDIT_TOO_LARGE"),
  );
  assert.equal(
    (await getAdminProduct(pool, product.key))?.title,
    product.title,
  );
  assert.equal((await getAdminProduct(pool, product.key))?.revision, 1);
  assert.deepEqual(
    (
      await pool.query(
        "SELECT (SELECT count(*)::int FROM products) AS p,(SELECT count(*)::int FROM product_variants) AS v,(SELECT count(*)::int FROM inventory_levels) AS l,(SELECT count(*)::int FROM admin_operations) AS a",
      )
    ).rows,
    [{ p: 1, v: 2, l: 2, a: 2 }],
  );
});

test("private listing bounds search and pagination, keeps drafts and inactive variants and returns not-found honestly", async () => {
  await createAdminProduct(pool, draft(), actor);
  const result = await listAdminProducts(pool, {
    search: "TEST-BOX",
    limit: 1,
    offset: 0,
  });
  assert.equal(result.total, 1);
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].variants.length, 2);
  assert.deepEqual(result.locations, []);
  assert.deepEqual((await listAdminProducts(pool, { offset: 1 })).products, []);
  assert.equal((await listAdminProducts(pool, { search: "%" })).total, 0);
  assert.equal(await getAdminProduct(pool, "not-found"), null);
  for (const query of [
    { limit: 101 },
    { offset: -1 },
    { search: "x".repeat(161) },
  ])
    await assert.rejects(listAdminProducts(pool, query), status(400));
  await assert.rejects(
    updateAdminProduct(
      pool,
      "not-found",
      { operationId: randomUUID(), expectedRevision: 1, action: "archive" },
      actor,
    ),
    status(404),
  );
});
