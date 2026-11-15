import assert from "node:assert/strict";
import test, { after, afterEach, beforeEach } from "node:test";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { Pool } from "pg";
import { migrateDatabase } from "../../scripts/migrate.mjs";
import {
  getAdminStoreSettings,
  updateAdminStoreSettings,
} from "../../src/server/admin/store.ts";
import { AdminError } from "../../src/server/admin/errors.ts";
import { reserveCheckout } from "../../src/server/commerce/orders.ts";
import {
  OrderConflictError,
  StoreClosedError,
} from "../../src/server/commerce/rules.ts";
import { getStorefrontStatus } from "../../src/server/storefront.ts";
import { readConfig } from "../../src/server/config.ts";
import { getCatalog } from "../../src/server/catalog.ts";

const connection = process.env["TEST_DATABASE_URL"];
assert(connection, "Use the isolated true_hive_test database.");
assert.equal(new URL(connection).hostname, "127.0.0.1");
assert.equal(new URL(connection).pathname, "/true_hive_test");
const operator = new Pool({ connectionString: connection, max: 1 });
let pool: Pool;
let schema: string;

beforeEach(async () => {
  schema = `store_${randomUUID().replaceAll("-", "")}`;
  await operator.query(`CREATE SCHEMA "${schema}"`);
  pool = new Pool({
    connectionString: connection,
    options: `-c search_path=${schema}`,
    max: 8,
  });
  await migrateDatabase(pool);
  await pool.query(`
    INSERT INTO products(product_key,slug,title,summary,category,image_key,kind,published)
      VALUES ('soap','soap','Soap','Test-only soap','soap','soap','active',true);
    INSERT INTO product_variants(variant_key,product_key,sku,label,price_minor)
      VALUES ('bar','soap','TEST-BAR','Bar',800);
    INSERT INTO inventory_locations(location_key,name,active,pickup_enabled)
      VALUES ('pickup','Test-only pickup',true,true);
    INSERT INTO inventory_levels(variant_key,location_key,on_hand) VALUES ('bar','pickup',5);
  `);
});
afterEach(async () => {
  await pool.end();
  await operator.query(`DROP SCHEMA "${schema}" CASCADE`);
});
after(async () => {
  await operator.end();
});

function update(purchasesEnabled: boolean, expectedRevision = 1) {
  return { operationId: randomUUID(), expectedRevision, purchasesEnabled };
}
function intent() {
  return {
    operationId: randomUUID(),
    lines: [{ variantKey: "bar", quantity: 1 }],
  };
}
function status(expected: number) {
  return (error: unknown) =>
    error instanceof AdminError && error.status === expected;
}
async function untouched() {
  assert.deepEqual(
    (
      await pool.query(
        "SELECT on_hand,held,committed,revision FROM inventory_levels",
      )
    ).rows,
    [{ on_hand: 5, held: 0, committed: 0, revision: 1 }],
  );
  for (const table of ["orders", "order_lines", "inventory_movements"])
    assert.equal(
      (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n,
      0,
    );
}

test("migration defaults closed, bounds the singleton and does not allocate inventory", async () => {
  assert.deepEqual(await getAdminStoreSettings(pool), {
    purchasesEnabled: false,
    revision: 1,
  });
  await assert.rejects(
    reserveCheckout(pool, intent(), "pickup"),
    StoreClosedError,
  );
  await untouched();
  const catalog = await getCatalog(
    readConfig({
      CATALOG_SOURCE: "database",
      STOREFRONT_LOCATION_KEY: "pickup",
    }),
    pool,
  );
  assert.equal(catalog.products[0]?.variants[0]?.priceMinor, 800);
  assert.equal(catalog.products[0]?.variants[0]?.stock?.state, "low_stock");
  for (const sql of [
    "INSERT INTO storefront_settings(id) VALUES (2)",
    "UPDATE storefront_settings SET revision=0",
    "UPDATE storefront_settings SET purchases_enabled=NULL",
    "UPDATE storefront_settings SET revision=2147483648",
  ])
    await assert.rejects(pool.query(sql));
  assert.deepEqual(await getAdminStoreSettings(pool), {
    purchasesEnabled: false,
    revision: 1,
  });
});

test("store settings migrations preserve the existing photo audit actions", async () => {
  for (const action of ["attach_product_photo", "remove_product_photo"]) {
    await pool.query(
      "INSERT INTO admin_operations(operation_id,actor_key,action,resource_key,request_hash,result) VALUES($1,'fixture-admin',$2,'soap',$3,'{}')",
      [randomUUID(), action, "a".repeat(64)],
    );
  }
  assert.equal(
    (await pool.query("SELECT count(*)::int AS n FROM admin_operations"))
      .rows[0].n,
    2,
  );
});

test("audited settings updates serialize exact retries and retain original receipts after later changes", async () => {
  const input = update(true);
  const receipts = await Promise.all([
    updateAdminStoreSettings(pool, input, "fixture-admin"),
    updateAdminStoreSettings(pool, input, "fixture-admin"),
  ]);
  assert.deepEqual(receipts.map((r) => r.replayed).sort(), [false, true]);
  assert.deepEqual(receipts[0].settings, {
    purchasesEnabled: true,
    revision: 2,
  });
  await reserveCheckout(pool, intent(), "pickup");
  await updateAdminStoreSettings(pool, update(false, 2), "fixture-admin");
  assert.deepEqual(
    await updateAdminStoreSettings(pool, input, "fixture-admin"),
    {
      settings: { purchasesEnabled: true, revision: 2 },
      replayed: true,
    },
  );
  assert.deepEqual(await getAdminStoreSettings(pool), {
    purchasesEnabled: false,
    revision: 3,
  });
  const audit = (
    await pool.query(
      "SELECT actor_key,action,before_data,after_data,result FROM admin_operations WHERE operation_id=$1",
      [input.operationId],
    )
  ).rows[0];
  assert.deepEqual(audit, {
    actor_key: "fixture-admin",
    action: "update_store_settings",
    before_data: { purchasesEnabled: false, revision: 1 },
    after_data: { purchasesEnabled: true, revision: 2 },
    result: { settings: { purchasesEnabled: true, revision: 2 } },
  });
  assert.equal(
    (await pool.query("SELECT count(*)::int AS n FROM admin_operations"))
      .rows[0].n,
    2,
  );
  await assert.rejects(
    pool.query("DELETE FROM admin_operations"),
    /append-only/i,
  );
});

test("stale revisions, changed operation reuse and invalid fields never mutate settings or audit", async () => {
  const input = update(true);
  await updateAdminStoreSettings(pool, input, "fixture-admin");
  for (const [value, actor] of [
    [{ ...input, purchasesEnabled: false }, "fixture-admin"],
    [input, "other-admin"],
    [update(false, 1), "fixture-admin"],
  ] as const)
    await assert.rejects(
      updateAdminStoreSettings(pool, value, actor),
      status(409),
    );
  for (const value of [
    null,
    [],
    {},
    { ...update(false, 2), purchasesEnabled: "false" },
    { ...update(false, 2), expectedRevision: 0 },
    { ...update(false, 2), expectedRevision: 2147483648 },
    { ...update(false, 2), expectedRevision: 1.5 },
    { ...update(false, 2), actorId: "forged-admin" },
    { ...update(false, 2), automaticTax: true },
    { ...update(false, 2), operationId: "not-a-uuid" },
  ])
    await assert.rejects(
      updateAdminStoreSettings(pool, value, "fixture-admin"),
      status(400),
    );
  assert.deepEqual(await getAdminStoreSettings(pool), {
    purchasesEnabled: true,
    revision: 2,
  });
  assert.equal(
    (await pool.query("SELECT count(*)::int AS n FROM admin_operations"))
      .rows[0].n,
    1,
  );
  await pool.query("UPDATE storefront_settings SET revision=2147483647");
  await assert.rejects(
    updateAdminStoreSettings(pool, update(false, 2147483647), "fixture-admin"),
    status(409),
  );
  assert.deepEqual(await getAdminStoreSettings(pool), {
    purchasesEnabled: true,
    revision: 2147483647,
  });
});

test("audit and mutation failures roll back the flag, revision, timestamp and receipt", async () => {
  const before = (await pool.query("SELECT * FROM storefront_settings")).rows;
  for (const table of ["admin_operations", "storefront_settings"]) {
    await pool.query(`
      CREATE FUNCTION reject_store_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Test-only write failure'; END; $$;
      CREATE TRIGGER reject_store_fixture BEFORE INSERT OR UPDATE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION reject_store_fixture();
    `);
    await assert.rejects(
      updateAdminStoreSettings(pool, update(true), "fixture-admin"),
      status(503),
    );
    assert.deepEqual(
      (await pool.query("SELECT * FROM storefront_settings")).rows,
      before,
    );
    assert.equal(
      (await pool.query("SELECT count(*)::int AS n FROM admin_operations"))
        .rows[0].n,
      0,
    );
    await pool.query(
      `DROP TRIGGER reject_store_fixture ON ${table}; DROP FUNCTION reject_store_fixture()`,
    );
  }
});

test("missing and unreadable settings cannot admit new reservations", async () => {
  await pool.query("DELETE FROM storefront_settings");
  await assert.rejects(
    reserveCheckout(pool, intent(), "pickup"),
    StoreClosedError,
  );
  await assert.rejects(getAdminStoreSettings(pool), status(503));
  await assert.rejects(
    updateAdminStoreSettings(pool, update(true), "fixture-admin"),
    status(503),
  );
  await untouched();
  await pool.query("DROP TABLE storefront_settings");
  await assert.rejects(reserveCheckout(pool, intent(), "pickup"));
  assert.deepEqual(
    await getStorefrontStatus(
      readConfig({
        CATALOG_SOURCE: "database",
        DATABASE_URL: connection,
        DATABASE_TLS: "disable",
      }),
      true,
      pool,
    ),
    {
      purchasesEnabled: false,
      checkoutEnabled: false,
      state: "unavailable",
    },
  );
  await untouched();
});

async function blocked(blocker: number): Promise<number> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await pool.query(
      "SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND $1::int=ANY(pg_blocking_pids(pid))",
      [blocker],
    );
    if (result.rows[0]) return result.rows[0].pid;
    await setTimeout(10);
  }
  assert.fail("Expected transaction lock barrier was not reached.");
}

test("close committed before reservation admission rejects without order or stock effects", async () => {
  await updateAdminStoreSettings(pool, update(true), "fixture-admin");
  const barrier = await pool.connect();
  const pid = (await barrier.query("SELECT pg_backend_pid() AS pid")).rows[0]
    .pid;
  await barrier.query("SELECT pg_advisory_lock(5544901)");
  await pool.query(`
    CREATE FUNCTION pause_close_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN PERFORM pg_advisory_xact_lock(5544901); RETURN NEW; END; $$;
    CREATE TRIGGER pause_close_fixture BEFORE INSERT ON admin_operations
      FOR EACH ROW EXECUTE FUNCTION pause_close_fixture();
  `);
  let closing: Promise<unknown> | undefined;
  let rejected: Promise<unknown> | undefined;
  try {
    closing = updateAdminStoreSettings(pool, update(false, 2), "fixture-admin");
    const closingPid = await blocked(pid);
    rejected = assert.rejects(
      reserveCheckout(pool, intent(), "pickup"),
      StoreClosedError,
    );
    await blocked(closingPid);
    await barrier.query("SELECT pg_advisory_unlock(5544901)");
    await Promise.all([closing, rejected]);
    await untouched();
  } finally {
    await barrier.query("SELECT pg_advisory_unlock(5544901)");
    barrier.release();
    await Promise.allSettled([closing, rejected]);
  }
});

test("reservation admitted before close completes gracefully and matching replay remains available", async () => {
  await updateAdminStoreSettings(pool, update(true), "fixture-admin");
  const barrier = await pool.connect();
  const pid = (await barrier.query("SELECT pg_backend_pid() AS pid")).rows[0]
    .pid;
  await barrier.query("BEGIN");
  await barrier.query("SELECT * FROM products FOR UPDATE");
  const input = intent();
  let reserving: ReturnType<typeof reserveCheckout> | undefined;
  let closing: Promise<unknown> | undefined;
  try {
    reserving = reserveCheckout(pool, input, "pickup");
    const reservingPid = await blocked(pid);
    closing = updateAdminStoreSettings(pool, update(false, 2), "fixture-admin");
    await blocked(reservingPid);
    await barrier.query("COMMIT");
    const [order] = await Promise.all([reserving, closing]);
    assert.deepEqual(await reserveCheckout(pool, input, "pickup"), order);
    await assert.rejects(
      reserveCheckout(
        pool,
        {
          ...input,
          lines: [{ variantKey: "bar", quantity: 2 }],
        },
        "pickup",
      ),
      OrderConflictError,
    );
    await assert.rejects(
      reserveCheckout(pool, intent(), "pickup"),
      StoreClosedError,
    );
    assert.deepEqual(
      (await pool.query("SELECT on_hand,held,committed FROM inventory_levels"))
        .rows,
      [{ on_hand: 5, held: 1, committed: 0 }],
    );
  } finally {
    await barrier.query("ROLLBACK");
    barrier.release();
    await Promise.allSettled([reserving, closing]);
  }
});
