import test, { after, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { Pool } from "pg";
import { databaseOptions } from "../../src/server/db/connection.mjs";
import { migrateDatabase } from "../../scripts/migrate.mjs";
import { adjustStock } from "../../src/server/inventory/adjust.ts";
import { InventoryConflictError } from "../../src/server/inventory/rules.ts";

const connection = process.env["TEST_DATABASE_URL"];
assert(
  connection,
  "Set TEST_DATABASE_URL to the isolated true_hive_test database.",
);
assert.equal(new URL(connection).pathname, "/true_hive_test");
const options = databaseOptions(connection, "disable");
const admin = new Pool({ ...options, max: 1 });
let schema: string;
let pool: Pool;
const hash = "a".repeat(64);

beforeEach(async () => {
  schema = `schema_phase_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  pool = new Pool({ ...options, options: `-c search_path=${schema}` });
});

afterEach(async () => {
  await pool?.end();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
});

after(async () => {
  await admin.end();
});

function databaseCode(code: string) {
  return (error: unknown) =>
    Boolean(
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === code,
    );
}

async function fixture() {
  await pool.query(
    "INSERT INTO products (product_key,slug,title,summary,category,image_key,kind,published) VALUES ('test-product','test-product','Test soap','Test-only summary','soap','soap','active',true)",
  );
  await pool.query(
    "INSERT INTO product_variants (variant_key,product_key,sku,label,price_minor) VALUES ('test-variant','test-product','test-sku','Test format',800)",
  );
  await pool.query(
    "INSERT INTO inventory_locations (location_key,name,active,pickup_enabled) VALUES ('test-location','Test-only location',true,true)",
  );
  await pool.query(
    "INSERT INTO inventory_levels (variant_key,location_key,on_hand) VALUES ('test-variant','test-location',3)",
  );
}

test("002 preserves applied 001 checksums, stable keys and append-only legacy receipts", async () => {
  const directory = new URL(
    `../../.inventory-legacy-migration-${randomUUID()}/`,
    import.meta.url,
  );
  await mkdir(directory);
  try {
    const original = await readFile(
      new URL("../../migrations/001_inventory.sql", import.meta.url),
      "utf8",
    );
    await writeFile(new URL("001_inventory.sql", directory), original);
    assert.deepEqual(await migrateDatabase(pool, directory), [
      "001_inventory.sql",
    ]);
    await fixture();
    const change = {
      operationId: randomUUID(),
      variantKey: "test-variant",
      locationKey: "test-location",
      delta: 2,
      actorId: "operator:test",
      reason: "Legacy receipt",
    };
    await pool.query(
      "INSERT INTO inventory_movements (operation_id,variant_key,location_key,delta,actor_id,reason,before_on_hand,after_on_hand) VALUES ($1,$2,$3,$4,$5,$6,1,3)",
      [
        change.operationId,
        change.variantKey,
        change.locationKey,
        change.delta,
        change.actorId,
        change.reason,
      ],
    );
    const legacy = (
      await pool.query(
        "SELECT * FROM inventory_movements WHERE operation_id=$1",
        [change.operationId],
      )
    ).rows[0];
    assert.deepEqual(await migrateDatabase(pool), ["002_admin_commerce.sql"]);
    assert.deepEqual(await migrateDatabase(pool), []);
    assert.equal(
      (
        await pool.query(
          "SELECT checksum FROM schema_migrations WHERE name='001_inventory.sql'",
        )
      ).rows[0].checksum,
      createHash("sha256").update(original).digest("hex"),
    );
    assert.deepEqual(
      (
        await pool.query(
          "SELECT * FROM inventory_movements WHERE operation_id=$1",
          [change.operationId],
        )
      ).rows,
      [{ ...legacy, before_revision: null, after_revision: null }],
    );
    assert.deepEqual(await adjustStock(pool, change), {
      operationId: change.operationId,
      variantKey: "test-variant",
      locationKey: "test-location",
      beforeOnHand: 1,
      onHand: 3,
      replayed: true,
    });
    await assert.rejects(
      adjustStock(pool, { ...change, expectedRevision: 1 }),
      InventoryConflictError,
    );
    await adjustStock(pool, {
      ...change,
      operationId: randomUUID(),
      delta: -1,
      expectedRevision: 1,
    });
    assert.deepEqual(
      (
        await pool.query(
          "SELECT variant_key,location_key,on_hand,held,revision FROM inventory_levels",
        )
      ).rows,
      [
        {
          variant_key: "test-variant",
          location_key: "test-location",
          on_hand: 2,
          held: 0,
          revision: 2,
        },
      ],
    );
    await assert.rejects(
      pool.query(
        "UPDATE inventory_movements SET before_revision=1 WHERE operation_id=$1",
        [change.operationId],
      ),
      databaseCode("55000"),
    );
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("new allocation and archive constraints reject invalid counts with overflow-safe arithmetic", async () => {
  assert.deepEqual(await migrateDatabase(pool), [
    "001_inventory.sql",
    "002_admin_commerce.sql",
  ]);
  await fixture();
  for (const sql of [
    "UPDATE inventory_levels SET held=-1",
    "UPDATE inventory_levels SET held=4",
    "UPDATE inventory_levels SET on_hand=2147483647,held=2147483647,committed=1",
    "UPDATE inventory_levels SET revision=0",
    "UPDATE inventory_locations SET revision=0",
    "UPDATE products SET revision=0",
    "UPDATE products SET archived=true",
  ]) {
    await assert.rejects(pool.query(sql), databaseCode("23514"));
  }
  await pool.query("UPDATE products SET archived=true,published=false");
  await assert.rejects(
    pool.query("UPDATE products SET published=true"),
    databaseCode("23514"),
  );
  await assert.rejects(
    pool.query(
      "INSERT INTO inventory_movements (operation_id,variant_key,location_key,delta,actor_id,reason,before_on_hand,after_on_hand,before_revision,after_revision) VALUES ($1,'test-variant','test-location',1,'operator:test','Invalid revision',2,3,0,1)",
      [randomUUID()],
    ),
    databaseCode("23514"),
  );
  assert.deepEqual(
    (
      await pool.query(
        "SELECT on_hand,held,committed,revision FROM inventory_levels",
      )
    ).rows,
    [{ on_hand: 3, held: 0, committed: 0, revision: 1 }],
  );
});

test("admin records bound identity, session hashes and append-only operation payloads", async () => {
  await migrateDatabase(pool);
  await pool.query("INSERT INTO admin_memberships (uid) VALUES ('test-admin')");
  await pool.query(
    "INSERT INTO admin_sessions (session_hash,uid,expires_at) VALUES ($1,'test-admin',CURRENT_TIMESTAMP + interval '1 hour')",
    [hash],
  );
  await assert.rejects(
    pool.query("INSERT INTO admin_memberships (uid) VALUES ($1)", [
      "u".repeat(129),
    ]),
    databaseCode("23514"),
  );
  await assert.rejects(
    pool.query(
      "INSERT INTO admin_sessions (session_hash,uid,expires_at) VALUES ($1,'test-admin',CURRENT_TIMESTAMP)",
      ["A".repeat(64)],
    ),
    databaseCode("23514"),
  );
  await assert.rejects(
    pool.query(
      "INSERT INTO admin_sessions (session_hash,uid,expires_at) VALUES ($1,'missing-member',CURRENT_TIMESTAMP)",
      ["b".repeat(64)],
    ),
    databaseCode("23503"),
  );
  const operationId = randomUUID();
  await pool.query(
    "INSERT INTO admin_operations (operation_id,actor_key,action,resource_key,request_hash,result) VALUES ($1,'operator:test','create_product','test-product',$2,'{\"created\":true}')",
    [operationId, hash],
  );
  for (const [actor, action, resource, requestHash, result] of [
    ["user@example.com", "create_product", "product", hash, "{}"],
    ["operator:test", "delete_product", "product", hash, "{}"],
    ["operator:test", "create_product", "x".repeat(81), hash, "{}"],
    ["operator:test", "create_product", "product", "not-a-hash", "{}"],
    [
      "operator:test",
      "create_product",
      "product",
      hash,
      JSON.stringify({ note: "é".repeat(32768) }),
    ],
  ]) {
    await assert.rejects(
      pool.query(
        "INSERT INTO admin_operations (operation_id,actor_key,action,resource_key,request_hash,result) VALUES ($1,$2,$3,$4,$5,$6::jsonb)",
        [randomUUID(), actor, action, resource, requestHash, result],
      ),
      databaseCode("23514"),
    );
  }
  for (const sql of [
    "UPDATE admin_operations SET result='{}'",
    "DELETE FROM admin_operations",
    "TRUNCATE admin_operations",
  ]) {
    await assert.rejects(pool.query(sql), databaseCode("55000"));
  }
  assert.deepEqual(
    (await pool.query("SELECT operation_id,result FROM admin_operations")).rows,
    [{ operation_id: operationId, result: { created: true } }],
  );
  await pool.query("UPDATE admin_sessions SET revoked_at=CURRENT_TIMESTAMP");
  await pool.query("UPDATE admin_memberships SET active=false");
});

test("orders enforce bounded snapshots, unique provider identities and immutable payment history", async () => {
  await migrateDatabase(pool);
  await fixture();
  const orderId = randomUUID();
  const orderSql =
    "INSERT INTO orders (order_key,request_hash,location_key,state,total_minor,currency,checkout_session_id) VALUES ($1,$2,$3,$4,$5,$6,$7)";
  await pool.query(orderSql, [
    orderId,
    hash,
    "test-location",
    "creating",
    800,
    "USD",
    "cs_test_fixture",
  ]);
  for (const [requestHash, location, state, total, currency, session] of [
    ["bad-hash", "test-location", "creating", 800, "USD", null],
    [hash, "test-location", "refunded", 800, "USD", null],
    [hash, "test-location", "creating", 0, "USD", null],
    [hash, "test-location", "creating", 800, "EUR", null],
    [hash, "test-location", "creating", 800, "USD", "s".repeat(256)],
  ]) {
    await assert.rejects(
      pool.query(orderSql, [
        randomUUID(),
        requestHash,
        location,
        state,
        total,
        currency,
        session,
      ]),
      databaseCode("23514"),
    );
  }
  await assert.rejects(
    pool.query(orderSql, [
      randomUUID(),
      hash,
      "missing-location",
      "creating",
      800,
      "USD",
      null,
    ]),
    databaseCode("23503"),
  );
  await assert.rejects(
    pool.query(orderSql, [
      randomUUID(),
      hash,
      "test-location",
      "creating",
      800,
      "USD",
      "cs_test_fixture",
    ]),
    databaseCode("23505"),
  );
  const lineSql =
    "INSERT INTO order_lines (order_key,variant_key,quantity,price_minor,title,label) VALUES ($1,$2,$3,$4,$5,$6)";
  for (const [quantity, price, title, label] of [
    [0, 800, "Test soap", "Test format"],
    [101, 800, "Test soap", "Test format"],
    [1, 0, "Test soap", "Test format"],
    [1, 800, "t".repeat(161), "Test format"],
    [1, 800, "Test soap", "l".repeat(161)],
  ]) {
    await assert.rejects(
      pool.query(lineSql, [
        orderId,
        "test-variant",
        quantity,
        price,
        title,
        label,
      ]),
      databaseCode("23514"),
    );
  }
  await pool.query(lineSql, [
    orderId,
    "test-variant",
    1,
    800,
    "Test soap",
    "Test format",
  ]);
  await assert.rejects(
    pool.query(lineSql, [
      orderId,
      "test-variant",
      1,
      800,
      "Test soap",
      "Test format",
    ]),
    databaseCode("23505"),
  );
  const eventSql =
    "INSERT INTO payment_events (event_key,event_type,order_key,request_hash,result) VALUES ($1,'checkout.session.completed',$2,$3,'paid')";
  await pool.query(eventSql, ["evt_test_fixture", orderId, hash]);
  await assert.rejects(
    pool.query(eventSql, ["evt_test_fixture", orderId, hash]),
    databaseCode("23505"),
  );
  await assert.rejects(
    pool.query(eventSql, ["e".repeat(256), orderId, hash]),
    databaseCode("23514"),
  );
  for (const sql of [
    "UPDATE order_lines SET quantity=2",
    "DELETE FROM order_lines",
    "TRUNCATE order_lines",
    "UPDATE payment_events SET result='expired'",
    "DELETE FROM payment_events",
    "TRUNCATE payment_events",
  ]) {
    await assert.rejects(pool.query(sql), databaseCode("55000"));
  }
  assert.deepEqual(
    (
      await pool.query(
        "SELECT quantity,price_minor,title,label FROM order_lines",
      )
    ).rows,
    [
      {
        quantity: 1,
        price_minor: 800,
        title: "Test soap",
        label: "Test format",
      },
    ],
  );
  assert.deepEqual(
    (await pool.query("SELECT event_key,result FROM payment_events")).rows,
    [{ event_key: "evt_test_fixture", result: "paid" }],
  );
});
