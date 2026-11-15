import test from "node:test";
import assert from "node:assert/strict";
import { createCartCheckout } from "../../src/client/cart-checkout.ts";

const pendingKey = "true-hive-checkout-pending";
const operation = (number = 1) =>
  `10000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const selection = [
  { variantKey: "soap-bar", quantity: 2 },
  { variantKey: "honey-jar", quantity: 1 },
];

function storedIntent() {
  const values = new Map<string, string>([
    [
      pendingKey,
      JSON.stringify({
        version: 1,
        operationId: operation(),
        lines: selection,
      }),
    ],
  ]);
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

function acknowledgment(outcome = "released") {
  return {
    terminal: {
      operationId: operation(),
      lines: structuredClone(selection),
      outcome,
    },
  };
}

test("authoritative settled/released replay clears only the pending intent without redirect or a fresh payment", async () => {
  for (const outcome of ["settled", "released"]) {
    const storage = storedIntent();
    const messages: string[] = [];
    const savedCart = JSON.stringify({ version: 1, lines: selection });
    storage.setItem("true-hive-cart", savedCart);
    let ids = 0;
    let requests = 0;
    let navigated = false;
    const response = acknowledgment(outcome);
    response.terminal.lines.reverse();
    const checkout = createCartCheckout({
      pendingStorage: () => storage,
      operationId: () => operation(++ids + 1),
      onState: (_phase, message) => messages.push(message),
      navigate() {
        navigated = true;
      },
      async request(body) {
        requests++;
        assert.deepEqual(JSON.parse(body), {
          operationId: operation(),
          lines: selection,
        });
        return new Response(JSON.stringify(response));
      },
    });
    await checkout.retry();
    assert.equal(checkout.phase, "idle", outcome);
    assert.equal(storage.getItem(pendingKey), null);
    assert.equal(checkout.hasPendingIntent, false);
    assert.equal(ids, 0);
    assert.equal(requests, 1);
    assert.equal(
      storage.getItem("true-hive-cart"),
      savedCart,
      "cart must not be cleared or reduced",
    );
    assert.equal(navigated, false);
    assert.match(
      messages.at(-1)!,
      outcome === "settled" ? /already settled/i : /hold.*released/i,
    );
    assert.match(messages.at(-1)!, /cart.*not.*clear/i);
  }
});

test("tampered, ambiguous and unknown terminal acknowledgments keep the frozen intent locked", async () => {
  const valid = acknowledgment();
  for (const result of [
    { terminal: { ...valid.terminal, operationId: operation(2) } },
    {
      terminal: {
        ...valid.terminal,
        lines: [{ variantKey: "soap-bar", quantity: 3 }, selection[1]],
      },
    },
    { terminal: { ...valid.terminal, lines: [selection[0]] } },
    { terminal: { ...valid.terminal, lines: [selection[0], selection[0]] } },
    {
      terminal: {
        ...valid.terminal,
        lines: [{ ...selection[0], priceMinor: 1 }, selection[1]],
      },
    },
    { terminal: { ...valid.terminal, outcome: "paid" } },
    { terminal: { ...valid.terminal, outcome: "reconciliation_required" } },
    { terminal: { ...valid.terminal, state: "expired" } },
    {
      ...valid,
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_fixture",
    },
    { terminal: true },
    { status: "expired", operationId: operation() },
  ]) {
    const storage = storedIntent();
    const original = storage.getItem(pendingKey);
    let ids = 0;
    let navigated = false;
    const checkout = createCartCheckout({
      pendingStorage: () => storage,
      operationId: () => operation(++ids + 1),
      onState() {},
      navigate() {
        navigated = true;
      },
      async request() {
        return new Response(JSON.stringify(result));
      },
    });
    await checkout.retry();
    assert.equal(checkout.phase, "uncertain");
    assert.equal(storage.getItem(pendingKey), original);
    assert.equal(navigated, false);
    await checkout.start(selection);
    assert.equal(ids, 0);
  }
});

test("nonterminal HTTP status cannot authorize cleanup even with a matching acknowledgment", async () => {
  for (const status of [202, 409, 503]) {
    const storage = storedIntent();
    const original = storage.getItem(pendingKey);
    const checkout = createCartCheckout({
      pendingStorage: () => storage,
      operationId: () => {
        assert.fail("Must not replace a retained intent");
      },
      onState() {},
      navigate() {
        assert.fail("Must not navigate");
      },
      async request() {
        return new Response(JSON.stringify(acknowledgment()), { status });
      },
    });
    await checkout.retry();
    assert.equal(checkout.phase, "uncertain");
    assert.equal(storage.getItem(pendingKey), original);
  }
});

test("terminal cleanup failure preserves the token and blocks replacement until matching cleanup can be verified", async () => {
  const storage = storedIntent();
  const original = storage.getItem(pendingKey);
  let blocked = true;
  const checkout = createCartCheckout({
    pendingStorage: () => ({
      ...storage,
      removeItem(key) {
        if (blocked) throw new Error("Removal denied");
        storage.removeItem(key);
      },
    }),
    operationId: () => {
      assert.fail("No replacement before verified cleanup");
    },
    onState() {},
    navigate() {
      assert.fail("No redirect for terminal acknowledgment");
    },
    async request() {
      return new Response(JSON.stringify(acknowledgment()));
    },
  });
  await checkout.retry();
  assert.equal(checkout.phase, "blocked");
  assert.equal(storage.getItem(pendingKey), original);
  await checkout.start(selection);
  blocked = false;
  await checkout.retry();
  assert.equal(checkout.phase, "idle");
  assert.equal(storage.getItem(pendingKey), null);
});

test("confirmed release allows a subsequent explicit fresh checkout but never starts one automatically", async () => {
  const storage = storedIntent();
  let ids = 1;
  const bodies: string[] = [];
  let redirected = 0;
  const checkout = createCartCheckout({
    pendingStorage: () => storage,
    operationId: () => operation(++ids),
    onState() {},
    navigate() {
      redirected++;
    },
    async request(body) {
      bodies.push(body);
      if (bodies.length === 1)
        return new Response(JSON.stringify(acknowledgment()));
      if (bodies.length === 2)
        return new Response('{"error":{"message":"Invalid input"}}', {
          status: 400,
        });
      return new Response(
        JSON.stringify({
          checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_fixture",
        }),
      );
    },
  });
  await checkout.retry();
  assert.equal(checkout.phase, "idle");
  assert.equal(ids, 1);
  assert.equal(bodies.length, 1);
  assert.equal(redirected, 0);
  await checkout.start(selection);
  assert.equal(ids, 2);
  assert.equal(
    checkout.phase,
    "idle",
    "a fresh definitive rejection must not inherit the old uncertainty",
  );
  assert.equal(JSON.parse(bodies[1]!).operationId, operation(2));
  await checkout.start(selection);
  assert.equal(ids, 3);
  assert.equal(checkout.phase, "redirecting");
  assert.equal(redirected, 1);
  assert.equal(JSON.parse(bodies[2]!).operationId, operation(3));
});
