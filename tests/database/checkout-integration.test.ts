import assert from "node:assert/strict";
import test, { after, afterEach, beforeEach } from "node:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import Stripe from "stripe";
import { databaseOptions } from "../../src/server/db/connection.mjs";
import { migrateDatabase } from "../../scripts/migrate.mjs";
import * as orders from "../../src/server/commerce/orders.ts";
import {
  createCheckoutServices,
  STRIPE_API_VERSION,
  type CheckoutProvider,
} from "../../src/server/commerce/stripe.ts";
import { createCheckoutHandler } from "../../src/pages/api/checkout.ts";
import { readJsonBody } from "../../src/server/http-input.ts";

const connection = process.env["TEST_DATABASE_URL"];
assert(connection, "Use the isolated true_hive_test database.");
assert.equal(new URL(connection).pathname, "/true_hive_test");
const options = databaseOptions(connection, "disable");
const admin = new Pool({ ...options, max: 1 });
let pool: Pool;
let schema: string;
const config = {
  mode: "stripe-test" as const,
  locationKey: "test-pickup",
  siteOrigin: "https://shop.example.test",
  secretKey: "sk_test_offlineFixture",
  webhookSecret: "whsec_offlineFixture",
};
const sdk = new Stripe(config.secretKey, { apiVersion: STRIPE_API_VERSION });

beforeEach(async () => {
  schema = `checkout_pair_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  pool = new Pool({ ...options, options: `-c search_path=${schema}` });
  await migrateDatabase(pool);
  await pool.query(`
    INSERT INTO products(product_key,slug,title,summary,category,image_key,kind,published)
      VALUES ('test-soap','test-soap','Soap','Test-only merchandise','soap','soap','active',true);
    INSERT INTO product_variants(variant_key,product_key,sku,label,price_minor)
      VALUES ('test-bar','test-soap','TEST-BAR','Unscented',750);
    INSERT INTO inventory_locations(location_key,name,active,pickup_enabled)
      VALUES ('test-pickup','Test-only pickup',true,true);
    INSERT INTO inventory_levels(variant_key,location_key,on_hand)
      VALUES ('test-bar','test-pickup',10);
  `);
});

afterEach(async () => {
  await pool?.end();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
});

after(async () => {
  await admin.end();
});

function intent() {
  return {
    operationId: randomUUID(),
    lines: [{ variantKey: "test-bar", quantity: 1 }],
  };
}

function provider(dropFirstResponse = false) {
  const sessions = new Map<string, Stripe.Checkout.Session>();
  const attempts: string[] = [];
  let drop = dropFirstResponse;
  const implementation: CheckoutProvider = {
    webhooks: sdk.webhooks,
    checkout: {
      sessions: {
        async create(input, request) {
          assert(request.idempotencyKey);
          attempts.push(JSON.stringify(input));
          let stored = sessions.get(request.idempotencyKey);
          if (!stored) {
            const order = await orders.getCheckoutReservation(
              pool,
              request.idempotencyKey,
            );
            assert(order);
            const id = `cs_test_${order.id.replaceAll("-", "")}`;
            stored = {
              id,
              object: "checkout.session",
              mode: "payment",
              livemode: false,
              status: "open",
              payment_status: "unpaid",
              allowed_payment_method_types: ["card"],
              payment_method_types: ["card"],
              currency: "usd",
              amount_subtotal: order.totalMinor,
              amount_total: order.totalMinor,
              total_details: {
                amount_discount: 0,
                amount_tax: 0,
                amount_shipping: 0,
              },
              client_reference_id: order.id,
              metadata: { app: "the-true-hive", orderId: order.id },
              expires_at: input.expires_at,
              url: `https://checkout.stripe.com/c/pay/${id}`,
              line_items: {
                object: "list",
                has_more: false,
                url: `/v1/checkout/sessions/${id}/line_items`,
                data: order.lines.map((line) => ({
                  id: `li_${line.variantKey}`,
                  object: "item",
                  currency: "usd",
                  quantity: line.quantity,
                  amount_subtotal: line.quantity * line.priceMinor,
                  amount_total: line.quantity * line.priceMinor,
                  amount_discount: 0,
                  amount_tax: 0,
                  price: {
                    id: `price_${line.variantKey}`,
                    object: "price",
                    livemode: false,
                    currency: "usd",
                    unit_amount: line.priceMinor,
                    type: "one_time",
                    billing_scheme: "per_unit",
                    product: {
                      id: `prod_${line.variantKey}`,
                      object: "product",
                      livemode: false,
                      name: `${line.title} — ${line.label}`,
                      metadata: {
                        app: "the-true-hive",
                        variantKey: line.variantKey,
                      },
                    },
                  },
                })),
              },
            } as unknown as Stripe.Checkout.Session;
            sessions.set(request.idempotencyKey, stored);
          }
          if (drop) {
            drop = false;
            throw new Error("Test-only lost provider response");
          }
          return structuredClone(stored);
        },
        async retrieve(id) {
          const session = [...sessions.values()].find(
            (value) => value.id === id,
          );
          assert(session);
          return structuredClone(session);
        },
        async listLineItems(id) {
          const session = [...sessions.values()].find(
            (value) => value.id === id,
          );
          assert(session?.line_items);
          return structuredClone(session.line_items);
        },
        async expire(id) {
          const session = [...sessions.values()].find(
            (value) => value.id === id,
          );
          assert(session);
          session.status = "expired";
          return structuredClone(session);
        },
      },
    },
  };
  return {
    sessions,
    attempts,
    services: createCheckoutServices({
      config,
      pool,
      provider: implementation,
      persistence: orders,
      now: () => Date.now(),
    }),
  };
}

test("a lost create response retries the same provider intent without duplicating a hold or session", async () => {
  const input = intent();
  const fixture = provider(true);
  await assert.rejects(fixture.services.createCheckout(input));
  const retry = await fixture.services.createCheckout(input);
  const again = await fixture.services.createCheckout(input);
  assert.equal(retry.checkoutUrl, again.checkoutUrl);
  assert.equal(fixture.sessions.size, 1);
  assert.equal(fixture.attempts.length, 2);
  assert.equal(fixture.attempts[0], fixture.attempts[1]);
  assert.deepEqual(
    (await pool.query("SELECT on_hand,held,committed FROM inventory_levels"))
      .rows,
    [{ on_hand: 10, held: 1, committed: 0 }],
  );
  assert.equal(
    (await pool.query("SELECT count(*)::int AS n FROM orders")).rows[0].n,
    1,
  );
});

test("a signed expired session recovers a missing association after the original deadline", async (context) => {
  const input = intent();
  const fixture = provider(true);
  await assert.rejects(fixture.services.createCheckout(input));
  const session = fixture.sessions.get(input.operationId);
  assert(session);
  session.status = "expired";
  context.mock.timers.enable({ apis: ["Date"], now: Date.now() + 2 * 3600000 });
  const payload = JSON.stringify({
    id: "evt_testExpiredAssociation",
    object: "event",
    livemode: false,
    api_version: STRIPE_API_VERSION,
    type: "checkout.session.expired",
    data: { object: session },
  });
  const signature = sdk.webhooks.generateTestHeaderString({
    payload,
    secret: config.webhookSecret,
    timestamp: Math.floor(Date.now() / 1000),
  });
  const result = await fixture.services.handleWebhook(
    Buffer.from(payload),
    signature,
  );
  assert.equal(result.result, "expired");
  assert.deepEqual(
    (await pool.query("SELECT on_hand,held,committed FROM inventory_levels"))
      .rows,
    [{ on_hand: 10, held: 0, committed: 0 }],
  );
});

test("real stock conflicts reach the public checkout as conflicts, not uncertain outages", async () => {
  await pool.query("UPDATE inventory_levels SET on_hand=0");
  const fixture = provider();
  const handler = createCheckoutHandler({
    getConfig: () => config,
    readJsonBody,
    getServices: async () => fixture.services,
    allowAttempt: () => true,
  });

  const response = await handler(
    new Request(`${config.siteOrigin}/api/checkout`, {
      method: "POST",
      headers: {
        Origin: config.siteOrigin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(intent()),
    }),
  );
  assert.equal(response.status, 409);
  assert.equal(fixture.attempts.length, 0);
  assert.equal(
    (await pool.query("SELECT count(*)::int AS n FROM orders")).rows[0].n,
    0,
  );
});

test("unsupported test-payment totals are rejected before stock holds or provider calls", async () => {
  for (const price of [49, 100000000]) {
    await pool.query("UPDATE product_variants SET price_minor=$1", [price]);
    const fixture = provider();
    await assert.rejects(fixture.services.createCheckout(intent()));
    assert.equal(fixture.attempts.length, 0);
    assert.deepEqual(
      (await pool.query("SELECT held,committed FROM inventory_levels")).rows,
      [{ held: 0, committed: 0 }],
    );
    assert.equal(
      (await pool.query("SELECT count(*)::int AS n FROM orders")).rows[0].n,
      0,
    );
  }
});

test("supported full-length merchandise labels do not create poisoned checkout holds", async () => {
  await pool.query("UPDATE products SET title=$1", ["S".repeat(160)]);
  await pool.query("UPDATE product_variants SET label=$1", ["B".repeat(160)]);
  const fixture = provider();
  const result = await fixture.services.createCheckout(intent());
  assert.match(
    result.checkoutUrl,
    /^https:\/\/checkout\.stripe\.com\/c\/pay\//,
  );
  assert.equal(fixture.sessions.size, 1);
  assert.deepEqual(
    (await pool.query("SELECT held,committed FROM inventory_levels")).rows,
    [{ held: 1, committed: 0 }],
  );
});
