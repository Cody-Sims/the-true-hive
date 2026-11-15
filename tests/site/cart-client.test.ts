import test from "node:test";
import assert from "node:assert/strict";
import {
  readStoredCart,
  saveStoredCart,
} from "../../src/client/cart-storage.ts";
import {
  createCartCheckout,
  type CheckoutPhase,
} from "../../src/client/cart-checkout.ts";

test("denied reads and writes leave cart usable in memory without throwing", () => {
  const denied = () => {
    throw new Error("SecurityError");
  };
  assert.deepEqual(readStoredCart(denied), {
    lines: [],
    recovered: false,
    persistent: false,
  });
  assert.equal(
    saveStoredCart(denied, [{ variantKey: "soap-bar", quantity: 2 }]),
    false,
  );
  let saved = "";
  const storage = () => ({
    getItem: () =>
      '{"version":1,"lines":[{"variantKey":"soap-bar","quantity":2,"priceMinor":1}]}',
    setItem: (_key: string, value: string) => {
      saved = value;
    },
  });
  const result = readStoredCart(storage);
  assert.deepEqual(result.lines, [{ variantKey: "soap-bar", quantity: 2 }]);
  assert.equal(result.persistent, true);
  assert.equal(saveStoredCart(storage, result.lines), true);
  assert.deepEqual(JSON.parse(saved), {
    version: 1,
    lines: [{ variantKey: "soap-bar", quantity: 2 }],
  });
});

test("network, rate-limit, server and hold conflicts retry the exact multi-line intent", async () => {
  for (const status of [0, 429, 500, 503, 409]) {
    const bodies: string[] = [];
    const phases: CheckoutPhase[] = [];
    let ids = 0;
    let destination = "";
    const lines = [
      { variantKey: "soap-bar", quantity: 2 },
      { variantKey: "honey-jar", quantity: 1 },
    ];
    const checkout = createCartCheckout({
      operationId: () => `operation-${++ids}`,
      onState: (phase) => phases.push(phase),
      navigate: (url) => {
        destination = url;
      },
      async request(body) {
        bodies.push(body);
        if (bodies.length === 1) {
          if (status === 0) throw new Error("Connection interrupted");
          return new Response(
            JSON.stringify({ error: { message: "Uncertain" } }),
            { status },
          );
        }
        return new Response(
          JSON.stringify({
            checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_fixture",
          }),
        );
      },
    });
    await checkout.start(lines);
    assert.equal(checkout.phase, "uncertain", `status ${status}`);
    lines[0]!.quantity = 99;
    await checkout.start([{ variantKey: "replacement", quantity: 1 }]);
    assert.equal(
      bodies.length,
      1,
      "must not replace a potentially held intent",
    );
    await checkout.retry();
    assert.equal(checkout.phase, "redirecting");
    assert.equal(ids, 1);
    assert.equal(bodies[0], bodies[1]);
    assert.deepEqual(JSON.parse(bodies[1]!).lines, [
      { variantKey: "soap-bar", quantity: 2 },
      { variantKey: "honey-jar", quantity: 1 },
    ]);
    assert.equal(
      destination,
      "https://checkout.stripe.com/c/pay/cs_test_fixture",
    );
    assert.deepEqual(phases, [
      "pending",
      "uncertain",
      "pending",
      "redirecting",
    ]);
  }
});

test("unverified responses and unsafe checkout redirects retain the existing intent", async () => {
  for (const checkoutUrl of [
    "https://checkout.stripe.com.evil.example/pay",
    "https://user@checkout.stripe.com/pay",
    "http://checkout.stripe.com/pay",
    "javascript:alert(1)",
    null,
  ]) {
    let navigated = false;
    const checkout = createCartCheckout({
      operationId: () => "one-intent",
      onState() {},
      navigate() {
        navigated = true;
      },
      async request() {
        return new Response(JSON.stringify({ checkoutUrl }));
      },
    });
    await checkout.start([{ variantKey: "soap-bar", quantity: 1 }]);
    assert.equal(checkout.phase, "uncertain");
    assert.equal(navigated, false);
  }
});

test("a later rejection cannot erase an earlier uncertain hold", async () => {
  const bodies: string[] = [];
  let ids = 0;
  const checkout = createCartCheckout({
    operationId: () => `operation-${++ids}`,
    onState() {},
    navigate() {},
    async request(body) {
      bodies.push(body);
      if (bodies.length === 1)
        throw new Error("Response lost after reservation");
      return new Response('{"error":{"message":"Origin changed"}}', {
        status: 403,
      });
    },
  });
  await checkout.start([{ variantKey: "soap-bar", quantity: 1 }]);
  await checkout.retry();
  assert.equal(checkout.phase, "uncertain");
  await checkout.start([{ variantKey: "soap-pair", quantity: 1 }]);
  assert.equal(ids, 1);
  assert.equal(bodies[0], bodies[1]);
});

test("definitive invalid-input rejection allows correction while pending submissions cannot duplicate", async () => {
  let ids = 0;
  let finish: ((response: Response) => void) | undefined;
  const checkout = createCartCheckout({
    operationId: () => `operation-${++ids}`,
    onState() {},
    navigate() {},
    request: () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  });
  const pending = checkout.start([{ variantKey: "soap-bar", quantity: 1 }]);
  assert.equal(checkout.phase, "pending");
  await checkout.start([{ variantKey: "soap-bar", quantity: 2 }]);
  assert.equal(ids, 1);
  finish!(
    new Response('{"error":{"message":"Invalid input"}}', { status: 400 }),
  );
  await pending;
  assert.equal(checkout.phase, "idle");
  const corrected = checkout.start([{ variantKey: "soap-bar", quantity: 2 }]);
  assert.equal(ids, 2);
  finish!(
    new Response('{"error":{"message":"Invalid input"}}', { status: 400 }),
  );
  await corrected;
});
