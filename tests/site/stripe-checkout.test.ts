import test from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import type { Pool } from "pg";
import type {
  CheckoutReservation,
  CheckoutPayment,
  CheckoutExpiry,
} from "../../src/domain/commerce.ts";
import {
  createCheckoutServices,
  type CheckoutPersistence,
  type CheckoutProvider,
} from "../../src/server/commerce/stripe.ts";
import type { StripeTestConfig } from "../../src/server/commerce/config.ts";
import {
  createCheckoutAttemptLimiter,
  createCheckoutHandler,
} from "../../src/pages/api/checkout.ts";
import { createStripeWebhookHandler } from "../../src/pages/api/webhooks/stripe.ts";
import { runCheckoutReconciliation } from "../../scripts/reconcile-checkout.mjs";

const clock = 1_900_000_000_000;
const orderId = "c995d058-17dc-46b6-9c63-0984c9dc3f17";
const sessionId = "cs_test_offlineFixture";
const config: StripeTestConfig = {
  mode: "stripe-test",
  locationKey: "pickup-main",
  siteOrigin: "https://shop.example",
  secretKey: "sk_test_offlineFixture",
  webhookSecret: "whsec_offlineFixture",
};
const sdk = new Stripe(config.secretKey, {
  timeout: 5_000,
  maxNetworkRetries: 1,
});
const intent = {
  operationId: orderId,
  lines: [{ variantKey: "soap-bar", quantity: 2 }],
};

function reservation(): CheckoutReservation {
  return {
    id: orderId,
    state: "creating",
    locationKey: config.locationKey,
    currency: "USD",
    totalMinor: 1500,
    lines: [
      {
        variantKey: "soap-bar",
        title: "Soap",
        label: "Unscented",
        quantity: 2,
        priceMinor: 750,
      },
    ],
    checkoutSessionId: null,
    checkoutExpiresAt: new Date(clock + 3_600_000).toISOString(),
    requestHash: "immutable-request-hash",
    createdAt: new Date(clock).toISOString(),
  };
}

function session(): Stripe.Checkout.Session {
  return {
    id: sessionId,
    object: "checkout.session",
    livemode: false,
    mode: "payment",
    status: "open",
    payment_status: "unpaid",
    payment_method_types: ["card"],
    payment_intent: "pi_offlineFixture",
    currency: "usd",
    amount_subtotal: 1500,
    amount_total: 1500,
    total_details: { amount_tax: 0, amount_discount: 0, amount_shipping: 0 },
    metadata: { app: "the-true-hive", orderId },
    client_reference_id: orderId,
    expires_at: Math.floor((clock + 3_600_000) / 1000),
    url: "https://checkout.stripe.com/c/pay/cs_test_offlineFixture",
    line_items: {
      object: "list",
      has_more: false,
      url: "/v1/checkout/sessions/offline/line_items",
      data: [
        {
          id: "li_offline",
          object: "item",
          currency: "usd",
          quantity: 2,
          amount_subtotal: 1500,
          amount_total: 1500,
          amount_tax: 0,
          amount_discount: 0,
          price: {
            id: "price_offline",
            object: "price",
            livemode: false,
            currency: "usd",
            unit_amount: 750,
            type: "one_time",
            billing_scheme: "per_unit",
            product: {
              id: "prod_offline",
              object: "product",
              livemode: false,
              name: "Soap — Unscented",
              metadata: { app: "the-true-hive", variantKey: "soap-bar" },
            },
          },
        },
      ],
    },
  } as Stripe.Checkout.Session;
}

function harness() {
  const stored = reservation();
  const current = session();
  const effects: string[] = [];
  const payments: CheckoutPayment[] = [];
  const expiries: CheckoutExpiry[] = [];
  const creations: {
    input: Stripe.Checkout.SessionCreateParams;
    options: Stripe.RequestOptions;
  }[] = [];
  const persistence: CheckoutPersistence = {
    async reserveCheckout(_pool, input, location) {
      assert.deepEqual(input, intent);
      assert.equal(location, config.locationKey);
      effects.push("reserve");
      return structuredClone(stored);
    },
    async attachCheckoutSession(_pool, id, sid, expiry) {
      effects.push("attach");
      assert.equal(id, orderId);
      assert.equal(sid, sessionId);
      assert.equal(expiry, stored.checkoutExpiresAt);
      stored.checkoutSessionId = sid;
      stored.state = "open";
      return structuredClone(stored);
    },
    async getCheckoutReservation(_pool, id) {
      effects.push("get");
      assert.equal(id, orderId);
      return structuredClone(stored);
    },
    async applyCheckoutPayment(_pool, input) {
      effects.push("paid");
      payments.push(input);
      return stored.state === "expired" ? "reconciliation_required" : "paid";
    },
    async releaseExpiredCheckout(_pool, input) {
      effects.push("expired");
      expiries.push(input);
      return "expired";
    },
    async markCheckoutReconciliation(_pool, id, reason) {
      assert.equal(id, orderId);
      assert.match(reason, /^[a-z_]+$/);
      effects.push("quarantine");
      stored.state = "reconciliation_required";
    },
    async listPendingCheckoutReservations(_pool, limit) {
      assert(limit >= 1 && limit <= 100);
      effects.push("list");
      return [structuredClone(stored)];
    },
  };
  const provider: CheckoutProvider = {
    webhooks: sdk.webhooks,
    checkout: {
      sessions: {
        async create(input, options) {
          effects.push("create");
          creations.push({ input, options });
          return structuredClone(current);
        },
        async retrieve(id, input) {
          effects.push("retrieve");
          assert.equal(id, sessionId);
          assert.deepEqual(input.expand, ["line_items.data.price.product"]);
          return structuredClone(current);
        },
        async listLineItems(id, input) {
          effects.push("lines");
          assert.equal(id, sessionId);
          assert.equal(input.limit, 100);
          return structuredClone(session().line_items!);
        },
        async expire(id) {
          effects.push("provider-expire");
          assert.equal(id, sessionId);
          current.status = "expired";
          return structuredClone(current);
        },
      },
    },
  };
  const services = createCheckoutServices({
    config,
    pool: {} as Pool,
    provider,
    persistence,
    now: () => clock,
  });
  function webhook(
    type = "checkout.session.completed",
    changes: Record<string, unknown> = {},
    secret = config.webhookSecret,
    timestamp = clock / 1000,
  ) {
    const payload = JSON.stringify({
      id: "evt_offlineFixture",
      object: "event",
      api_version: sdk.getApiField("version"),
      type,
      livemode: false,
      data: { object: session() },
      ...changes,
    });
    const signature = sdk.webhooks.generateTestHeaderString({
      payload,
      secret,
      timestamp,
    });
    return services.handleWebhook(Buffer.from(payload), signature);
  }
  return {
    stored,
    current,
    effects,
    payments,
    expiries,
    creations,
    persistence,
    provider,
    services,
    webhook,
  };
}

test("real SDK rejects wrong/stale signatures before any persistence/provider effects", async () => {
  for (const options of [
    { secret: "whsec_wrong" },
    { timestamp: clock / 1000 - 301 },
  ]) {
    const h = harness();
    await assert.rejects(
      h.webhook(undefined, {}, options.secret, options.timestamp),
      /signature/i,
    );
    assert.deepEqual(h.effects, []);
  }
});

test("reserve precedes card-only creation using immutable prices, stable identity and stored expiry", async () => {
  const h = harness();
  assert.deepEqual(await h.services.createCheckout(intent), {
    checkoutUrl: h.current.url,
  });
  assert.deepEqual(h.effects.slice(0, 3), ["reserve", "create", "attach"]);
  const { input, options } = h.creations[0]!;
  assert.equal(options.idempotencyKey, orderId);
  assert.deepEqual(input.payment_method_types, ["card"]);
  assert.equal(
    input.expires_at,
    Math.floor(Date.parse(h.stored.checkoutExpiresAt) / 1000),
  );
  assert.deepEqual(input.metadata, { app: "the-true-hive", orderId });
  assert.equal(input.success_url, "https://shop.example/checkout/return");
  assert.equal(input.cancel_url, "https://shop.example/checkout/cancel");
  assert.equal(input.line_items![0]!.price_data!.unit_amount, 750);
  assert.equal(input.line_items![0]!.quantity, 2);
  await h.services.createCheckout(intent);
  assert.equal(h.creations.length, 1);
});

test("invalid intents cannot reserve inventory", async () => {
  for (const input of [
    { ...intent, operationId: "not-uuid" },
    { ...intent, totalMinor: 1 },
    { ...intent, lines: [] },
    { ...intent, lines: [...intent.lines, ...intent.lines] },
    { ...intent, lines: [{ variantKey: "../private", quantity: 1 }] },
    { ...intent, lines: [{ variantKey: "soap-bar", quantity: 0 }] },
    { ...intent, lines: [{ variantKey: "soap-bar", quantity: 101 }] },
    { ...intent, lines: [{ variantKey: "soap-bar", quantity: 1.5 }] },
    {
      ...intent,
      lines: [{ variantKey: "soap-bar", quantity: 1, priceMinor: 1 }],
    },
    {
      ...intent,
      lines: Array.from({ length: 21 }, (_, n) => ({
        variantKey: `soap-${n}`,
        quantity: 1,
      })),
    },
  ]) {
    const h = harness();
    await assert.rejects(h.services.createCheckout(input));
    assert.deepEqual(h.effects, []);
  }
});

test("uncertain create keeps/quarantines the hold and does not invent a retry order/session", async () => {
  const h = harness();
  h.provider.checkout.sessions.create = async (input, options) => {
    h.effects.push("create");
    h.creations.push({ input, options });
    throw new Error("private-provider-timeout");
  };
  await assert.rejects(h.services.createCheckout(intent), /unavailable/i);
  assert.deepEqual(h.effects, ["reserve", "create", "quarantine"]);
  assert.equal(h.creations[0]!.options.idempotencyKey, orderId);
  await assert.rejects(h.services.createCheckout(intent));
  assert.equal(h.creations.length, 1);
  assert.equal(h.expiries.length, 0);
});

test("uncertain attach retains the hold; a failed quarantine still retries the original provider key", async () => {
  const h = harness();
  h.persistence.attachCheckoutSession = async () => {
    h.effects.push("attach");
    throw new Error("private-db-timeout");
  };
  h.persistence.markCheckoutReconciliation = async () => {
    h.effects.push("quarantine");
    throw new Error("private-db-outage");
  };
  await assert.rejects(h.services.createCheckout(intent));
  await assert.rejects(h.services.createCheckout(intent));
  assert.equal(h.creations.length, 2);
  assert(
    h.creations.every(({ options }) => options.idempotencyKey === orderId),
  );
  assert(
    h.creations.every(({ input }) => input.expires_at === h.current.expires_at),
  );
  assert.equal(h.expiries.length, 0);
});

test("stored expiry inside provider minimum is quarantined, never extended or locally released", async () => {
  const h = harness();
  h.stored.checkoutExpiresAt = new Date(clock + 1_800_000).toISOString();
  await assert.rejects(h.services.createCheckout(intent));
  assert.deepEqual(h.effects, ["reserve", "quarantine"]);
  assert.equal(h.expiries.length, 0);
});

test("terminal orders and completed/expired sessions cannot start a second payment", async () => {
  for (const state of [
    "paid",
    "picked_up",
    "expired",
    "reconciliation_required",
  ] as const) {
    const h = harness();
    h.stored.state = state;
    await assert.rejects(h.services.createCheckout(intent));
    assert.equal(h.creations.length, 0);
  }
  for (const status of ["complete", "expired"] as const) {
    const h = harness();
    h.stored.checkoutSessionId = sessionId;
    h.stored.state = "open";
    h.current.status = status;
    await assert.rejects(h.services.createCheckout(intent));
    assert.equal(h.creations.length, 0);
  }
});

test("unsafe or live hosted session responses never escape as checkout redirects", async () => {
  for (const change of [
    { url: "https://checkout.stripe.com.attacker.example/c/pay/foo" },
    { url: "http://checkout.stripe.com/c/pay/foo" },
    { url: "https://name:password@checkout.stripe.com/c/pay/foo" },
    { url: "javascript:alert(1)" },
    { livemode: true },
    { expires_at: Math.floor(clock / 1000 + 7200) },
  ]) {
    const h = harness();
    Object.assign(h.current, change);
    await assert.rejects(h.services.createCheckout(intent));
    assert(h.effects.includes("quarantine"));
    assert.equal(h.expiries.length, 0);
  }
});

test("verified completed event freshly retrieves associated session before durable payment", async () => {
  const h = harness();
  h.stored.checkoutSessionId = sessionId;
  h.stored.state = "open";
  h.current.status = "complete";
  h.current.payment_status = "paid";
  assert.deepEqual(await h.webhook(), { result: "paid" });
  assert.deepEqual(h.effects, ["get", "retrieve", "paid"]);
  assert.deepEqual(h.payments, [
    {
      eventId: "evt_offlineFixture",
      orderId,
      sessionId,
      paymentIntentId: "pi_offlineFixture",
      totalMinor: 1500,
      currency: "USD",
    },
  ]);
  await h.webhook(undefined, { id: "evt_distinctSuccess" });
  assert.equal(h.payments.length, 2);
  assert.equal(h.payments[1]!.eventId, "evt_distinctSuccess");
});

test("mode/account/version/object association mismatches are durably quarantined, not paid", async () => {
  for (const change of [
    { livemode: true },
    { account: "acct_unexpected" },
    { context: "acct_unexpected" },
    { api_version: "2020-08-27" },
    { data: { object: { ...session(), id: "cs_test_unrelated" } } },
    { data: { object: { ...session(), object: "payment_intent" } } },
  ]) {
    const h = harness();
    h.stored.checkoutSessionId = sessionId;
    h.current.status = "complete";
    h.current.payment_status = "paid";
    assert.deepEqual(await h.webhook(undefined, change), {
      result: "reconciliation_required",
    });
    assert(h.effects.includes("quarantine"));
    assert.equal(h.payments.length, 0);
    assert.equal(h.expiries.length, 0);
  }
});

test("fresh session/amount/currency/line snapshots must agree exactly with the persisted order", async () => {
  for (const change of [
    (s: Stripe.Checkout.Session) => {
      s.livemode = true;
    },
    (s: Stripe.Checkout.Session) => {
      s.id = "cs_test_unrelated";
    },
    (s: Stripe.Checkout.Session) => {
      s.metadata = { app: "other", orderId };
    },
    (s: Stripe.Checkout.Session) => {
      s.client_reference_id = "unrelated";
    },
    (s: Stripe.Checkout.Session) => {
      s.amount_total = 1499;
    },
    (s: Stripe.Checkout.Session) => {
      s.currency = "eur";
    },
    (s: Stripe.Checkout.Session) => {
      s.line_items!.data[0]!.quantity = 1;
    },
    (s: Stripe.Checkout.Session) => {
      s.line_items!.data[0]!.price!.unit_amount = 749;
    },
    (s: Stripe.Checkout.Session) => {
      s.payment_method_types = ["us_bank_account"];
    },
    (s: Stripe.Checkout.Session) => {
      s.line_items!.data[0]!.price!.product = "prod_not_expanded";
    },
  ]) {
    const h = harness();
    h.stored.checkoutSessionId = sessionId;
    h.current.status = "complete";
    h.current.payment_status = "paid";
    change(h.current);
    assert.deepEqual(await h.webhook(), { result: "reconciliation_required" });
    assert.equal(h.payments.length, 0);
    assert.equal(h.expiries.length, 0);
  }
});

test("completed but unpaid and open-overdue sessions are not payment or expiry proof", async () => {
  for (const status of ["complete", "open"] as const) {
    const h = harness();
    h.stored.checkoutSessionId = sessionId;
    h.current.status = status;
    await h.webhook("checkout.session.expired");
    assert.equal(h.payments.length, 0);
    assert.equal(h.expiries.length, 0);
    assert(h.effects.includes("quarantine"));
  }
});

test("only freshly confirmed expired AND unpaid sessions release through the core", async () => {
  const h = harness();
  h.stored.checkoutSessionId = sessionId;
  h.current.status = "expired";
  assert.deepEqual(await h.webhook("checkout.session.expired"), {
    result: "expired",
  });
  assert.deepEqual(h.effects, ["get", "retrieve", "expired"]);
  assert.equal(h.expiries[0]!.sessionId, sessionId);
  const paidExpired = harness();
  paidExpired.stored.checkoutSessionId = sessionId;
  paidExpired.current.status = "expired";
  paidExpired.current.payment_status = "paid";
  assert.deepEqual(await paidExpired.webhook("checkout.session.expired"), {
    result: "reconciliation_required",
  });
  assert.equal(paidExpired.expiries.length, 0);
});

test("late paid sessions after release defer to core reconciliation, never allocate again", async () => {
  const h = harness();
  h.stored.checkoutSessionId = sessionId;
  h.stored.state = "expired";
  h.current.status = "complete";
  h.current.payment_status = "paid";
  assert.deepEqual(await h.webhook(), { result: "reconciliation_required" });
  assert.equal(h.creations.length, 0);
  assert.equal(h.expiries.length, 0);
  assert.equal(h.payments.length, 1);
});

test("unsupported asynchronous/refund events never change payment or stock", async () => {
  for (const type of [
    "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed",
    "charge.refunded",
  ]) {
    const h = harness();
    assert.deepEqual(await h.webhook(type), { result: "ignored" });
    assert.deepEqual(h.effects, []);
  }
});

test("provider/DB failures are retryable and cannot be acknowledged as durable processing", async () => {
  for (const failure of ["retrieve", "payment", "quarantine"] as const) {
    const h = harness();
    h.stored.checkoutSessionId = sessionId;
    h.current.status = "complete";
    h.current.payment_status = "paid";
    if (failure === "retrieve") {
      h.provider.checkout.sessions.retrieve = async () => {
        throw new Error("private-provider-error");
      };
    } else if (failure === "payment") {
      h.persistence.applyCheckoutPayment = async () => {
        throw new Error("private-db-error");
      };
    } else {
      h.current.amount_total = 1;
      h.persistence.markCheckoutReconciliation = async () => {
        throw new Error("private-db-error");
      };
    }
    await assert.rejects(h.webhook(), /unavailable/i);
  }
});

test("fresh retrieval paginates bounded line items instead of trusting a truncated list", async () => {
  const h = harness();
  h.stored.checkoutSessionId = sessionId;
  h.current.status = "complete";
  h.current.payment_status = "paid";
  h.current.line_items!.has_more = true;
  h.current.line_items!.data = [];
  assert.deepEqual(await h.webhook(), { result: "paid" });
  assert(h.effects.includes("lines"));
});

test("malformed authoritative merchandise associations are durably quarantined", async () => {
  for (const change of [
    (s: Stripe.Checkout.Session) => {
      delete (s.line_items!.data[0]!.price!.product as Partial<Stripe.Product>)
        .metadata;
    },
    (s: Stripe.Checkout.Session) => {
      delete (s.line_items as Partial<Stripe.ApiList<Stripe.LineItem>>).data;
    },
  ]) {
    const h = harness();
    h.stored.checkoutSessionId = sessionId;
    h.current.status = "complete";
    h.current.payment_status = "paid";
    change(h.current);
    assert.deepEqual(await h.webhook(), { result: "reconciliation_required" });
    assert.equal(h.payments.length, 0);
    assert.equal(h.expiries.length, 0);
  }
});

test("live unsupported events are rejected rather than accepted as a test-mode delivery", async () => {
  const h = harness();
  await assert.rejects(h.webhook("charge.refunded", { livemode: true }));
  assert.deepEqual(h.effects, []);
});

test("reconciliation keeps unknown sessions flagged without guessing release", async () => {
  const h = harness();
  const summary = await h.services.reconcilePending(10);
  assert.equal(summary.quarantined, 1);
  assert.deepEqual(h.effects, ["list", "quarantine"]);
  assert.equal(h.expiries.length, 0);
});

test("reconciliation expires overdue open sessions then re-fetches before releasing", async () => {
  const h = harness();
  h.stored.checkoutSessionId = sessionId;
  h.stored.checkoutExpiresAt = new Date(clock - 1000).toISOString();
  h.current.expires_at = Math.floor(
    Date.parse(h.stored.checkoutExpiresAt) / 1000,
  );
  const summary = await h.services.reconcilePending(10);
  assert.equal(summary.settled, 1);
  assert.deepEqual(h.effects, [
    "list",
    "retrieve",
    "provider-expire",
    "retrieve",
    "expired",
  ]);
});

test("payment racing provider expiry is settled, not released", async () => {
  const h = harness();
  h.stored.checkoutSessionId = sessionId;
  h.stored.checkoutExpiresAt = new Date(clock - 1000).toISOString();
  h.current.expires_at = Math.floor(
    Date.parse(h.stored.checkoutExpiresAt) / 1000,
  );
  h.provider.checkout.sessions.expire = async () => {
    h.effects.push("provider-expire");
    h.current.status = "complete";
    h.current.payment_status = "paid";
    throw new Error("already complete");
  };
  const summary = await h.services.reconcilePending(10);
  assert.equal(summary.settled, 1);
  assert.equal(h.payments.length, 1);
  assert.equal(h.expiries.length, 0);
  assert.match(h.payments[0]!.eventId, /^reconcile_[a-f0-9]{64}$/);
});

test("public checkout enforces exact storefront/Origin and attempt budget before reading/reserving", async () => {
  const effects: string[] = [];
  const handler = createCheckoutHandler({
    getConfig: () => config,
    readJsonBody: async () => {
      effects.push("body");
      return intent;
    },
    getServices: async () => {
      effects.push("services");
      return harness().services;
    },
    allowAttempt: () => true,
  });
  for (const [url, origin] of [
    ["https://shop.example/api/checkout", ""],
    [
      "https://shop.example/api/checkout",
      "https://shop.example.attacker.example",
    ],
    ["https://inventory.example/api/checkout", config.siteOrigin],
  ]) {
    const response = await handler(
      new Request(url, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify(intent),
      }),
    );
    assert.equal(response.status, 403);
    assert.deepEqual(effects, []);
  }
  const blocked = createCheckoutHandler({
    getConfig: () => config,
    readJsonBody: async () => {
      effects.push("body");
      return intent;
    },
    getServices: async () => harness().services,
    allowAttempt: () => false,
  });
  assert.equal(
    (
      await blocked(
        new Request("https://shop.example/api/checkout", {
          method: "POST",
          headers: { Origin: config.siteOrigin },
          body: "{}",
        }),
      )
    ).status,
    429,
  );
  assert.deepEqual(effects, []);
});

test("attempt limiter is bounded without trusting forwarded identity and resets on its clock", () => {
  let now = clock;
  const allow = createCheckoutAttemptLimiter(() => now, 2, 1000);
  assert.equal(allow(), true);
  assert.equal(allow(), true);
  assert.equal(allow(), false);
  now += 1001;
  assert.equal(allow(), true);
});

test("checkout route uses bounded JSON and returns only checkoutUrl; errors cannot leak secrets", async () => {
  const h = harness();
  const handler = createCheckoutHandler({
    getConfig: () => config,
    allowAttempt: () => true,
    readJsonBody: async (request, max) => {
      assert.equal(max, 8192);
      return request.json();
    },
    getServices: async () => h.services,
  });
  const request = () =>
    new Request("https://shop.example/api/checkout", {
      method: "POST",
      headers: {
        Origin: config.siteOrigin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(intent),
    });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { checkoutUrl: h.current.url });
  h.persistence.reserveCheckout = async () => {
    throw new Error("sk_test_privateSentinel");
  };
  const failed = await handler(request());
  assert.equal(failed.status, 503);
  assert(!(await failed.text()).includes("privateSentinel"));
});

test("webhook route passes unparsed raw bytes with the stream bound and awaits durable handling", async () => {
  const h = harness();
  h.stored.checkoutSessionId = sessionId;
  h.current.status = "complete";
  h.current.payment_status = "paid";
  const payload = JSON.stringify({
    id: "evt_routeFixture",
    object: "event",
    api_version: sdk.getApiField("version"),
    type: "checkout.session.completed",
    livemode: false,
    data: { object: session() },
  });
  const signature = sdk.webhooks.generateTestHeaderString({
    payload,
    secret: config.webhookSecret,
    timestamp: clock / 1000,
  });
  const effects: string[] = [];
  const handler = createStripeWebhookHandler({
    getConfig: () => config,
    readRawBody: async (request, max) => {
      assert.equal(max, 262144);
      effects.push("raw");
      return new Uint8Array(await request.arrayBuffer());
    },
    getServices: async () => h.services,
  });
  const request = (sig: string) =>
    new Request("https://shop.example/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": sig, "Content-Type": "application/json" },
      body: payload,
    });
  const bad = await handler(request("invalid-signature"));
  assert.equal(bad.status, 400);
  assert.deepEqual(h.effects, []);
  h.persistence.applyCheckoutPayment = async () => {
    throw new Error("private-db-outage");
  };
  const outage = await handler(request(signature));
  assert.equal(outage.status, 503);
  assert.equal(h.expiries.length, 0);
  assert.deepEqual(effects, ["raw", "raw"]);
});

test("streamed oversized webhook bytes are rejected before SDK/persistence effects, not by JSON length", async () => {
  const h = harness();
  const bytes = new TextEncoder().encode("é".repeat(131073));
  const handler = createStripeWebhookHandler({
    getConfig: () => config,
    readRawBody: async (request) => new Uint8Array(await request.arrayBuffer()),
    getServices: async () => h.services,
  });
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.subarray(0, 130000));
      controller.enqueue(bytes.subarray(130000));
      controller.close();
    },
  });
  const request = new Request("https://shop.example/api/webhooks/stripe", {
    method: "POST",
    headers: {
      "stripe-signature": "unused",
      "Content-Type": "application/json",
    },
    body,
    duplex: "half",
  } as RequestInit);
  assert.equal((await handler(request)).status, 413);
  assert.deepEqual(h.effects, []);
});

test("CLI bounds private-environment batches and closes resources without IDs/keys in arguments", async () => {
  const environment = {
    CHECKOUT_MODE: "stripe-test",
    INVENTORY_ENABLED: "true",
    CATALOG_SOURCE: "database",
    DATABASE_URL: "postgresql://offline:offline@db.example/hive",
    ADMIN_DATABASE_URL: "postgresql://offline_writer:offline@db.example/hive",
    CHECKOUT_LOCATION_KEY: config.locationKey,
    SITE_URL: config.siteOrigin,
    STRIPE_SECRET_KEY: config.secretKey,
    STRIPE_WEBHOOK_SECRET: config.webhookSecret,
    RECONCILE_CHECKOUT_LIMIT: "10",
  };
  const effects: string[] = [];
  const summary = await runCheckoutReconciliation({
    environment,
    openRuntime: async () => ({
      services: {
        async reconcilePending(limit) {
          assert.equal(limit, 10);
          effects.push("batch");
          return {
            checked: 1,
            settled: 0,
            pending: 0,
            quarantined: 1,
            failed: 0,
          };
        },
      },
      async close() {
        effects.push("close");
      },
    }),
  });
  assert.equal(summary.quarantined, 1);
  assert.deepEqual(effects, ["batch", "close"]);
  await assert.rejects(
    runCheckoutReconciliation({
      environment: { ...environment, RECONCILE_CHECKOUT_LIMIT: "101" },
      openRuntime: async () => {
        assert.fail("invalid batch must not open dependencies");
      },
    }),
  );
});
