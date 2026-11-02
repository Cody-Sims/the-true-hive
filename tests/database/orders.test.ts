import test, { beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import {
  reserveCheckout,
  attachCheckoutSession,
  getCheckoutReservation,
  applyCheckoutPayment,
  releaseExpiredCheckout,
  markCheckoutReconciliation,
  listPendingCheckoutReservations,
  listAdminOrders,
  getAdminOrder,
  recordOrderPickup,
} from "../../src/server/commerce/orders.ts";
import {
  OrderConflictError,
  OrderInputError,
  OrderNotFoundError,
} from "../../src/server/commerce/rules.ts";
import type {
  CheckoutReservation,
  CheckoutPayment,
} from "../../src/domain/commerce.ts";

const connection = process.env["TEST_DATABASE_URL"];
assert(
  connection,
  "TEST_DATABASE_URL must name the isolated PostgreSQL test instance.",
);
const url = new URL(connection);
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/true_hive_test");
const admin = new Pool({ connectionString: connection, max: 1 });
let pool: Pool;
let schema: string;

beforeEach(async () => {
  schema = `orders_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  pool = new Pool({
    connectionString: connection,
    options: `-c search_path=${schema}`,
    max: 8,
  });
  for (const name of ["001_inventory.sql", "002_admin_commerce.sql"]) {
    await pool.query(
      await readFile(
        new URL(`../../migrations/${name}`, import.meta.url),
        "utf8",
      ),
    );
  }
  await pool.query(`
    INSERT INTO products (product_key,slug,title,summary,category,image_key,kind,published)
      VALUES ('soap','soap','Test soap','Test-only description','soap','soap','active',true);
    INSERT INTO product_variants (variant_key,product_key,sku,label,price_minor)
      VALUES ('soap-a','soap','TEST-A','Small',800),('soap-b','soap','TEST-B','Large',1200);
    INSERT INTO inventory_locations (location_key,name,active,pickup_enabled)
      VALUES ('pickup','Test-only pickup',true,true);
    INSERT INTO inventory_levels (variant_key,location_key,on_hand)
      VALUES ('soap-a','pickup',5),('soap-b','pickup',5);
  `);
});

afterEach(async () => {
  await pool?.end();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
});
after(async () => {
  await admin.end();
});

test("reservation holds authoritative snapshot prices without changing physical stock; retry remains immutable", async () => {
  const input = {
    operationId: randomUUID(),
    lines: [
      { variantKey: "soap-b", quantity: 1, priceMinor: 1 },
      { variantKey: "soap-a", quantity: 2, priceMinor: 1 },
    ],
  };
  const before = Date.now();
  const reservation = await reserveCheckout(pool, input, "pickup");
  assert.equal(reservation.totalMinor, 2800);
  assert.equal(reservation.state, "creating");
  assert.equal(reservation.checkoutSessionId, null);
  assert(Date.parse(reservation.checkoutExpiresAt) >= before + 3_600_000);
  assert(Date.parse(reservation.checkoutExpiresAt) <= Date.now() + 3_600_000);
  assert.deepEqual(reservation.lines, [
    {
      variantKey: "soap-a",
      title: "Test soap",
      label: "Small",
      quantity: 2,
      priceMinor: 800,
    },
    {
      variantKey: "soap-b",
      title: "Test soap",
      label: "Large",
      quantity: 1,
      priceMinor: 1200,
    },
  ]);
  assert.deepEqual(
    (
      await pool.query(
        "SELECT variant_key,on_hand,held,committed,revision FROM inventory_levels ORDER BY variant_key",
      )
    ).rows,
    [
      { variant_key: "soap-a", on_hand: 5, held: 2, committed: 0, revision: 2 },
      { variant_key: "soap-b", on_hand: 5, held: 1, committed: 0, revision: 2 },
    ],
  );
  await pool.query(
    "UPDATE product_variants SET price_minor=2500,active=false; UPDATE products SET published=false,archived=true",
  );
  assert.deepEqual(
    await reserveCheckout(
      pool,
      { ...input, lines: [...input.lines].reverse() },
      "pickup",
    ),
    reservation,
  );
});

function intent(quantity = 1) {
  return {
    operationId: randomUUID(),
    lines: [{ variantKey: "soap-a", quantity }],
  };
}
async function open(quantity = 1, multiline = false) {
  const input = intent(quantity);
  if (multiline) input.lines.push({ variantKey: "soap-b", quantity });
  const row = await reserveCheckout(pool, input, "pickup");
  return attachCheckoutSession(
    pool,
    row.id,
    `cs_${row.id.replaceAll("-", "")}`,
    row.checkoutExpiresAt,
  );
}
function payment(
  row: CheckoutReservation,
  eventId = `evt_${randomUUID().replaceAll("-", "")}`,
) {
  return {
    eventId,
    orderId: row.id,
    sessionId: row.checkoutSessionId!,
    paymentIntentId: `pi_${row.id.replaceAll("-", "")}`,
    totalMinor: row.totalMinor,
    currency: "USD" as const,
  };
}
function expiry(
  row: CheckoutReservation,
  eventId = `evt_${randomUUID().replaceAll("-", "")}`,
) {
  return { eventId, orderId: row.id, sessionId: row.checkoutSessionId! };
}
async function stock() {
  return (
    await pool.query(
      "SELECT variant_key,on_hand,held,committed,revision FROM inventory_levels ORDER BY variant_key",
    )
  ).rows;
}

test("last-unit contention admits one checkout and canonical operation replay never reallocates", async () => {
  await pool.query("UPDATE inventory_levels SET on_hand=1");
  const one = intent();
  const two = intent();
  const results = await Promise.allSettled([
    reserveCheckout(pool, one, "pickup"),
    reserveCheckout(pool, two, "pickup"),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.filter(
      (result) =>
        result.status === "rejected" &&
        result.reason instanceof OrderConflictError,
    ).length,
    1,
  );
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM orders")).rows[0]
      .count,
    1,
  );
  assert.deepEqual((await stock())[0], {
    variant_key: "soap-a",
    on_hand: 1,
    held: 1,
    committed: 0,
    revision: 2,
  });
  const winner = results[0].status === "fulfilled" ? one : two;
  await Promise.all([
    reserveCheckout(pool, winner, "pickup"),
    reserveCheckout(pool, winner, "pickup"),
  ]);
  assert.equal((await stock())[0].held, 1);
  await assert.rejects(
    reserveCheckout(
      pool,
      { ...winner, lines: [{ variantKey: "soap-a", quantity: 2 }] },
      "pickup",
    ),
    OrderConflictError,
  );
});

test("multi-line shortages, missing stock, ineligible merchandise and overflow roll back every hold and snapshot", async () => {
  const two = {
    operationId: randomUUID(),
    lines: [
      { variantKey: "soap-a", quantity: 1 },
      { variantKey: "soap-b", quantity: 6 },
    ],
  };
  await assert.rejects(
    reserveCheckout(pool, two, "pickup"),
    OrderConflictError,
  );
  await pool.query("DELETE FROM inventory_levels WHERE variant_key='soap-b'");
  await assert.rejects(
    reserveCheckout(
      pool,
      { ...two, lines: two.lines.map((line) => ({ ...line, quantity: 1 })) },
      "pickup",
    ),
    OrderConflictError,
  );
  await pool.query(
    "INSERT INTO inventory_levels(variant_key,location_key,on_hand) VALUES('soap-b','pickup',5)",
  );
  for (const [disable, restore] of [
    [
      "UPDATE product_variants SET active=false",
      "UPDATE product_variants SET active=true",
    ],
    [
      "UPDATE product_variants SET price_minor=NULL",
      "UPDATE product_variants SET price_minor=800",
    ],
    ["UPDATE products SET kind='concept'", "UPDATE products SET kind='active'"],
    [
      "UPDATE products SET published=false,archived=true",
      "UPDATE products SET archived=false,published=true",
    ],
    [
      "UPDATE inventory_locations SET pickup_enabled=false",
      "UPDATE inventory_locations SET pickup_enabled=true",
    ],
    [
      "UPDATE inventory_locations SET active=false",
      "UPDATE inventory_locations SET active=true",
    ],
    [
      "UPDATE inventory_levels SET revision=2147483647",
      "UPDATE inventory_levels SET revision=1",
    ],
    [
      "UPDATE product_variants SET price_minor=2147483647",
      "UPDATE product_variants SET price_minor=800",
    ],
  ]) {
    await pool.query(disable!);
    await assert.rejects(
      reserveCheckout(pool, intent(2), "pickup"),
      OrderConflictError,
    );
    await pool.query(restore!);
  }
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM orders")).rows[0]
      .count,
    0,
  );
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM order_lines")).rows[0]
      .count,
    0,
  );
  assert.deepEqual(await stock(), [
    { variant_key: "soap-a", on_hand: 5, held: 0, committed: 0, revision: 1 },
    { variant_key: "soap-b", on_hand: 5, held: 0, committed: 0, revision: 1 },
  ]);
});

test("attachment keeps one provider identity and original expiry without reopening terminal orders", async () => {
  const row = await reserveCheckout(pool, intent(), "pickup");
  const attached = await attachCheckoutSession(
    pool,
    row.id,
    "cs_test_one",
    row.checkoutExpiresAt,
  );
  assert.equal(attached.state, "open");
  assert.equal(attached.checkoutExpiresAt, row.checkoutExpiresAt);
  assert.deepEqual(
    await attachCheckoutSession(
      pool,
      row.id,
      "cs_test_one",
      row.checkoutExpiresAt,
    ),
    attached,
  );
  await assert.rejects(
    attachCheckoutSession(pool, row.id, "cs_test_two", row.checkoutExpiresAt),
    OrderConflictError,
  );
  await assert.rejects(
    attachCheckoutSession(
      pool,
      row.id,
      "cs_test_one",
      new Date(Date.parse(row.checkoutExpiresAt) + 1000).toISOString(),
    ),
    OrderConflictError,
  );
  const other = await reserveCheckout(pool, intent(), "pickup");
  await assert.rejects(
    attachCheckoutSession(
      pool,
      other.id,
      "cs_test_one",
      other.checkoutExpiresAt,
    ),
    OrderConflictError,
  );
  assert.equal(
    (await getCheckoutReservation(pool, other.id))?.state,
    "creating",
  );
  await applyCheckoutPayment(pool, payment(attached));
  assert.equal(
    (
      await attachCheckoutSession(
        pool,
        row.id,
        "cs_test_one",
        row.checkoutExpiresAt,
      )
    ).state,
    "paid",
  );
  await recordOrderPickup(
    pool,
    row.id,
    {
      operationId: randomUUID(),
      expectedRevision: (await getAdminOrder(pool, row.id))!.revision,
    },
    "operator:test",
  );
  assert.equal(
    (
      await attachCheckoutSession(
        pool,
        row.id,
        "cs_test_one",
        row.checkoutExpiresAt,
      )
    ).state,
    "picked_up",
  );
  const expired = await open();
  await releaseExpiredCheckout(pool, expiry(expired));
  assert.equal(
    (
      await attachCheckoutSession(
        pool,
        expired.id,
        expired.checkoutSessionId!,
        expired.checkoutExpiresAt,
      )
    ).state,
    "expired",
  );
});

test("same and distinct concurrent payment events commit all lines exactly once, never subtract physical stock", async () => {
  const row = await open(2, true);
  const receipt = payment(row);
  const results = await Promise.all([
    applyCheckoutPayment(pool, receipt),
    applyCheckoutPayment(pool, receipt),
    applyCheckoutPayment(pool, payment(row)),
  ]);
  assert.deepEqual(results.sort(), [
    "already_processed",
    "already_processed",
    "paid",
  ]);
  assert.deepEqual(await stock(), [
    { variant_key: "soap-a", on_hand: 5, held: 0, committed: 2, revision: 3 },
    { variant_key: "soap-b", on_hand: 5, held: 0, committed: 2, revision: 3 },
  ]);
  const order = (await getAdminOrder(pool, row.id))!;
  assert.equal(order.state, "paid");
  assert(order.paidAt);
  assert.equal(order.revision, 3);
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM payment_events"))
      .rows[0].count,
    2,
  );
});

test("event ID reused for another order or altered payload conflicts without mutating either order", async () => {
  const a = await open();
  const b = await open();
  const receipt = payment(a);
  await applyCheckoutPayment(pool, receipt);
  const before = await stock();
  await assert.rejects(
    applyCheckoutPayment(pool, payment(b, receipt.eventId)),
    OrderConflictError,
  );
  await assert.rejects(
    applyCheckoutPayment(pool, { ...receipt, totalMinor: 1 }),
    OrderConflictError,
  );
  await assert.rejects(
    releaseExpiredCheckout(pool, expiry(a, receipt.eventId)),
    OrderConflictError,
  );
  assert.deepEqual(await stock(), before);
  assert.equal((await getAdminOrder(pool, b.id))?.state, "open");
  assert.equal((await getAdminOrder(pool, a.id))?.reconciliationReason, null);
});

test("mismatched payments quarantine durably while keeping holds; verified recovery can settle", async () => {
  for (const mismatch of [
    { totalMinor: 1 },
    { sessionId: "cs_unrelated" },
    { currency: "EUR" },
  ]) {
    const row = await open();
    const receipt = { ...payment(row), ...mismatch } as CheckoutPayment;
    assert.equal(
      await applyCheckoutPayment(pool, receipt),
      "reconciliation_required",
    );
    assert.equal(
      await applyCheckoutPayment(pool, receipt),
      "reconciliation_required",
    );
    assert.equal(
      (await getAdminOrder(pool, row.id))?.state,
      "reconciliation_required",
    );
    assert.equal(await applyCheckoutPayment(pool, payment(row)), "paid");
  }
  assert.equal((await stock())[0].committed, 3);
  assert.equal((await stock())[0].held, 0);
  assert.equal((await stock())[0].on_hand, 5);
});

test("concurrent confirmed expiry and payment serialize without double allocation or release", async () => {
  const row = await open(2, true);
  const [paid, expired] = await Promise.all([
    applyCheckoutPayment(pool, payment(row)),
    releaseExpiredCheckout(pool, expiry(row)),
  ]);
  if (paid === "paid") {
    assert.equal(expired, "already_processed");
    assert.equal((await getAdminOrder(pool, row.id))?.state, "paid");
    assert.deepEqual(await stock(), [
      { variant_key: "soap-a", on_hand: 5, held: 0, committed: 2, revision: 3 },
      { variant_key: "soap-b", on_hand: 5, held: 0, committed: 2, revision: 3 },
    ]);
  } else {
    assert.equal(paid, "reconciliation_required");
    assert.equal(expired, "expired");
    assert.equal(
      (await getAdminOrder(pool, row.id))?.state,
      "reconciliation_required",
    );
    assert.deepEqual(await stock(), [
      { variant_key: "soap-a", on_hand: 5, held: 0, committed: 0, revision: 3 },
      { variant_key: "soap-b", on_hand: 5, held: 0, committed: 0, revision: 3 },
    ]);
  }
});

test("payment-event persistence failure rolls back settlement and expiry across every line", async () => {
  for (const outcome of ["paid", "expired"]) {
    const row = await open(2, true);
    const beforeStock = await stock();
    const beforeOrder = await getAdminOrder(pool, row.id);
    const receipt = outcome === "paid" ? payment(row) : expiry(row);
    const settle = () =>
      outcome === "paid"
        ? applyCheckoutPayment(pool, receipt as CheckoutPayment)
        : releaseExpiredCheckout(pool, receipt);
    await pool.query(`
      CREATE FUNCTION reject_event() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Test-only event persistence failure'; END; $$;
      CREATE TRIGGER reject_event_write BEFORE INSERT ON payment_events FOR EACH ROW EXECUTE FUNCTION reject_event();
    `);
    await assert.rejects(settle(), /Test-only event persistence failure/);
    assert.deepEqual(await stock(), beforeStock);
    assert.deepEqual(await getAdminOrder(pool, row.id), beforeOrder);
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM payment_events WHERE event_key=$1",
          [receipt.eventId],
        )
      ).rows[0].count,
      0,
    );
    await pool.query(
      "DROP TRIGGER reject_event_write ON payment_events; DROP FUNCTION reject_event()",
    );
    assert.equal(await settle(), outcome);
  }
});

test("expired creation window cannot attach a fresh session or free the uncertain hold", async () => {
  const row = await reserveCheckout(pool, intent(), "pickup");
  await pool.query(
    "UPDATE orders SET checkout_expires_at=CURRENT_TIMESTAMP - interval '1 hour' WHERE order_key=$1",
    [row.id],
  );
  const old = (await getCheckoutReservation(pool, row.id))!;
  await assert.rejects(
    attachCheckoutSession(pool, row.id, "cs_too_late", old.checkoutExpiresAt),
    OrderConflictError,
  );
  await markCheckoutReconciliation(
    pool,
    row.id,
    "Requested provider creation window elapsed.",
  );
  assert.equal(
    (await getAdminOrder(pool, row.id))?.state,
    "reconciliation_required",
  );
  assert.equal((await stock())[0].held, 1);
  assert.equal((await stock())[0].on_hand, 5);
});

test("only confirmed associated expiry releases once; payment after release quarantines without reallocating", async () => {
  const row = await open(2, true);
  const receipt = expiry(row);
  assert.equal(await releaseExpiredCheckout(pool, receipt), "expired");
  assert.equal(
    await releaseExpiredCheckout(pool, receipt),
    "already_processed",
  );
  assert.equal(
    await releaseExpiredCheckout(pool, expiry(row)),
    "already_processed",
  );
  const released = await stock();
  assert.deepEqual(released, [
    { variant_key: "soap-a", on_hand: 5, held: 0, committed: 0, revision: 3 },
    { variant_key: "soap-b", on_hand: 5, held: 0, committed: 0, revision: 3 },
  ]);
  assert.equal(
    await applyCheckoutPayment(pool, payment(row)),
    "reconciliation_required",
  );
  assert.equal(
    await applyCheckoutPayment(pool, payment(row)),
    "reconciliation_required",
  );
  assert.deepEqual(await stock(), released);
  assert.equal(
    (await getAdminOrder(pool, row.id))?.state,
    "reconciliation_required",
  );
  assert.equal(
    await releaseExpiredCheckout(pool, expiry(row)),
    "already_processed",
  );
});

test("paid and picked-up orders never release stock and conflicting late receipts preserve monotonic state", async () => {
  const row = await open();
  await applyCheckoutPayment(pool, payment(row));
  const paid = await stock();
  assert.equal(
    await releaseExpiredCheckout(pool, expiry(row)),
    "already_processed",
  );
  assert.equal(
    await applyCheckoutPayment(pool, { ...payment(row), totalMinor: 1 }),
    "reconciliation_required",
  );
  await markCheckoutReconciliation(
    pool,
    row.id,
    "Provider verification uncertain.",
  );
  assert.equal((await getAdminOrder(pool, row.id))?.state, "paid");
  assert.deepEqual(await stock(), paid);
  const picked = await recordOrderPickup(
    pool,
    row.id,
    {
      operationId: randomUUID(),
      expectedRevision: (await getAdminOrder(pool, row.id))!.revision,
    },
    "operator:test",
  );
  assert.equal(
    await releaseExpiredCheckout(pool, expiry(row)),
    "already_processed",
  );
  await markCheckoutReconciliation(pool, row.id, "Follow-up provider review.");
  assert.equal((await getAdminOrder(pool, row.id))?.state, "picked_up");
  assert.equal(picked.order.state, "picked_up");
  assert.equal((await stock())[0].on_hand, 4);
});

test("unassociated or uncertain reservations retain holds; local time alone never releases", async () => {
  const creating = await reserveCheckout(pool, intent(), "pickup");
  assert.equal(
    await releaseExpiredCheckout(pool, {
      eventId: "evt_unattached",
      orderId: creating.id,
      sessionId: "cs_unknown",
    }),
    "reconciliation_required",
  );
  const row = await open();
  assert.equal(
    await releaseExpiredCheckout(pool, {
      ...expiry(row),
      sessionId: "cs_wrong",
    }),
    "reconciliation_required",
  );
  await pool.query(
    "UPDATE orders SET checkout_expires_at=CURRENT_TIMESTAMP - interval '1 hour'",
  );
  const pending = await listPendingCheckoutReservations(pool, 100);
  assert.equal(pending.length, 2);
  assert.equal((await stock())[0].held, 2);
});

test("pickup consumes every commitment and physical count with line-unique audited receipts, and matching retries return recorded operation", async () => {
  const row = await open(2, true);
  await applyCheckoutPayment(pool, payment(row));
  const before = (await getAdminOrder(pool, row.id))!;
  const input = {
    operationId: randomUUID(),
    expectedRevision: before.revision,
    actorId: "ignored-browser-actor",
  };
  const result = await recordOrderPickup(pool, row.id, input, "operator:test");
  assert.equal(result.order.state, "picked_up");
  assert.equal(result.order.revision, before.revision + 1);
  assert.equal(result.replayed, false);
  assert(result.order.pickedUpAt);
  assert.deepEqual(await stock(), [
    { variant_key: "soap-a", on_hand: 3, held: 0, committed: 0, revision: 4 },
    { variant_key: "soap-b", on_hand: 3, held: 0, committed: 0, revision: 4 },
  ]);
  const movements = (
    await pool.query(
      "SELECT operation_id,actor_id,delta,before_on_hand,after_on_hand,before_revision,after_revision FROM inventory_movements ORDER BY variant_key",
    )
  ).rows;
  assert.equal(
    new Set(movements.map((movement) => movement.operation_id)).size,
    2,
  );
  for (const movement of movements) {
    assert.equal(movement.actor_id, "operator:test");
    assert.equal(movement.delta, -2);
    assert.equal(movement.before_on_hand, 5);
    assert.equal(movement.after_on_hand, 3);
    assert.equal(movement.before_revision, 3);
    assert.equal(movement.after_revision, 4);
  }
  await markCheckoutReconciliation(pool, row.id, "Review after pickup.");
  assert.deepEqual(
    await recordOrderPickup(pool, row.id, input, "operator:test"),
    { order: result.order, replayed: true },
  );
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM admin_operations"))
      .rows[0].count,
    1,
  );
  await assert.rejects(
    recordOrderPickup(pool, row.id, input, "operator:other"),
    OrderConflictError,
  );
  await assert.rejects(
    recordOrderPickup(
      pool,
      row.id,
      { ...input, expectedRevision: before.revision + 1 },
      "operator:test",
    ),
    OrderConflictError,
  );
  await assert.rejects(
    recordOrderPickup(
      pool,
      row.id,
      { operationId: randomUUID(), expectedRevision: result.order.revision },
      "operator:test",
    ),
    OrderConflictError,
  );
});

test("pickup requires paid state, trusted actor and expected revision; competing intents do not decrement twice", async () => {
  const row = await open();
  await assert.rejects(
    recordOrderPickup(
      pool,
      row.id,
      { operationId: randomUUID(), expectedRevision: 2 },
      "operator:test",
    ),
    OrderConflictError,
  );
  await applyCheckoutPayment(pool, payment(row));
  await assert.rejects(
    recordOrderPickup(
      pool,
      row.id,
      { operationId: randomUUID(), expectedRevision: 2 },
      "operator:test",
    ),
    OrderConflictError,
  );
  await assert.rejects(
    recordOrderPickup(
      pool,
      row.id,
      { operationId: randomUUID() },
      "operator:test",
    ),
    OrderInputError,
  );
  await assert.rejects(
    recordOrderPickup(
      pool,
      row.id,
      { operationId: randomUUID(), expectedRevision: 3 },
      "person@example.com",
    ),
    OrderInputError,
  );
  const results = await Promise.allSettled([
    recordOrderPickup(
      pool,
      row.id,
      { operationId: randomUUID(), expectedRevision: 3 },
      "operator:test",
    ),
    recordOrderPickup(
      pool,
      row.id,
      { operationId: randomUUID(), expectedRevision: 3 },
      "operator:test",
    ),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal((await stock())[0].on_hand, 4);
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM inventory_movements"))
      .rows[0].count,
    1,
  );
});

test("pickup ledger or admin-operation insertion failure rolls back every line, order and audit", async () => {
  const row = await open(2, true);
  await applyCheckoutPayment(pool, payment(row));
  const beforeStock = await stock();
  const beforeOrder = await getAdminOrder(pool, row.id);
  for (const [table, condition] of [
    ["inventory_movements", "NEW.variant_key = 'soap-b'"],
    ["admin_operations", "true"],
  ]) {
    await pool.query(`
      CREATE FUNCTION reject_test_write() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF ${condition} THEN RAISE EXCEPTION 'Test-only injected audit failure'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER reject_write BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION reject_test_write();
    `);
    await assert.rejects(
      recordOrderPickup(
        pool,
        row.id,
        { operationId: randomUUID(), expectedRevision: 3 },
        "operator:test",
      ),
      /Test-only injected audit failure/,
    );
    assert.deepEqual(await stock(), beforeStock);
    assert.deepEqual(await getAdminOrder(pool, row.id), beforeOrder);
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM inventory_movements",
        )
      ).rows[0].count,
      0,
    );
    assert.equal(
      (await pool.query("SELECT count(*)::int AS count FROM admin_operations"))
        .rows[0].count,
      0,
    );
    await pool.query(
      `DROP TRIGGER reject_write ON ${table}; DROP FUNCTION reject_test_write()`,
    );
  }
});

test("bounded reconciliation visits later orders without changing uncertain holds or snapshots", async () => {
  const uncertain = await reserveCheckout(pool, intent(), "pickup");
  await markCheckoutReconciliation(
    pool,
    uncertain.id,
    "Unknown provider session.",
  );
  const opened = await open();
  const later = await open();
  const beforeStock = await stock();
  const before = await Promise.all(
    [uncertain, opened, later].map((order) =>
      getCheckoutReservation(pool, order.id),
    ),
  );
  const first = await listPendingCheckoutReservations(pool, 2);
  assert.deepEqual(
    new Set(first.map((order) => order.id)),
    new Set([uncertain.id, opened.id]),
  );
  const second = await listPendingCheckoutReservations(pool, 2);
  assert(second.some((order) => order.id === later.id));
  assert.deepEqual(await stock(), beforeStock);
  assert.deepEqual(
    await Promise.all(
      [uncertain, opened, later].map((order) =>
        getCheckoutReservation(pool, order.id),
      ),
    ),
    before,
  );
});

test("admin and reconciliation lists are bounded safe DTOs with null lifecycle fields and no provider/customer fields", async () => {
  const creating = await reserveCheckout(pool, intent(), "pickup");
  const opened = await open();
  const quarantined = await reserveCheckout(pool, intent(), "pickup");
  await markCheckoutReconciliation(
    pool,
    quarantined.id,
    "Uncertain create response.",
  );
  const paid = await open();
  await applyCheckoutPayment(pool, payment(paid));
  assert.equal((await listPendingCheckoutReservations(pool, 2)).length, 2);
  assert.deepEqual(
    new Set(
      (await listPendingCheckoutReservations(pool, 100)).map((row) => row.id),
    ),
    new Set([creating.id, opened.id, quarantined.id]),
  );
  const list = await listAdminOrders(pool, { limit: 2, offset: 1 });
  assert.equal(list.total, 4);
  assert.equal(list.orders.length, 2);
  const adminOrder = (await getAdminOrder(pool, creating.id))!;
  assert.equal(adminOrder.paidAt, null);
  assert.equal(adminOrder.pickedUpAt, null);
  assert.equal(adminOrder.reconciliationReason, null);
  assert.deepEqual(
    Object.keys(adminOrder).sort(),
    [
      "id",
      "state",
      "locationKey",
      "totalMinor",
      "currency",
      "revision",
      "createdAt",
      "paidAt",
      "pickedUpAt",
      "reconciliationReason",
      "lines",
    ].sort(),
  );
  assert.equal(await getAdminOrder(pool, randomUUID()), null);
  assert.equal(await getCheckoutReservation(pool, randomUUID()), null);
  await assert.rejects(getAdminOrder(pool, "not-a-uuid"), OrderInputError);
  await assert.rejects(
    markCheckoutReconciliation(pool, randomUUID(), "Missing order."),
    OrderNotFoundError,
  );
  await assert.rejects(listAdminOrders(pool, { limit: 101 }), OrderInputError);
  await assert.rejects(
    listAdminOrders(pool, { offset: 10001 }),
    OrderInputError,
  );
  await assert.rejects(
    listPendingCheckoutReservations(pool, 101),
    OrderInputError,
  );
});
