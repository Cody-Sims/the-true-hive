import assert from "node:assert/strict";
import test, { after, afterEach, beforeEach } from "node:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { databaseOptions } from "../../src/server/db/connection.mjs";
import { migrateDatabase } from "../../scripts/migrate.mjs";
import {
  createAdminProduct,
  createAdminLocation,
  getAdminProduct,
  updateAdminProduct,
  deleteAdminProduct,
  deleteAdminVariant,
  adjustAdminStock,
} from "../../src/server/admin/catalog.ts";
import { AdminError } from "../../src/server/admin/errors.ts";

const connection = process.env["TEST_DATABASE_URL"];
assert(connection);
assert.equal(new URL(connection).hostname, "127.0.0.1");
assert.equal(new URL(connection).pathname, "/true_hive_test");
const options = databaseOptions(connection, "disable");
const admin = new Pool({ ...options, max: 1 });
let pool: Pool;
let schema: string;
const actor = "operator:record-actions";
const product = {
  key: "test-product",
  slug: "test-product",
  title: "Test soap",
  summary: "Fixture only",
  details: [],
  ingredients: [],
  category: "soap",
  imageKey: "soap",
  kind: "draft",
};
const variants = [
  {
    key: "test-small",
    sku: "TEST-SMALL",
    label: "Small",
    priceMinor: 500,
    currency: "USD",
    active: true,
  },
  {
    key: "test-large",
    sku: "TEST-LARGE",
    label: "Large",
    priceMinor: 900,
    currency: "USD",
    active: false,
  },
];
const blocked = (error: unknown) =>
  error instanceof AdminError && error.status === 409;
async function fixture() {
  const created = await createAdminProduct(
    pool,
    { operationId: randomUUID(), product, variants },
    actor,
  );
  await createAdminLocation(
    pool,
    {
      operationId: randomUUID(),
      location: {
        key: "test-stock",
        name: "Fixture stock",
        active: true,
        pickupEnabled: true,
      },
    },
    actor,
  );
  return created.product;
}
beforeEach(async () => {
  schema = `catalog_actions_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  pool = new Pool({ ...options, options: `-c search_path=${schema}` });
  await migrateDatabase(pool);
});
afterEach(async () => {
  await pool?.end();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
});
after(async () => {
  await admin.end();
});

test("unused variant/product deletion is revision-safe, audited, replay-safe and never recycles stable keys", async () => {
  await fixture();
  const operation = { operationId: randomUUID(), expectedRevision: 1 };
  const deleted = await deleteAdminVariant(
    pool,
    product.key,
    "test-large",
    operation,
    actor,
  );
  assert.deepEqual(deleted.deleted, {
    type: "variant",
    key: "test-large",
    productKey: product.key,
    revision: 2,
  });
  assert.deepEqual(
    deleted.product.variants.map((variant) => variant.key),
    ["test-small"],
  );
  assert.deepEqual(
    await deleteAdminVariant(pool, product.key, "test-large", operation, actor),
    { ...deleted, replayed: true },
  );
  await assert.rejects(
    deleteAdminVariant(pool, product.key, "test-small", operation, actor),
    blocked,
  );
  await assert.rejects(
    updateAdminProduct(
      pool,
      product.key,
      {
        operationId: randomUUID(),
        expectedRevision: 2,
        action: "save",
        product,
        variants,
      },
      actor,
    ),
    blocked,
  );
  const removeProduct = { operationId: randomUUID(), expectedRevision: 2 };
  const removed = await deleteAdminProduct(
    pool,
    product.key,
    removeProduct,
    actor,
  );
  assert.deepEqual(removed.deleted, {
    type: "product",
    key: product.key,
    productKey: product.key,
    revision: 3,
  });
  assert.equal(await getAdminProduct(pool, product.key), null);
  assert.deepEqual(
    await deleteAdminProduct(pool, product.key, removeProduct, actor),
    { ...removed, replayed: true },
  );
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM inventory_levels"))
      .rows[0].count,
    0,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM admin_operations WHERE action IN ('delete_product','delete_variant')",
      )
    ).rows[0].count,
    2,
  );
  await assert.rejects(
    createAdminProduct(
      pool,
      { operationId: randomUUID(), product, variants },
      actor,
    ),
    blocked,
  );
});

test("stock and zeroed movement history block permanent deletion without changing records", async () => {
  await fixture();
  const change = {
    variantKey: "test-small",
    locationKey: "test-stock",
    reason: "Fixture count",
  };
  await adjustAdminStock(
    pool,
    { ...change, operationId: randomUUID(), expectedRevision: 1, delta: 1 },
    actor,
  );
  await assert.rejects(
    deleteAdminVariant(
      pool,
      product.key,
      "test-small",
      { operationId: randomUUID(), expectedRevision: 1 },
      actor,
    ),
    blocked,
  );
  await adjustAdminStock(
    pool,
    { ...change, operationId: randomUUID(), expectedRevision: 2, delta: -1 },
    actor,
  );
  const before = (
    await pool.query("SELECT * FROM inventory_levels ORDER BY variant_key")
  ).rows;
  await assert.rejects(
    deleteAdminProduct(
      pool,
      product.key,
      { operationId: randomUUID(), expectedRevision: 1 },
      actor,
    ),
    blocked,
  );
  assert.deepEqual(
    (await pool.query("SELECT * FROM inventory_levels ORDER BY variant_key"))
      .rows,
    before,
  );
  assert.equal((await getAdminProduct(pool, product.key))!.revision, 1);
});

test("publication cannot bypass explicit restore, and a published product retains a valid active format", async () => {
  await fixture();
  const real = { ...product, kind: "active" };
  await updateAdminProduct(
    pool,
    product.key,
    {
      operationId: randomUUID(),
      expectedRevision: 1,
      action: "publish",
      product: real,
      variants,
    },
    actor,
  );
  await assert.rejects(
    deleteAdminVariant(
      pool,
      product.key,
      "test-small",
      { operationId: randomUUID(), expectedRevision: 2 },
      actor,
    ),
    blocked,
  );
  await updateAdminProduct(
    pool,
    product.key,
    { operationId: randomUUID(), expectedRevision: 2, action: "archive" },
    actor,
  );
  await assert.rejects(
    updateAdminProduct(
      pool,
      product.key,
      {
        operationId: randomUUID(),
        expectedRevision: 3,
        action: "publish",
        product: real,
        variants,
      },
      actor,
    ),
    (error) => error instanceof AdminError && error.code === "RESTORE_REQUIRED",
  );
  const input = {
    operationId: randomUUID(),
    expectedRevision: 3,
    action: "restore",
  };
  const restored = await updateAdminProduct(pool, product.key, input, actor);
  assert.equal(restored.product.status, "draft");
  assert.equal(restored.product.revision, 4);
  assert.deepEqual(await updateAdminProduct(pool, product.key, input, actor), {
    ...restored,
    replayed: true,
  });
});

test("missing balances and order references never become variant deletion permission", async () => {
  await fixture();
  await pool.query(
    "DELETE FROM inventory_levels WHERE variant_key='test-large'",
  );
  await assert.rejects(
    deleteAdminVariant(
      pool,
      product.key,
      "test-large",
      { operationId: randomUUID(), expectedRevision: 1 },
      actor,
    ),
    blocked,
  );
  await pool.query(
    "INSERT INTO inventory_levels(variant_key,location_key) VALUES('test-large','test-stock')",
  );
  const orderId = randomUUID();
  await pool.query(
    "INSERT INTO orders(order_key,request_hash,location_key,total_minor) VALUES($1,$2,'test-stock',900)",
    [orderId, "a".repeat(64)],
  );
  await pool.query(
    "INSERT INTO order_lines(order_key,variant_key,quantity,price_minor,title,label) VALUES($1,'test-large',1,900,'Fixture soap','Large')",
    [orderId],
  );
  await assert.rejects(
    deleteAdminVariant(
      pool,
      product.key,
      "test-large",
      { operationId: randomUUID(), expectedRevision: 1 },
      actor,
    ),
    blocked,
  );
  assert.equal((await getAdminProduct(pool, product.key))!.revision, 1);
});

test("a current photo or prior photo audit keeps an otherwise unused product archivable rather than deletable", async () => {
  await fixture();
  const photo = {
    id: randomUUID(),
    alt: "Fixture photo",
    width: 1,
    height: 1,
    bytes: 1,
  };
  await pool.query("UPDATE products SET photo=$2::jsonb WHERE product_key=$1", [
    product.key,
    JSON.stringify(photo),
  ]);
  await assert.rejects(
    deleteAdminProduct(
      pool,
      product.key,
      { operationId: randomUUID(), expectedRevision: 1 },
      actor,
    ),
    blocked,
  );
  await pool.query("UPDATE products SET photo=NULL WHERE product_key=$1", [
    product.key,
  ]);
  await pool.query(
    "INSERT INTO admin_operations(operation_id,actor_key,action,resource_key,request_hash,result) VALUES($1,$2,'attach_product_photo',$3,$4,'{}'::jsonb)",
    [randomUUID(), actor, product.key, "b".repeat(64)],
  );
  await assert.rejects(
    deleteAdminProduct(
      pool,
      product.key,
      { operationId: randomUUID(), expectedRevision: 1 },
      actor,
    ),
    blocked,
  );
  assert.equal((await getAdminProduct(pool, product.key))!.revision, 1);
});

test("concurrent deletion retries record one tombstone and an audit failure rolls back every deletion", async () => {
  await fixture();
  const input = { operationId: randomUUID(), expectedRevision: 1 };
  const attempts = await Promise.all([
    deleteAdminVariant(pool, product.key, "test-large", input, actor),
    deleteAdminVariant(pool, product.key, "test-large", input, actor),
  ]);
  assert.deepEqual(attempts.map((result) => result.replayed).sort(), [
    false,
    true,
  ]);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM admin_operations WHERE action='delete_variant'",
      )
    ).rows[0].count,
    1,
  );
  const before = await getAdminProduct(pool, product.key);
  await pool.query(`
    CREATE FUNCTION reject_delete_audit_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.action='delete_product' THEN RAISE EXCEPTION 'fixture audit unavailable'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_delete_audit_fixture BEFORE INSERT ON admin_operations FOR EACH ROW EXECUTE FUNCTION reject_delete_audit_fixture();
  `);
  await assert.rejects(
    deleteAdminProduct(
      pool,
      product.key,
      { operationId: randomUUID(), expectedRevision: 2 },
      actor,
    ),
  );
  assert.deepEqual(await getAdminProduct(pool, product.key), before);
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM inventory_levels"))
      .rows[0].count,
    1,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM admin_operations WHERE action='delete_product'",
      )
    ).rows[0].count,
    0,
  );
});
