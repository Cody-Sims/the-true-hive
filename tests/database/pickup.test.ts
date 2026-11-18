import assert from "node:assert/strict";
import test, { after, afterEach, beforeEach } from "node:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { databaseOptions } from "../../src/server/db/connection.mjs";
import { migrateDatabase } from "../../scripts/migrate.mjs";
import { pickupSite } from "../fixtures/pickup.ts";
import {
  createPickupSite,
  getPickupSite,
  getPickupSettings,
  updatePickupSettings,
  getPickupAvailability,
  bookPickup,
  getCustomerPickupContext,
  getAdminPickupDashboard,
  requestPickupHelp,
  revokePickupAccess,
  updatePickupSite,
} from "../../src/server/pickup/service.ts";
import {
  PickupError,
  PickupImpactError,
} from "../../src/server/pickup/rules.ts";
import {
  reserveCheckout,
  attachCheckoutSession,
  applyCheckoutPayment,
  recordOrderPickup,
} from "../../src/server/commerce/orders.ts";
import type { PickupAvailability } from "../../src/domain/pickup.ts";
import { OrderConflictError } from "../../src/server/commerce/rules.ts";
import { readBuyerOrders } from "../../src/server/pickup/buyer.ts";

const connection = process.env["TEST_DATABASE_URL"];
assert(connection, "Use the isolated true_hive_test database.");
assert.equal(new URL(connection).hostname, "127.0.0.1");
assert.equal(new URL(connection).pathname, "/true_hive_test");
const options = databaseOptions(connection, "disable");
const admin = new Pool({ ...options, max: 1 });
let pool: Pool;
let schema: string;

beforeEach(async () => {
  schema = `pickup_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  pool = new Pool({ ...options, options: `-c search_path=${schema}` });
  await migrateDatabase(pool);
});

async function stockFixture() {
  await pool.query(`
    INSERT INTO products(product_key,slug,title,summary,category,image_key,kind,published)
      VALUES ('test-soap','test-soap','Test soap','Fixture only','soap','soap','active',true);
    INSERT INTO product_variants(variant_key,product_key,sku,label,price_minor,active)
      VALUES ('test-bar','test-soap','TEST-BAR','Test format',500,true);
    INSERT INTO inventory_locations(location_key,name,active,pickup_enabled)
      VALUES ('test-stock','Test fulfillment stock',true,true);
    INSERT INTO inventory_levels(variant_key,location_key,on_hand)
      VALUES ('test-bar','test-stock',10);
  `);
}

test("native pickup site creation is audited, retry-safe and does not copy private instructions into receipts or change stock", async () => {
  await stockFixture();
  const { revision: _revision, ...site } = pickupSite({
    privateInstructions: "TEST_PRIVATE_ARRIVAL_VALUE",
  });
  const input = { operationId: randomUUID(), site };
  const before = (await pool.query("SELECT * FROM inventory_levels")).rows;
  const receipt = await createPickupSite(pool, input, "operator:pickup-test");
  assert.equal(receipt.resourceKey, site.key);
  assert.equal(receipt.revision, 1);
  assert.equal(receipt.replayed, false);
  assert.deepEqual(await getPickupSite(pool, site.key), {
    ...site,
    revision: 1,
  });
  assert.deepEqual(
    await createPickupSite(pool, input, "operator:pickup-test"),
    { ...receipt, replayed: true },
  );
  const audit = (
    await pool.query(
      "SELECT before_data,after_data,result FROM admin_operations WHERE operation_id=$1",
      [input.operationId],
    )
  ).rows;
  assert.equal(audit.length, 1);
  assert.equal(JSON.stringify(audit).includes(site.privateInstructions), false);
  assert.deepEqual(
    (await pool.query("SELECT * FROM inventory_levels")).rows,
    before,
  );
});
afterEach(async () => {
  await pool?.end();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
});
after(async () => {
  await admin.end();
});

test("native pickup starts disabled without seeded locations, hours or appointments", async () => {
  assert.ok(
    (await pool.query("SELECT to_regclass('pickup_settings') AS name")).rows[0]
      .name,
    "native scheduling persistence must exist",
  );
  assert.deepEqual(
    (await pool.query("SELECT enabled,revision FROM pickup_settings")).rows,
    [{ enabled: false, revision: 1 }],
  );
  assert.equal(
    Number(
      (await pool.query("SELECT count(*) FROM pickup_sites")).rows[0].count,
    ),
    0,
  );
  assert.equal(
    Number(
      (await pool.query("SELECT count(*) FROM pickup_bookings")).rows[0].count,
    ),
    0,
  );
});

test("native scheduling enablement needs configured sites and settings updates preserve replay and revision authority", async () => {
  assert.deepEqual(await getPickupSettings(pool), {
    enabled: false,
    revision: 1,
  });

  const enable = {
    operationId: randomUUID(),
    expectedRevision: 1,
    enabled: true,
  };
  await assert.rejects(
    updatePickupSettings(pool, enable, "operator:pickup-test"),
    (error) =>
      error instanceof PickupError && error.code === "PICKUP_NOT_CONFIGURED",
  );
  await stockFixture();
  const { revision: _revision, ...site } = pickupSite();
  await createPickupSite(
    pool,
    { operationId: randomUUID(), site },
    "operator:pickup-test",
  );
  const receipt = await updatePickupSettings(
    pool,
    enable,
    "operator:pickup-test",
  );
  assert.equal(receipt.revision, 2);
  assert.deepEqual(await getPickupSettings(pool), {
    enabled: true,
    revision: 2,
  });
  await updatePickupSettings(
    pool,
    { operationId: randomUUID(), expectedRevision: 2, enabled: false },
    "operator:pickup-test",
  );
  assert.deepEqual(
    await updatePickupSettings(pool, enable, "operator:pickup-test"),
    { ...receipt, replayed: true },
  );
  assert.deepEqual(await getPickupSettings(pool), {
    enabled: false,
    revision: 3,
  });
  await assert.rejects(
    updatePickupSettings(
      pool,
      { ...enable, operationId: randomUUID() },
      "operator:pickup-test",
    ),
    (error) => error instanceof PickupError && error.status === 409,
  );
  await assert.rejects(
    updatePickupSettings(
      pool,
      { ...enable, enabled: false },
      "operator:pickup-test",
    ),
    (error) =>
      error instanceof PickupError && error.code === "OPERATION_CONFLICT",
  );
  assert.equal(
    (await pool.query("SELECT purchases_enabled FROM storefront_settings"))
      .rows[0].purchases_enabled,
    false,
  );
});

test("checkout buyer access is paired, time-bounded and cannot be rebound onto an existing order", async () => {
  await stockFixture();
  const databaseCode = (code: string) => (error: unknown) =>
    Boolean(
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === code,
    );
  const legacy = randomUUID();
  await pool.query(
    "INSERT INTO orders(order_key,request_hash,location_key,total_minor) VALUES($1,$2,'test-stock',500)",
    [legacy, "a".repeat(64)],
  );
  await assert.rejects(
    pool.query(
      "UPDATE orders SET buyer_hash=$2,buyer_access_expires_at=CURRENT_TIMESTAMP+interval '720 hours' WHERE order_key=$1",
      [legacy, "b".repeat(64)],
    ),
    databaseCode("55000"),
  );
  const protectedOrder = randomUUID();
  await pool.query(
    "INSERT INTO orders(order_key,request_hash,location_key,total_minor,buyer_hash,buyer_access_expires_at) VALUES($1,$2,'test-stock',500,$3,CURRENT_TIMESTAMP+interval '720 hours')",
    [protectedOrder, "a".repeat(64), "b".repeat(64)],
  );
  await assert.rejects(
    pool.query("UPDATE orders SET buyer_hash=$2 WHERE order_key=$1", [
      protectedOrder,
      "c".repeat(64),
    ]),
    databaseCode("55000"),
  );
  await assert.rejects(
    pool.query(
      "UPDATE orders SET buyer_access_expires_at=buyer_access_expires_at+interval '1 hour' WHERE order_key=$1",
      [protectedOrder],
    ),
    databaseCode("55000"),
  );
  await assert.rejects(
    pool.query(
      "INSERT INTO orders(order_key,request_hash,location_key,total_minor,buyer_hash) VALUES($1,$2,'test-stock',500,$3)",
      [randomUUID(), "a".repeat(64), "b".repeat(64)],
    ),
    databaseCode("23514"),
  );
  await assert.rejects(
    pool.query(
      "INSERT INTO orders(order_key,request_hash,location_key,total_minor,buyer_hash,buyer_access_expires_at) VALUES($1,$2,'test-stock',500,$3,CURRENT_TIMESTAMP+interval '721 hours')",
      [randomUUID(), "a".repeat(64), "b".repeat(64)],
    ),
    databaseCode("23514"),
  );
});

test("checkout binds buyer access only on first reservation and never rebinds a replay or legacy order", async () => {
  await stockFixture();
  await pool.query("UPDATE storefront_settings SET purchases_enabled=true");
  const intent = {
    operationId: randomUUID(),
    lines: [{ variantKey: "test-bar", quantity: 1 }],
  };
  await reserveCheckout(pool, intent, "test-stock", "b".repeat(64));
  const bound = (
    await pool.query(
      "SELECT buyer_hash,EXTRACT(EPOCH FROM (buyer_access_expires_at-created_at))::bigint AS seconds FROM orders WHERE order_key=$1",
      [intent.operationId],
    )
  ).rows[0];
  assert.equal(bound.buyer_hash, "b".repeat(64));
  assert.equal(Number(bound.seconds), 30 * 24 * 60 * 60);
  await reserveCheckout(pool, intent, "test-stock", "b".repeat(64));
  await assert.rejects(
    reserveCheckout(pool, intent, "test-stock", "c".repeat(64)),
    OrderConflictError,
  );
  await assert.rejects(
    reserveCheckout(pool, intent, "test-stock"),
    OrderConflictError,
  );
  const legacy = { ...intent, operationId: randomUUID() };
  await reserveCheckout(pool, legacy, "test-stock");
  await reserveCheckout(pool, legacy, "test-stock", "b".repeat(64));
  assert.equal(
    (
      await pool.query("SELECT buyer_hash FROM orders WHERE order_key=$1", [
        legacy.operationId,
      ])
    ).rows[0].buyer_hash,
    null,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT held FROM inventory_levels WHERE variant_key='test-bar'",
      )
    ).rows[0].held,
    2,
  );
});

test("buyer order access is scoped, expires, rejects legacy claiming and honors immutable operator revocation", async () => {
  await stockFixture();
  await pool.query("UPDATE storefront_settings SET purchases_enabled=true");
  const intent = () => ({
    operationId: randomUUID(),
    lines: [{ variantKey: "test-bar", quantity: 1 }],
  });
  const own = intent();
  const other = intent();
  const legacy = intent();
  await reserveCheckout(pool, own, "test-stock", "a".repeat(64));
  await reserveCheckout(pool, other, "test-stock", "b".repeat(64));
  await reserveCheckout(pool, legacy, "test-stock");
  const visible = await readBuyerOrders(pool, "a".repeat(64));
  assert.deepEqual(
    visible.map((order) => order.id),
    [own.operationId],
  );
  assert.equal(
    visible[0]!.state,
    "creating",
    "browser ownership does not imply payment",
  );
  assert.deepEqual(
    await readBuyerOrders(pool, "a".repeat(64), Date.now(), other.operationId),
    [],
  );
  assert.deepEqual(
    await readBuyerOrders(pool, "a".repeat(64), Date.now(), legacy.operationId),
    [],
  );
  assert.deepEqual(
    await readBuyerOrders(pool, "a".repeat(64), Date.now() + 31 * 86400_000),
    [],
  );
  assert.equal(JSON.stringify(visible).includes("a".repeat(64)), false);
  await pool.query(
    "INSERT INTO admin_operations(operation_id,actor_key,action,resource_key,request_hash,result) VALUES($1,'operator:revoke-fixture','revoke_pickup_access',$2,$3,'{}'::jsonb)",
    [randomUUID(), own.operationId, "c".repeat(64)],
  );
  assert.deepEqual(await readBuyerOrders(pool, "a".repeat(64)), []);
});

async function paidOrder(buyerHash?: string) {
  await pool.query("UPDATE storefront_settings SET purchases_enabled=true");
  const intent = {
    operationId: randomUUID(),
    lines: [{ variantKey: "test-bar", quantity: 1 }],
  };
  const reserved = await reserveCheckout(pool, intent, "test-stock", buyerHash);
  const sessionId = `cs_test_${intent.operationId.replaceAll("-", "")}`;
  await attachCheckoutSession(
    pool,
    intent.operationId,
    sessionId,
    reserved.checkoutExpiresAt,
  );
  await applyCheckoutPayment(pool, {
    eventId: `evt_${randomUUID().replaceAll("-", "")}`,
    orderId: intent.operationId,
    sessionId,
    paymentIntentId: `pi_${randomUUID().replaceAll("-", "")}`,
    totalMinor: reserved.totalMinor,
    currency: "USD",
  });
  return intent.operationId;
}

async function configuredPoint(
  overrides: Partial<ReturnType<typeof pickupSite>> = {},
) {
  const point = pickupSite({
    noticeHours: 0,
    privateInstructions: "TEST_PRIVATE_ARRIVAL_VALUE",
    weekly: {
      0: [{ start: "18:00", end: "20:00" }],
      1: [{ start: "18:00", end: "20:00" }],
      2: [{ start: "18:00", end: "20:00" }],
      3: [{ start: "18:00", end: "20:00" }],
      4: [{ start: "18:00", end: "20:00" }],
      5: [{ start: "18:00", end: "20:00" }],
      6: [{ start: "18:00", end: "20:00" }],
    },
  });
  Object.assign(point, overrides);
  const { revision: _revision, ...site } = point;
  await createPickupSite(
    pool,
    { operationId: randomUUID(), site },
    "operator:pickup-test",
  );
  await updatePickupSettings(
    pool,
    { operationId: randomUUID(), expectedRevision: 1, enabled: true },
    "operator:pickup-test",
  );
  return point;
}

function bookingInput(
  availability: PickupAvailability,
  orderId: string,
  index = 0,
) {
  const slot = availability.slots[index]!;
  return {
    operationId: randomUUID(),
    orderId,
    siteKey: slot.siteKey,
    date: slot.date,
    slotId: slot.id,
    expectedOrderRevision: availability.orderRevision,
    expectedSiteRevision: slot.siteRevision,
    expectedSettingsRevision: availability.settingsRevision,
    expectedBookingRevision: availability.bookingRevision,
  };
}

test("native booking uses verified paid ownership and authoritative slots without changing order or stock state", async () => {
  await stockFixture();
  const orderId = await paidOrder("a".repeat(64));
  const point = await configuredPoint();
  const now = Date.now();
  const date = new Date(now + 86400_000).toLocaleDateString("en-CA", {
    timeZone: point.timezone,
  });
  const actor = { kind: "buyer" as const, hash: "a".repeat(64) };
  const availability = await getPickupAvailability(
    pool,
    { orderId, siteKey: point.key, from: date, days: 1 },
    actor,
    now,
  );
  assert.equal(availability.slots.length, 4);
  assert.equal(
    JSON.stringify(availability).includes(point.privateInstructions),
    false,
  );
  assert.equal(JSON.stringify(availability).includes("test-stock"), false);
  const stock = (await pool.query("SELECT * FROM inventory_levels")).rows;
  const order = (
    await pool.query(
      "SELECT state,location_key,total_minor,revision FROM orders WHERE order_key=$1",
      [orderId],
    )
  ).rows;
  const input = bookingInput(availability, orderId);
  const receipt = await bookPickup(pool, input, actor, now);
  assert.equal(receipt.booking!.siteKey, point.key);
  assert.equal(receipt.booking!.startsAt, availability.slots[0]!.startsAt);
  assert.equal(receipt.booking!.revision, 1);
  assert.equal(
    JSON.stringify(receipt).includes(point.privateInstructions),
    false,
  );
  assert.deepEqual(await bookPickup(pool, input, actor, now), {
    ...receipt,
    replayed: true,
  });
  assert.deepEqual(
    (await pool.query("SELECT * FROM inventory_levels")).rows,
    stock,
  );
  assert.deepEqual(
    (
      await pool.query(
        "SELECT state,location_key,total_minor,revision FROM orders WHERE order_key=$1",
        [orderId],
      )
    ).rows,
    order,
  );
  await assert.rejects(
    getPickupAvailability(
      pool,
      { orderId, siteKey: point.key, from: date, days: 1 },
      { kind: "buyer", hash: "b".repeat(64) },
      now,
    ),
    (error) => error instanceof PickupError && error.status === 404,
  );
});

test("native last-slot contention admits one paid order and concurrent exact retries never double-book", async () => {
  await stockFixture();
  const first = await paidOrder("a".repeat(64));
  const second = await paidOrder("b".repeat(64));
  const point = await configuredPoint();
  const now = Date.now();
  const date = new Date(now + 86400_000).toLocaleDateString("en-CA", {
    timeZone: point.timezone,
  });
  const firstActor = { kind: "buyer" as const, hash: "a".repeat(64) };
  const secondActor = { kind: "buyer" as const, hash: "b".repeat(64) };
  const a = await getPickupAvailability(
    pool,
    { orderId: first, siteKey: point.key, from: date, days: 1 },
    firstActor,
    now,
  );
  const b = await getPickupAvailability(
    pool,
    { orderId: second, siteKey: point.key, from: date, days: 1 },
    secondActor,
    now,
  );
  const stock = (await pool.query("SELECT * FROM inventory_levels")).rows;
  const outcomes = await Promise.allSettled([
    bookPickup(pool, bookingInput(a, first), firstActor, now),
    bookPickup(pool, bookingInput(b, second), secondActor, now),
  ]);
  assert.equal(
    outcomes.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const rejected = outcomes.find(
    (result) => result.status === "rejected",
  ) as PromiseRejectedResult;
  assert.equal(rejected.reason.code, "PICKUP_SLOT_FULL");
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM pickup_bookings"))
      .rows[0].count,
    1,
  );
  const winner = outcomes[0]!.status === "fulfilled" ? second : first;
  const winnerActor = winner === first ? firstActor : secondActor;
  const available = await getPickupAvailability(
    pool,
    { orderId: winner, siteKey: point.key, from: date, days: 1 },
    winnerActor,
    now,
  );
  const input = bookingInput(available, winner);
  const retries = await Promise.all([
    bookPickup(pool, input, winnerActor, now),
    bookPickup(pool, input, winnerActor, now),
  ]);
  assert.deepEqual(retries.map((receipt) => receipt.replayed).sort(), [
    false,
    true,
  ]);
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM pickup_bookings"))
      .rows[0].count,
    2,
  );
  assert.deepEqual(
    (await pool.query("SELECT * FROM inventory_levels")).rows,
    stock,
  );
});

test("native rescheduling keeps the old appointment on conflict or audit failure and never replays over a later booking", async () => {
  await stockFixture();
  const first = await paidOrder("a".repeat(64));
  const second = await paidOrder("b".repeat(64));
  const point = await configuredPoint();
  const now = Date.now();
  const date = new Date(now + 86400_000).toLocaleDateString("en-CA", {
    timeZone: point.timezone,
  });
  const firstActor = { kind: "buyer" as const, hash: "a".repeat(64) };
  const secondActor = { kind: "buyer" as const, hash: "b".repeat(64) };
  const a = await getPickupAvailability(
    pool,
    { orderId: first, siteKey: point.key, from: date, days: 1 },
    firstActor,
    now,
  );
  const b = await getPickupAvailability(
    pool,
    { orderId: second, siteKey: point.key, from: date, days: 1 },
    secondActor,
    now,
  );
  const original = bookingInput(a, first);
  const booked = await bookPickup(pool, original, firstActor, now);
  const change = await getPickupAvailability(
    pool,
    { orderId: first, siteKey: point.key, from: date, days: 1 },
    firstActor,
    now,
  );
  await bookPickup(pool, bookingInput(b, second, 1), secondActor, now);
  await assert.rejects(
    bookPickup(pool, bookingInput(change, first, 1), firstActor, now),
    (error) =>
      error instanceof PickupError && error.code === "PICKUP_SLOT_FULL",
  );
  assert.equal(
    new Date(
      (
        await pool.query(
          "SELECT starts_at FROM pickup_bookings WHERE order_key=$1",
          [first],
        )
      ).rows[0].starts_at,
    ).toISOString(),
    booked.booking!.startsAt,
  );
  const updated = await bookPickup(
    pool,
    bookingInput(change, first, 2),
    firstActor,
    now,
  );
  assert.equal(updated.booking!.revision, 2);
  await bookPickup(pool, original, firstActor, now);
  assert.equal(
    new Date(
      (
        await pool.query(
          "SELECT starts_at FROM pickup_bookings WHERE order_key=$1",
          [first],
        )
      ).rows[0].starts_at,
    ).toISOString(),
    updated.booking!.startsAt,
  );
  await pool.query(`CREATE FUNCTION reject_booking_audit_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.action='book_pickup' THEN RAISE EXCEPTION 'fixture audit unavailable'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_booking_audit_fixture BEFORE INSERT ON admin_operations FOR EACH ROW EXECUTE FUNCTION reject_booking_audit_fixture();`);
  const current = await getPickupAvailability(
    pool,
    { orderId: first, siteKey: point.key, from: date, days: 1 },
    firstActor,
    now,
  );
  const failing = bookingInput(current, first);
  await assert.rejects(bookPickup(pool, failing, firstActor, now));
  assert.equal(
    new Date(
      (
        await pool.query(
          "SELECT starts_at FROM pickup_bookings WHERE order_key=$1",
          [first],
        )
      ).rows[0].starts_at,
    ).toISOString(),
    updated.booking!.startsAt,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM admin_operations WHERE operation_id=$1",
        [failing.operationId],
      )
    ).rows[0].count,
    0,
  );
});

test("native scheduling rejects pending, expired, revoked and physically collected orders without guessing eligibility", async () => {
  await stockFixture();
  const paid = await paidOrder("a".repeat(64));
  const point = await configuredPoint();
  const now = Date.now();
  const date = new Date(now + 86400_000).toLocaleDateString("en-CA", {
    timeZone: point.timezone,
  });
  const actor = { kind: "buyer" as const, hash: "a".repeat(64) };
  const pending = {
    operationId: randomUUID(),
    lines: [{ variantKey: "test-bar", quantity: 1 }],
  };
  await reserveCheckout(pool, pending, "test-stock", "b".repeat(64));
  await assert.rejects(
    getPickupAvailability(
      pool,
      { orderId: pending.operationId, siteKey: point.key, from: date, days: 1 },
      { kind: "buyer", hash: "b".repeat(64) },
      now,
    ),
    (error) =>
      error instanceof PickupError && error.code === "PICKUP_ORDER_NOT_READY",
  );
  const available = await getPickupAvailability(
    pool,
    { orderId: paid, siteKey: point.key, from: date, days: 1 },
    actor,
    now,
  );
  const input = bookingInput(available, paid);
  await assert.rejects(
    bookPickup(pool, input, actor, now + 31 * 86400_000),
    (error) => error instanceof PickupError && error.status === 404,
  );
  await pool.query(
    "INSERT INTO admin_operations(operation_id,actor_key,action,resource_key,request_hash,result) VALUES($1,'operator:revoke-fixture','revoke_pickup_access',$2,$3,'{}'::jsonb)",
    [randomUUID(), paid, "c".repeat(64)],
  );
  await assert.rejects(
    bookPickup(pool, input, actor, now),
    (error) => error instanceof PickupError && error.status === 404,
  );
  const another = await paidOrder("d".repeat(64));
  const anotherActor = { kind: "buyer" as const, hash: "d".repeat(64) };
  const next = await getPickupAvailability(
    pool,
    { orderId: another, siteKey: point.key, from: date, days: 1 },
    anotherActor,
    now,
  );
  const nextInput = bookingInput(next, another);
  await bookPickup(pool, nextInput, anotherActor, now);
  const revision = (
    await pool.query("SELECT revision FROM orders WHERE order_key=$1", [
      another,
    ])
  ).rows[0].revision;
  await recordOrderPickup(
    pool,
    another,
    { operationId: randomUUID(), expectedRevision: revision },
    "operator:pickup-test",
  );
  await assert.rejects(
    bookPickup(pool, nextInput, anotherActor, now),
    (error) =>
      error instanceof PickupError && error.code === "PICKUP_ORDER_NOT_READY",
  );
});

test("the booked cutoff is preserved when a buyer changes sites and an operator can assist explicitly", async () => {
  await stockFixture();
  const orderId = await paidOrder("a".repeat(64));
  const point = await configuredPoint({ rescheduleCutoffHours: 24 });
  const now = Date.now();
  const date = new Date(now + 86400_000).toLocaleDateString("en-CA", {
    timeZone: point.timezone,
  });
  const actor = { kind: "buyer" as const, hash: "a".repeat(64) };
  const available = await getPickupAvailability(
    pool,
    { orderId, siteKey: point.key, from: date, days: 1 },
    actor,
    now,
  );
  const booked = await bookPickup(
    pool,
    bookingInput(available, orderId),
    actor,
    now,
  );
  const { revision: _revision, ...town } = {
    ...point,
    key: "test-town",
    label: "Town test point",
    rescheduleCutoffHours: 0,
  };
  await createPickupSite(
    pool,
    { operationId: randomUUID(), site: town },
    "operator:pickup-test",
  );
  const late = Date.parse(booked.booking!.startsAt) - 12 * 3_600_000;
  const operator = { kind: "admin" as const, actorId: "operator:pickup-test" };
  const choices = await getPickupAvailability(
    pool,
    { orderId, siteKey: town.key, from: date, days: 1 },
    operator,
    late,
  );
  const change = bookingInput(choices, orderId);
  await assert.rejects(
    bookPickup(pool, change, actor, late),
    (error) =>
      error instanceof PickupError &&
      error.code === "PICKUP_CHANGE_WINDOW_CLOSED",
  );
  const assisted = await bookPickup(
    pool,
    { ...change, operationId: randomUUID() },
    operator,
    late,
  );
  assert.equal(assisted.booking!.siteKey, town.key);
  assert.equal(assisted.booking!.rescheduleCutoffHours, 0);
  assert.equal(
    (
      await pool.query("SELECT location_key FROM orders WHERE order_key=$1", [
        orderId,
      ])
    ).rows[0].location_key,
    "test-stock",
  );
});

test("customer context protects directions and supports durable help and revocation without changing paid orders", async () => {
  await stockFixture();
  const first = await paidOrder("a".repeat(64));
  const second = await paidOrder("b".repeat(64));
  const legacy = await paidOrder();
  const point = await configuredPoint();
  const now = Date.now();
  const date = new Date(now + 86400_000).toLocaleDateString("en-CA", {
    timeZone: point.timezone,
  });
  const actor = { kind: "buyer" as const, hash: "a".repeat(64) };
  const stock = (await pool.query("SELECT * FROM inventory_levels")).rows;
  const before = await getCustomerPickupContext(pool, actor.hash, now);
  assert.deepEqual(
    before.orders.map((order) => order.id),
    [first],
  );
  assert.equal(before.orders[0]!.instructions, null);
  assert.equal(JSON.stringify(before).includes("test-stock"), false);
  assert.equal(
    JSON.stringify(before).includes(point.privateInstructions),
    false,
  );
  const available = await getPickupAvailability(
    pool,
    { orderId: first, siteKey: point.key, from: date, days: 1 },
    actor,
    now,
  );
  const booking = await bookPickup(
    pool,
    bookingInput(available, first),
    actor,
    now,
  );
  const context = await getCustomerPickupContext(pool, actor.hash, now);
  assert.equal(context.orders[0]!.instructions, point.privateInstructions);
  const help = {
    operationId: randomUUID(),
    orderId: first,
    expectedOrderRevision: context.orders[0]!.revision,
    expectedBookingRevision: booking.revision,
  };
  const receipt = await requestPickupHelp(pool, help, actor, now);
  assert.equal(
    (await requestPickupHelp(pool, help, actor, now)).replayed,
    true,
  );
  assert.equal(receipt.resourceKey, first);
  await updatePickupSettings(
    pool,
    { operationId: randomUUID(), expectedRevision: 2, enabled: false },
    "operator:pickup-test",
  );
  const disabled = await getCustomerPickupContext(pool, actor.hash, now);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.orders[0]!.instructions, point.privateInstructions);
  assert.equal(disabled.orders[0]!.canSchedule, false);
  assert.equal(disabled.orders[0]!.helpRequested, true);
  assert.equal(
    (
      await getCustomerPickupContext(
        pool,
        actor.hash,
        Date.parse(booking.booking!.endsAt) + 1,
      )
    ).orders[0]!.instructions,
    null,
  );
  const dashboard = await getAdminPickupDashboard(pool);
  assert.equal(
    dashboard.orders.find((order) => order.id === first)!.helpRequested,
    true,
  );
  assert.equal(
    dashboard.orders.find((order) => order.id === second)!.booking,
    null,
  );
  assert.equal(
    dashboard.orders.find((order) => order.id === legacy)!.sites[0]!.key,
    point.key,
  );
  assert.deepEqual(dashboard.stockLocations, [
    { key: "test-stock", label: "Test fulfillment stock" },
  ]);
  const revoke = {
    operationId: randomUUID(),
    orderId: first,
    expectedOrderRevision: context.orders[0]!.revision,
  };
  await revokePickupAccess(pool, revoke, "operator:pickup-test");
  assert.equal(
    (await revokePickupAccess(pool, revoke, "operator:pickup-test")).replayed,
    true,
  );
  assert.equal(
    (await getCustomerPickupContext(pool, actor.hash, now)).orders.length,
    0,
  );
  assert.equal(
    (await getAdminPickupDashboard(pool)).orders.find(
      (order) => order.id === first,
    )!.buyerAccessRevoked,
    true,
  );
  await assert.rejects(
    requestPickupHelp(pool, { ...help, operationId: randomUUID() }, actor, now),
    (error) => error instanceof PickupError && error.status === 404,
  );
  assert.deepEqual(
    (await pool.query("SELECT * FROM inventory_levels")).rows,
    stock,
  );
  assert.equal(
    (await pool.query("SELECT state FROM orders WHERE order_key=$1", [first]))
      .rows[0].state,
    "paid",
  );
  assert.equal(
    (
      await pool.query(
        "SELECT status FROM pickup_bookings WHERE order_key=$1",
        [first],
      )
    ).rows[0].status,
    "scheduled",
  );
});

test("site closures require exact current impact acknowledgement, retain appointments and never silently reconfirm them", async () => {
  await stockFixture();
  const first = await paidOrder("a".repeat(64));
  const second = await paidOrder("b".repeat(64));
  const point = await configuredPoint();
  const now = Date.now();
  const date = new Date(now + 86400_000).toLocaleDateString("en-CA", {
    timeZone: point.timezone,
  });
  const actor = { kind: "buyer" as const, hash: "a".repeat(64) };
  const a = await getPickupAvailability(
    pool,
    { orderId: first, siteKey: point.key, from: date, days: 1 },
    actor,
    now,
  );
  await bookPickup(pool, bookingInput(a, first), actor, now);
  const { revision: _revision, ...site } = {
    ...point,
    exceptions: { [date]: [] },
  };
  const input = {
    operationId: randomUUID(),
    expectedRevision: point.revision,
    site,
  };
  const review = await updatePickupSite(
    pool,
    point.key,
    input,
    "operator:pickup-test",
    now,
  ).then(
    () => assert.fail("Closure must require an impact review"),
    (error: unknown) => {
      assert(error instanceof PickupImpactError);
      return error.impact;
    },
  );
  assert.deepEqual(
    review.bookings.map((row) => row.orderId),
    [first],
  );
  assert.equal((await getPickupSite(pool, point.key))!.revision, 1);
  assert.equal(
    (await pool.query("SELECT status FROM pickup_bookings")).rows[0].status,
    "scheduled",
  );
  const bActor = { kind: "buyer" as const, hash: "b".repeat(64) };
  const b = await getPickupAvailability(
    pool,
    { orderId: second, siteKey: point.key, from: date, days: 1 },
    bActor,
    now,
  );
  await bookPickup(pool, bookingInput(b, second), bActor, now);
  const stale = { ...input, operationId: randomUUID(), impactAck: review.ack };
  const updatedReview = await updatePickupSite(
    pool,
    point.key,
    stale,
    "operator:pickup-test",
    now,
  ).then(
    () => assert.fail("A changed impact must require a new review"),
    (error: unknown) => {
      assert(error instanceof PickupImpactError);
      return error.impact;
    },
  );
  assert.equal(updatedReview.bookings.length, 2);
  assert.notEqual(updatedReview.ack, review.ack);
  const acknowledged = {
    ...input,
    operationId: randomUUID(),
    impactAck: updatedReview.ack,
  };
  const before = (
    await pool.query(
      "SELECT order_key,starts_at,ends_at FROM pickup_bookings ORDER BY order_key",
    )
  ).rows;
  const receipt = await updatePickupSite(
    pool,
    point.key,
    acknowledged,
    "operator:pickup-test",
    now,
  );
  assert.equal(receipt.revision, 2);
  assert.equal(
    (
      await updatePickupSite(
        pool,
        point.key,
        acknowledged,
        "operator:pickup-test",
        now,
      )
    ).replayed,
    true,
  );
  assert.deepEqual(
    (
      await pool.query(
        "SELECT order_key,starts_at,ends_at FROM pickup_bookings ORDER BY order_key",
      )
    ).rows,
    before,
  );
  assert.deepEqual(
    (await pool.query("SELECT status,revision FROM pickup_bookings")).rows,
    [
      { status: "needs_review", revision: 2 },
      { status: "needs_review", revision: 2 },
    ],
  );
  assert.equal(
    (await getCustomerPickupContext(pool, actor.hash, now)).orders[0]!
      .instructions,
    null,
  );
  await updatePickupSite(
    pool,
    point.key,
    {
      operationId: randomUUID(),
      expectedRevision: 2,
      site: { ...site, exceptions: {} },
    },
    "operator:pickup-test",
    now,
  );
  assert.deepEqual(
    (await pool.query("SELECT status FROM pickup_bookings")).rows.map(
      (row) => row.status,
    ),
    ["needs_review", "needs_review"],
  );
  const audit = (
    await pool.query(
      "SELECT before_data,after_data,result FROM admin_operations WHERE operation_id=$1",
      [acknowledged.operationId],
    )
  ).rows;
  assert.equal(
    JSON.stringify(audit).includes(point.privateInstructions),
    false,
  );
});

test("capacity reductions and shared-operator travel changes review every affected site's appointments", async () => {
  await stockFixture();
  const first = await paidOrder("a".repeat(64));
  const second = await paidOrder("b".repeat(64));
  const third = await paidOrder("c".repeat(64));
  const point = await configuredPoint({ capacity: 2 });
  const now = Date.now();
  const date = new Date(now + 86400_000).toLocaleDateString("en-CA", {
    timeZone: point.timezone,
  });
  for (const [orderId, hash] of [
    [first, "a".repeat(64)],
    [second, "b".repeat(64)],
  ] as const) {
    const actor = { kind: "buyer" as const, hash };
    const available = await getPickupAvailability(
      pool,
      { orderId, siteKey: point.key, from: date, days: 1 },
      actor,
      now,
    );
    await bookPickup(pool, bookingInput(available, orderId), actor, now);
  }
  const { revision: _revision, ...town } = {
    ...point,
    key: "test-town",
    label: "Test town",
    capacity: 1,
  };
  await createPickupSite(
    pool,
    { operationId: randomUUID(), site: town },
    "operator:pickup-test",
  );
  const actor = { kind: "buyer" as const, hash: "c".repeat(64) };
  const available = await getPickupAvailability(
    pool,
    { orderId: third, siteKey: town.key, from: date, days: 1 },
    actor,
    now,
  );
  await bookPickup(pool, bookingInput(available, third), actor, now);
  const { revision: _pointRevision, ...site } = {
    ...point,
    capacity: 1,
    travelBufferMinutes: 30,
  };
  const input = { operationId: randomUUID(), expectedRevision: 1, site };
  const review = await updatePickupSite(
    pool,
    point.key,
    input,
    "operator:pickup-test",
    now,
  ).then(
    () => assert.fail("Capacity and travel conflicts require review"),
    (error: unknown) => {
      assert(error instanceof PickupImpactError);
      return error.impact;
    },
  );
  assert.deepEqual(
    review.bookings.map((row) => row.orderId).sort(),
    [first, second, third].sort(),
  );
  assert(
    review.bookings
      .find((row) => row.orderId === third)!
      .reasons.some((reason) => /travel/i.test(reason)),
  );
  await updatePickupSite(
    pool,
    point.key,
    { ...input, operationId: randomUUID(), impactAck: review.ack },
    "operator:pickup-test",
    now,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM pickup_bookings WHERE status='needs_review'",
      )
    ).rows[0].count,
    3,
  );
});

test("booking revalidates time after acquiring the operator lock rather than accepting a queued stale slot", async (context) => {
  await stockFixture();
  const orderId = await paidOrder("a".repeat(64));
  const point = await configuredPoint();
  const now = Date.now();
  const actor = { kind: "buyer" as const, hash: "a".repeat(64) };
  const date = new Date(now + 86400_000).toLocaleDateString("en-CA", {
    timeZone: point.timezone,
  });
  const choices = await getPickupAvailability(
    pool,
    { orderId, siteKey: point.key, from: date, days: 1 },
    actor,
    now,
  );
  const blocker = await pool.connect();
  await blocker.query("BEGIN");
  await blocker.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('pickup-scheduling-operator',0))",
  );
  let observed = now;
  context.mock.method(Date, "now", () => observed);
  const attempt = bookPickup(pool, bookingInput(choices, orderId), actor);
  observed = Date.parse(choices.slots[0]!.startsAt) + 1;
  try {
    await blocker.query("COMMIT");
    await assert.rejects(
      attempt,
      (error) =>
        error instanceof PickupError &&
        error.code === "PICKUP_SLOT_UNAVAILABLE",
    );
    assert.equal(
      (await pool.query("SELECT count(*)::int AS count FROM pickup_bookings"))
        .rows[0].count,
      0,
    );
  } finally {
    context.mock.restoreAll();
    blocker.release();
  }
});

test("booking versus an unacknowledged date closure cannot silently strand a confirmed appointment", async () => {
  await stockFixture();
  const orderId = await paidOrder("a".repeat(64));
  const point = await configuredPoint();
  const now = Date.now();
  const actor = { kind: "buyer" as const, hash: "a".repeat(64) };
  const date = new Date(now + 86400_000).toLocaleDateString("en-CA", {
    timeZone: point.timezone,
  });
  const available = await getPickupAvailability(
    pool,
    { orderId, siteKey: point.key, from: date, days: 1 },
    actor,
    now,
  );
  const { revision: _revision, ...site } = {
    ...point,
    exceptions: { [date]: [] },
  };
  const stock = (await pool.query("SELECT * FROM inventory_levels")).rows;
  const [closure, booking] = await Promise.allSettled([
    updatePickupSite(
      pool,
      point.key,
      { operationId: randomUUID(), expectedRevision: 1, site },
      "operator:pickup-test",
      now,
    ),
    bookPickup(pool, bookingInput(available, orderId), actor, now),
  ]);
  assert.notEqual(closure.status, booking.status);
  if (closure.status === "fulfilled") {
    assert.equal((await getPickupSite(pool, point.key))!.revision, 2);
    assert.equal(
      (await pool.query("SELECT count(*)::int AS count FROM pickup_bookings"))
        .rows[0].count,
      0,
    );
    assert(
      booking.status === "rejected" &&
        booking.reason instanceof PickupError &&
        booking.reason.code === "REVISION_CONFLICT",
    );
  } else {
    assert(closure.reason instanceof PickupImpactError);
    assert.equal((await getPickupSite(pool, point.key))!.revision, 1);
    assert.equal(
      (await pool.query("SELECT status FROM pickup_bookings")).rows[0].status,
      "scheduled",
    );
  }
  assert.deepEqual(
    (await pool.query("SELECT * FROM inventory_levels")).rows,
    stock,
  );
});
