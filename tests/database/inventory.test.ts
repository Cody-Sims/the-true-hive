import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { databaseOptions } from "../../src/server/db/connection.mjs";
import { migrateDatabase } from "../../scripts/migrate.mjs";
import { MigrationDriftError } from "../../scripts/migrate.mjs";
import { readFile, writeFile, mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { adjustStock } from "../../src/server/inventory/adjust.ts";
import { InventoryConflictError } from "../../src/server/inventory/rules.ts";
import {
  getAvailability,
  getCatalog,
  CatalogUnavailableError,
} from "../../src/server/catalog.ts";
import { readConfig } from "../../src/server/config.ts";
import { prepareStartup } from "../../src/server/startup.ts";

const connection = process.env["TEST_DATABASE_URL"];
assert(
  connection,
  "Set TEST_DATABASE_URL to the isolated true_hive_test database; database tests must not be silently skipped.",
);
assert.equal(
  new URL(connection).pathname,
  "/true_hive_test",
  "Use the dedicated test database, not production.",
);
const options = databaseOptions(connection, "disable");
const schema = `true_hive_test_${randomUUID().replaceAll("-", "")}`;
const admin = new Pool({ ...options, max: 1 });
let pool: Pool;

before(async () => {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  pool = new Pool({ ...options, options: `-c search_path=${schema}` });
  await migrateDatabase(pool);
});

after(async () => {
  await pool?.end();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end();
});

test("migrations create an empty real catalog and inventory schema without importing demo stock", async () => {
  const result = await pool.query<{
    products: string | null;
    levels: string | null;
    history: string | null;
  }>(
    "SELECT to_regclass('products')::text AS products, to_regclass('inventory_levels')::text AS levels, to_regclass('inventory_movements')::text AS history",
  );
  assert.equal(result.rows[0]!.products, "products");
  assert.equal(result.rows[0]!.levels, "inventory_levels");
  assert.equal(result.rows[0]!.history, "inventory_movements");
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM products")).rows[0]
      .count,
    0,
  );
});

async function stockFixture(onHand: number, committed = 0, unavailable = 0) {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const productKey = `product-${suffix}`;
  const variantKey = `variant-${suffix}`;
  const locationKey = `pickup-${suffix}`;
  await pool.query(
    "INSERT INTO products (product_key,slug,title,summary,category,image_key,kind,published) VALUES ($1,$1,'Test soap','Test-only product','soap','soap','active',true)",
    [productKey],
  );
  await pool.query(
    "INSERT INTO product_variants (variant_key,product_key,sku,label,price_minor) VALUES ($1,$2,$1,'Test format',800)",
    [variantKey, productKey],
  );
  await pool.query(
    "INSERT INTO inventory_locations (location_key,name,active,pickup_enabled) VALUES ($1,'Private test location',true,true)",
    [locationKey],
  );
  await pool.query(
    "INSERT INTO inventory_levels (variant_key,location_key,on_hand,committed,unavailable) VALUES ($1,$2,$3,$4,$5)",
    [variantKey, locationKey, onHand, committed, unavailable],
  );
  return { productKey, variantKey, locationKey };
}

function request(
  stock: { variantKey: string; locationKey: string },
  delta: number,
) {
  return {
    variantKey: stock.variantKey,
    locationKey: stock.locationKey,
    delta,
    operationId: randomUUID(),
    actorId: "operator:test",
    reason: "Test physical count",
  };
}

test("a correction commits its count and attributable history together", async () => {
  const stock = await stockFixture(3, 1, 1);
  const change = request(stock, 2);
  const result = await adjustStock(pool, change);
  assert.equal(result.onHand, 5);
  assert.equal(result.replayed, false);
  const history = await pool.query(
    "SELECT before_on_hand,after_on_hand,actor_id,reason FROM inventory_movements WHERE operation_id=$1",
    [change.operationId],
  );
  assert.deepEqual(history.rows, [
    {
      before_on_hand: 3,
      after_on_hand: 5,
      actor_id: "operator:test",
      reason: "Test physical count",
    },
  ]);
});

test("concurrent withdrawals cannot both consume the final physical unit", async () => {
  const stock = await stockFixture(1);
  const results = await Promise.allSettled([
    adjustStock(pool, request(stock, -1)),
    adjustStock(pool, request(stock, -1)),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const rejected = results.find((result) => result.status === "rejected");
  assert(
    rejected?.status === "rejected" &&
      rejected.reason instanceof InventoryConflictError,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT on_hand FROM inventory_levels WHERE variant_key=$1",
        [stock.variantKey],
      )
    ).rows[0].on_hand,
    0,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM inventory_movements WHERE variant_key=$1",
        [stock.variantKey],
      )
    ).rows[0].count,
    1,
  );
});

test("concurrent matching retries change stock once and mismatched reuse is a conflict", async () => {
  const stock = await stockFixture(1);
  const change = request(stock, 1);
  const results = await Promise.all([
    adjustStock(pool, change),
    adjustStock(pool, change),
  ]);
  assert(results.every((result) => result.onHand === 2));
  assert.equal(results.filter((result) => result.replayed).length, 1);
  await assert.rejects(
    adjustStock(pool, { ...change, delta: 2 }),
    InventoryConflictError,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT on_hand FROM inventory_levels WHERE variant_key=$1",
        [stock.variantKey],
      )
    ).rows[0].on_hand,
    2,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM inventory_movements WHERE operation_id=$1",
        [change.operationId],
      )
    ).rows[0].count,
    1,
  );
});

test("committed/held units and database constraints cannot be bypassed by a count correction", async () => {
  const stock = await stockFixture(3, 2, 1);
  await assert.rejects(
    adjustStock(pool, request(stock, -1)),
    InventoryConflictError,
  );
  await assert.rejects(
    pool.query("UPDATE inventory_levels SET on_hand=0 WHERE variant_key=$1", [
      stock.variantKey,
    ]),
    (error: unknown) =>
      Boolean(
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "23514",
      ),
  );
  assert.equal(
    (
      await pool.query(
        "SELECT on_hand FROM inventory_levels WHERE variant_key=$1",
        [stock.variantKey],
      )
    ).rows[0].on_hand,
    3,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM inventory_movements WHERE variant_key=$1",
        [stock.variantKey],
      )
    ).rows[0].count,
    0,
  );
});

test("a failed history insert rolls back the count and recorded movements cannot be edited or deleted", async () => {
  const stock = await stockFixture(2);
  await pool.query(`CREATE FUNCTION reject_test_history() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.reason = 'forced-ledger-failure' THEN RAISE EXCEPTION 'test failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_test_history BEFORE INSERT ON inventory_movements FOR EACH ROW EXECUTE FUNCTION reject_test_history();`);
  try {
    await assert.rejects(
      adjustStock(pool, {
        ...request(stock, 1),
        reason: "forced-ledger-failure",
      }),
      (error: unknown) =>
        Boolean(
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "P0001",
        ),
    );
    assert.equal(
      (
        await pool.query(
          "SELECT on_hand FROM inventory_levels WHERE variant_key=$1",
          [stock.variantKey],
        )
      ).rows[0].on_hand,
      2,
    );
  } finally {
    await pool.query(
      "DROP TRIGGER reject_test_history ON inventory_movements; DROP FUNCTION reject_test_history()",
    );
  }
  const change = request(stock, 1);
  await adjustStock(pool, change);
  for (const sql of [
    "UPDATE inventory_movements SET reason='rewrite' WHERE operation_id=$1",
    "DELETE FROM inventory_movements WHERE operation_id=$1",
  ]) {
    await assert.rejects(
      pool.query(sql, [change.operationId]),
      (error: unknown) =>
        Boolean(
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "55000",
        ),
    );
  }
  await assert.rejects(
    pool.query("TRUNCATE inventory_movements"),
    (error: unknown) =>
      Boolean(
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "55000",
      ),
  );
});

test("published catalog and location-scoped availability omit private stock/SKU/audit data", async () => {
  const stock = await stockFixture(0);
  const config = readConfig({ CATALOG_SOURCE: "database" });
  await pool.query(
    "INSERT INTO products (product_key,slug,title,summary,category,image_key,kind,published) VALUES ('private-draft','private-draft','Do not expose','Private draft','soap','soap','draft',true)",
  );
  const catalog = await getCatalog(config, pool);
  assert(catalog.products.some((product) => product.key === stock.productKey));
  assert(!catalog.products.some((product) => product.key === "private-draft"));
  const serialized = JSON.stringify(catalog);
  assert(!serialized.includes("on_hand"));
  assert(!serialized.includes("actor_id"));
  assert(!serialized.includes('"sku"'));
  await pool.query(
    "INSERT INTO inventory_locations (location_key,name,active,pickup_enabled) VALUES ($1,'Market-only location',true,false)",
    [`market-${stock.locationKey}`],
  );
  await pool.query(
    "INSERT INTO inventory_levels (variant_key,location_key,on_hand) VALUES ($1,$2,10)",
    [stock.variantKey, `market-${stock.locationKey}`],
  );
  assert.equal(
    (await getAvailability(config, stock.variantKey, stock.locationKey, pool))
      ?.state,
    "out_of_stock",
  );
  assert.equal(
    (
      await getAvailability(
        config,
        stock.variantKey,
        `market-${stock.locationKey}`,
        pool,
      )
    )?.state,
    "not_offered",
  );
});

test("repeat migrations verify checksums and reject rewritten history without changing data", async () => {
  assert.deepEqual(await migrateDatabase(pool), []);
  const directory = await mkdtemp(join(tmpdir(), "true-hive-migration-check-"));
  try {
    const original = await readFile(
      new URL("../../migrations/001_inventory.sql", import.meta.url),
      "utf8",
    );
    await writeFile(
      join(directory, "001_inventory.sql"),
      `${original}\nSELECT 2;\n`,
    );
    await assert.rejects(
      migrateDatabase(pool, pathToFileURL(`${directory}/`)),
      MigrationDriftError,
    );
    assert.deepEqual(await migrateDatabase(pool), []);
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("missing database schema is unavailable, never a fallback to sample products", async () => {
  const empty = new Pool({
    ...options,
    options: "-c search_path=nonexistent_true_hive_schema",
  });

  try {
    await assert.rejects(
      getCatalog(readConfig({ CATALOG_SOURCE: "database" }), empty),
      (error: unknown) =>
        error instanceof CatalogUnavailableError &&
        error.code === "SCHEMA_NOT_READY",
    );
  } finally {
    await empty.end();
  }
});

test("the migration CLI treats a blank optional override as unset and uses DATABASE_URL", () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("../../scripts/migrate.mjs", import.meta.url))],
    {
      encoding: "utf8",
      env: {
        DATABASE_URL: connection,
        MIGRATION_DATABASE_URL: "   ",
        DATABASE_TLS: "disable",
        PGOPTIONS: `-c search_path=${schema}`,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Applied 0 migrations/);
});

test("startup validates a real migrated schema and rejects a missing schema before serving", async () => {
  const config = readConfig({ CATALOG_SOURCE: "database" });
  await assert.doesNotReject(prepareStartup(config, pool));
  const empty = new Pool({
    ...options,
    options: "-c search_path=nonexistent_startup_schema",
  });
  try {
    await assert.rejects(
      prepareStartup(config, empty),
      (error: unknown) =>
        error instanceof CatalogUnavailableError &&
        error.code === "SCHEMA_NOT_READY",
    );
  } finally {
    await empty.end();
  }
});

test("startup rejects partial catalog and availability schemas even when inventory levels exist", async () => {
  for (const damage of [
    "DROP TABLE product_variants CASCADE",
    "ALTER TABLE inventory_locations DROP COLUMN pickup_enabled",
  ]) {
    const partialSchema = `startup_partial_${randomUUID().replaceAll("-", "")}`;
    await admin.query(`CREATE SCHEMA "${partialSchema}"`);
    const partial = new Pool({
      ...options,
      options: `-c search_path=${partialSchema}`,
    });
    try {
      await migrateDatabase(partial);
      await partial.query(damage);
      assert.equal(
        (
          await partial.query(
            "SELECT to_regclass('inventory_levels')::text AS levels",
          )
        ).rows[0].levels,
        "inventory_levels",
      );
      await assert.rejects(
        prepareStartup(readConfig({ CATALOG_SOURCE: "database" }), partial),
        (error: unknown) =>
          error instanceof CatalogUnavailableError &&
          error.code === "SCHEMA_NOT_READY",
      );
    } finally {
      await partial.end();
      await admin.query(`DROP SCHEMA "${partialSchema}" CASCADE`);
    }
  }
});

test("migrations reject backfilled history without changing data and still accept forward files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "true-hive-migration-order-"));
  const orderedSchema = `migration_order_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE SCHEMA "${orderedSchema}"`);
  const ordered = new Pool({
    ...options,
    options: `-c search_path=${orderedSchema}`,
  });
  const migrations = pathToFileURL(`${directory}/`);
  try {
    await writeFile(
      join(directory, "001_initial.sql"),
      "CREATE TABLE migration_order_fixture (value text NOT NULL);",
    );
    await writeFile(
      join(directory, "003_later.sql"),
      "INSERT INTO migration_order_fixture VALUES ('late');",
    );
    assert.deepEqual(await migrateDatabase(ordered, migrations), [
      "001_initial.sql",
      "003_later.sql",
    ]);
    await writeFile(
      join(directory, "002_earlier.sql"),
      "UPDATE migration_order_fixture SET value='backfilled-' || value;",
    );
    await assert.rejects(
      migrateDatabase(ordered, migrations),
      MigrationDriftError,
    );
    assert.deepEqual(
      (await ordered.query("SELECT value FROM migration_order_fixture")).rows,
      [{ value: "late" }],
    );
    assert.deepEqual(
      (await ordered.query("SELECT name FROM schema_migrations ORDER BY name"))
        .rows,
      [{ name: "001_initial.sql" }, { name: "003_later.sql" }],
    );
    await unlink(join(directory, "002_earlier.sql"));
    await writeFile(
      join(directory, "004_forward.sql"),
      "INSERT INTO migration_order_fixture VALUES ('forward');",
    );
    assert.deepEqual(await migrateDatabase(ordered, migrations), [
      "004_forward.sql",
    ]);
    assert.deepEqual(
      (
        await ordered.query(
          "SELECT value FROM migration_order_fixture ORDER BY value",
        )
      ).rows,
      [{ value: "forward" }, { value: "late" }],
    );
  } finally {
    await ordered.end();
    await admin.query(`DROP SCHEMA "${orderedSchema}" CASCADE`);
    await rm(directory, { recursive: true });
  }
});
