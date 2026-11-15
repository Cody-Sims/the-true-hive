import assert from "node:assert/strict";
import test, { after, afterEach, beforeEach } from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import {
  commitPhotoOperation,
  makePhotoIntent,
  readPublishedProductPhoto,
} from "../../src/server/media/persistence.ts";
import { PhotoError } from "../../src/server/media/errors.ts";
import {
  getAdminProduct,
  updateAdminProduct,
} from "../../src/server/admin/catalog.ts";
import { getCatalog } from "../../src/server/catalog.ts";
import { readConfig } from "../../src/server/config.ts";

const connection = process.env["TEST_DATABASE_URL"];
assert(
  connection,
  "TEST_DATABASE_URL must identify an isolated native database.",
);
const url = new URL(connection);
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/true_hive_test");
const admin = new Pool({ connectionString: connection, max: 1 });
let schema: string;
let pool: Pool;
const actor = "operator:photos";
const product = {
  key: "soap",
  slug: "soap",
  title: "Test soap",
  summary: "Test-only soap",
  details: [],
  category: "soap",
  imageKey: "soap",
  kind: "active",
};
const config = readConfig({
  CATALOG_SOURCE: "database",
  DATABASE_TLS: "disable",
});
const databaseCode = (code: string) => (error: unknown) =>
  Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === code,
  );
const conflict = (error: unknown) =>
  error instanceof PhotoError && error.status === 409;

async function migratePhoto() {
  await pool.query(
    await readFile(
      new URL("../../migrations/003_product_photos.sql", import.meta.url),
      "utf8",
    ),
  );
  await pool.query(
    await readFile(
      new URL("../../migrations/004_product_ingredients.sql", import.meta.url),
      "utf8",
    ),
  );
}
function upload(expectedRevision = 1, operationId = randomUUID()) {
  const input = {
    operationId,
    expectedRevision,
    alt: "Test soap",
    file: Buffer.from("stable original input"),
  };
  return {
    intent: makePhotoIntent("soap", actor, input),
    photo: {
      id: operationId,
      alt: input.alt,
      width: 100,
      height: 80,
      bytes: 1000,
    },
  };
}
async function stock() {
  return (
    await pool.query(
      "SELECT * FROM inventory_levels ORDER BY variant_key,location_key",
    )
  ).rows;
}

beforeEach(async () => {
  schema = `product_photos_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  pool = new Pool({
    connectionString: connection,
    options: `-c search_path=${schema}`,
    max: 4,
  });
  for (const file of ["001_inventory.sql", "002_admin_commerce.sql"])
    await pool.query(
      await readFile(
        new URL(`../../migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  await pool.query(`
    INSERT INTO products (product_key,slug,title,summary,category,image_key,kind,published)
      VALUES ('soap','soap','Test soap','Test-only soap','soap','soap','active',true);
    INSERT INTO product_variants (variant_key,product_key,sku,label,price_minor)
      VALUES ('bar','soap','PRIVATE-SKU','Bar',800);
    INSERT INTO inventory_locations (location_key,name) VALUES ('room','Private stock room');
    INSERT INTO inventory_levels (variant_key,location_key,on_hand,held,committed,unavailable)
      VALUES ('bar','room',7,1,2,1);
  `);
});
afterEach(async () => {
  await pool?.end();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
});
after(async () => {
  await admin.end();
});

test("003 preserves existing products and grants, strictly bounds photo JSON and does not change stock", async () => {
  const role = `photo_reader_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE ROLE "${role}" NOLOGIN NOINHERIT`);
  await admin.query(`GRANT "${role}" TO CURRENT_USER WITH SET TRUE`);
  await pool.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);
  await pool.query(`GRANT SELECT ON products TO "${role}"`);
  const before = await stock();
  try {
    await migratePhoto();
    assert.deepEqual(
      (await pool.query("SELECT revision,photo,ingredients FROM products"))
        .rows,
      [{ revision: 1, photo: null, ingredients: [] }],
    );
    const sample = upload().photo;
    for (const value of [
      {},
      [],
      { ...sample, id: "../../private" },
      { ...sample, alt: " " },
      { ...sample, alt: "x".repeat(301) },
      { ...sample, alt: "\t" },
      { ...sample, width: 2049 },
      { ...sample, width: 0 },
      { ...sample, width: 1.5 },
      { ...sample, width: "100" },
      { ...sample, height: null },
      { ...sample, bytes: 4194305 },
      { ...sample, bytes: 0 },
      { ...sample, bucket: "private" },
      { ...sample, objectPath: "private" },
    ])
      await assert.rejects(
        pool.query("UPDATE products SET photo=$1::jsonb", [
          JSON.stringify(value),
        ]),
        databaseCode("23514"),
      );
    await pool.query("UPDATE products SET photo=$1::jsonb", [
      JSON.stringify(sample),
    ]);
    const reader = await pool.connect();
    try {
      await reader.query(`SET ROLE "${role}"`);
      assert.deepEqual(
        (await reader.query("SELECT photo FROM products")).rows,
        [{ photo: sample }],
      );
    } finally {
      await reader.query("RESET ROLE");
      reader.release();
    }
    assert.deepEqual(await stock(), before);
  } finally {
    await pool.query(`REVOKE ALL ON products FROM "${role}"`);
    await pool.query(`REVOKE ALL ON SCHEMA "${schema}" FROM "${role}"`);
    await admin.query(`DROP ROLE "${role}"`);
  }
});

test("store settings upgrade preserves existing photo history and later photo changes", async () => {
  await migratePhoto();
  const first = upload();
  await commitPhotoOperation(pool, first.intent, first.photo);
  const before = await stock();
  const auditBefore = (
    await pool.query("SELECT * FROM admin_operations WHERE operation_id=$1", [
      first.intent.operationId,
    ])
  ).rows[0];
  await pool.query(
    await readFile(
      new URL("../../migrations/005_storefront_settings.sql", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(
    (
      await pool.query("SELECT * FROM admin_operations WHERE operation_id=$1", [
        first.intent.operationId,
      ])
    ).rows[0],
    auditBefore,
  );
  const replacement = upload(2);
  await commitPhotoOperation(pool, replacement.intent, replacement.photo);
  const removal = makePhotoIntent("soap", actor, {
    operationId: randomUUID(),
    expectedRevision: 3,
  });
  await commitPhotoOperation(pool, removal, null);
  assert.deepEqual(await stock(), before);
  assert.equal((await getAdminProduct(pool, "soap"))?.revision, 4);
});

test("attach, exact retry, replace and remove are compact immutable audited revision transitions without stock writes", async () => {
  await migratePhoto();
  const before = await stock();
  const first = upload();
  const result = await commitPhotoOperation(pool, first.intent, first.photo);
  assert.deepEqual(result, {
    productKey: "soap",
    revision: 2,
    photo: first.photo,
  });
  assert.deepEqual(
    await commitPhotoOperation(pool, first.intent, first.photo),
    result,
  );
  assert.deepEqual((await getAdminProduct(pool, "soap"))?.photo, first.photo);
  const publicProduct = (await getCatalog(config, pool)).products[0]!;
  assert.deepEqual(publicProduct.photo, first.photo);
  assert.equal(JSON.stringify(publicProduct).includes("PRIVATE-SKU"), false);
  const second = upload(2);
  await commitPhotoOperation(pool, second.intent, second.photo);
  assert.equal(await readPublishedProductPhoto(pool, first.photo.id), null);
  assert.deepEqual(
    await commitPhotoOperation(pool, first.intent, first.photo),
    result,
  );
  const removal = makePhotoIntent("soap", actor, {
    operationId: randomUUID(),
    expectedRevision: 3,
  });
  assert.deepEqual(await commitPhotoOperation(pool, removal, null), {
    productKey: "soap",
    revision: 4,
    photo: null,
  });
  assert.equal(await readPublishedProductPhoto(pool, second.photo.id), null);
  assert.equal("photo" in (await getAdminProduct(pool, "soap"))!, false);
  assert.deepEqual(await stock(), before);
  const audit = (
    await pool.query(
      "SELECT before_data,after_data,result FROM admin_operations WHERE operation_id=$1",
      [first.intent.operationId],
    )
  ).rows[0];
  assert.deepEqual(audit.before_data, { revision: 1, photo: null });
  assert.deepEqual(audit.after_data, { revision: 2, photo: first.photo });
  assert.deepEqual(audit.result, result);
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM admin_operations"))
      .rows[0].count,
    3,
  );
  await assert.rejects(
    pool.query("DELETE FROM admin_operations"),
    databaseCode("55000"),
  );
});

test("the shared operation lock serializes retries and revision checks reject competing intents", async () => {
  await migratePhoto();
  const first = upload();
  const results = await Promise.all([
    commitPhotoOperation(pool, first.intent, first.photo),
    commitPhotoOperation(pool, first.intent, first.photo),
  ]);
  assert.deepEqual(results[0], results[1]);
  await assert.rejects(
    commitPhotoOperation(
      pool,
      { ...first.intent, actorId: "operator:other" },
      first.photo,
    ),
    conflict,
  );
  await assert.rejects(
    commitPhotoOperation(
      pool,
      { ...first.intent, hash: "b".repeat(64) },
      first.photo,
    ),
    conflict,
  );
  const a = upload(2);
  const b = upload(2);
  const race = await Promise.allSettled([
    commitPhotoOperation(pool, a.intent, a.photo),
    commitPhotoOperation(pool, b.intent, b.photo),
  ]);
  assert.equal(race.filter((entry) => entry.status === "fulfilled").length, 1);
  const rejected = race.find((entry) => entry.status === "rejected");
  assert(rejected?.status === "rejected" && conflict(rejected.reason));
  assert.equal(
    (await pool.query("SELECT revision FROM products")).rows[0].revision,
    3,
  );
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM admin_operations"))
      .rows[0].count,
    2,
  );
});

test("failed immutable audit insertion rolls back the photo reference and revision", async () => {
  await migratePhoto();
  await pool.query(`
    CREATE FUNCTION fail_photo_audit_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'fixture-only audit failure'; END; $$;
    CREATE TRIGGER fail_photo_audit_fixture BEFORE INSERT ON admin_operations
      FOR EACH ROW EXECUTE FUNCTION fail_photo_audit_fixture();
  `);
  const next = upload();
  await assert.rejects(
    commitPhotoOperation(pool, next.intent, next.photo),
    (error: unknown) =>
      error instanceof PhotoError &&
      error.status === 503 &&
      !error.message.includes("fixture"),
  );
  assert.deepEqual(
    (await pool.query("SELECT revision,photo FROM products")).rows,
    [{ revision: 1, photo: null }],
  );
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM admin_operations"))
      .rows[0].count,
    0,
  );
});

test("publication is current-reference-only and normal product edits cannot set or erase photos", async () => {
  await migratePhoto();
  const next = upload();
  await commitPhotoOperation(pool, next.intent, next.photo);
  assert.deepEqual(
    await readPublishedProductPhoto(pool, next.photo.id),
    next.photo,
  );
  for (const sql of [
    "UPDATE products SET kind='concept'",
    "UPDATE products SET kind='draft'",
    "UPDATE products SET kind='active',published=false",
    "UPDATE products SET archived=true",
  ]) {
    await pool.query(sql);
    assert.equal(await readPublishedProductPhoto(pool, next.photo.id), null);
  }
  await pool.query("UPDATE products SET archived=false,published=true");
  const variant = {
    key: "bar",
    sku: "PRIVATE-SKU",
    label: "Bar",
    priceMinor: 800,
    currency: "USD",
    active: true,
  };
  await assert.rejects(
    updateAdminProduct(
      pool,
      "soap",
      {
        operationId: randomUUID(),
        expectedRevision: 2,
        action: "save",
        product: { ...product, photo: next.photo },
        variants: [variant],
      },
      actor,
    ),
  );
  const saved = await updateAdminProduct(
    pool,
    "soap",
    {
      operationId: randomUUID(),
      expectedRevision: 2,
      action: "save",
      product,
      variants: [variant],
    },
    actor,
  );
  assert.deepEqual(saved.product.photo, next.photo);
  assert.equal(saved.product.revision, 3);
  assert.deepEqual(
    await readPublishedProductPhoto(pool, next.photo.id),
    next.photo,
  );
});
