import test from "node:test";
import assert from "node:assert/strict";
import {
  readStoredCart,
  saveStoredCart,
} from "../../src/client/cart-storage.ts";
import {
  createCartCheckout,
  type CheckoutPhase,
  type CheckoutClientOptions,
} from "../../src/client/cart-checkout.ts";

const operation = (number = 1) =>
  `10000000-0000-4000-8000-${String(number).padStart(12, "0")}`;

function session() {
  const values = new Map<string, string>();
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

function client(options: Omit<CheckoutClientOptions, "pendingStorage">) {
  const storage = session();
  return createCartCheckout({ ...options, pendingStorage: () => storage });
}

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
    const checkout = client({
      operationId: () => operation(++ids),
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
    const checkout = client({
      operationId: () => operation(),
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
  const checkout = client({
    operationId: () => operation(++ids),
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
  const checkout = client({
    operationId: () => operation(++ids),
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

test("reload after a lost response restores the same frozen intent and retains it after redirect and return", async () => {
  const storage = session();
  const bodies: string[] = [];
  let ids = 0;
  const options = {
    pendingStorage: () => storage,
    operationId: () => operation(++ids),
    onState() {},
    navigate() {},
    async request(body: string) {
      assert.equal(
        storage.values.size,
        1,
        "must persist before contacting checkout",
      );
      bodies.push(body);
      if (bodies.length === 1)
        throw new Error("Response lost after reservation");
      return new Response(
        JSON.stringify({
          checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_fixture",
        }),
      );
    },
  };
  const first = createCartCheckout(options);
  const original = [
    {
      variantKey: "soap-bar",
      quantity: 2,
      priceMinor: 1,
      customer: "not persisted",
    },
    { variantKey: "honey-jar", quantity: 1 },
  ];
  await first.start(original);
  assert.equal(first.phase, "uncertain");
  assert.equal(
    storage.values.size,
    1,
    "must persist before contacting checkout",
  );
  const raw = [...storage.values.values()][0]!;
  assert.deepEqual(JSON.parse(raw), {
    version: 1,
    operationId: operation(),
    lines: [
      { variantKey: "soap-bar", quantity: 2 },
      { variantKey: "honey-jar", quantity: 1 },
    ],
  });
  original[0]!.quantity = 99;
  const reloaded = createCartCheckout(options);
  assert.equal(reloaded.phase, "uncertain");
  assert.deepEqual(reloaded.pendingLines, [
    { variantKey: "soap-bar", quantity: 2 },
    { variantKey: "honey-jar", quantity: 1 },
  ]);
  await reloaded.start([{ variantKey: "replacement", quantity: 1 }]);
  assert.equal(ids, 1);
  await reloaded.retry();
  assert.equal(reloaded.phase, "redirecting");
  assert.equal(bodies[0], bodies[1]);
  assert.equal(
    [...storage.values.values()][0],
    raw,
    "redirect is not settlement",
  );
  const returned = createCartCheckout({
    ...options,
    async request(body: string) {
      bodies.push(body);
      return new Response('{"error":{"code":"CHECKOUT_CONFLICT"}}', {
        status: 409,
      });
    },
  });
  assert.equal(
    returned.phase,
    "uncertain",
    "return/cancel cannot confirm payment or release",
  );
  await returned.retry();
  assert.equal(returned.phase, "uncertain");
  assert.equal(ids, 1);
  assert.equal(bodies[2], bodies[0]);
  assert.equal([...storage.values.values()][0], raw);
});

test("invalid or unreadable pending recovery fails closed without requests, replacement IDs, or clearing evidence", async () => {
  const key = "true-hive-checkout-pending";
  for (const raw of [
    "{",
    '{"version":2,"operationId":"unknown","lines":[]}',
    JSON.stringify({
      version: 1,
      operationId: operation(),
      lines: [{ variantKey: "soap-bar", quantity: 101 }],
    }),
    JSON.stringify({
      version: 1,
      operationId: operation(),
      lines: [{ variantKey: "soap-bar", quantity: 1, priceMinor: 1 }],
    }),
    JSON.stringify({
      version: 1,
      operationId: operation(),
      lines: [{ variantKey: "soap-bar", quantity: 1 }],
      customer: "must not recover",
    }),
    " ".repeat(8193),
    null,
  ]) {
    const storage = session();
    if (raw !== null) storage.setItem(key, raw);
    let ids = 0;
    let requests = 0;
    const checkout = createCartCheckout({
      pendingStorage() {
        if (raw === null) throw new Error("Session storage denied");
        return storage;
      },
      operationId: () => operation(++ids),
      onState() {},
      navigate() {},
      async request() {
        requests++;
        return new Response("{}");
      },
    });
    assert.equal(checkout.phase, "blocked");
    await checkout.start([{ variantKey: "soap-bar", quantity: 1 }]);
    await checkout.retry();
    assert.equal(ids, 0);
    assert.equal(requests, 0);
    assert.equal(storage.getItem(key), raw);
  }
});

test("pending intent must be durably readable before a request and failed persistence cannot mint replacements", async () => {
  const storage = session();
  let blocked = true;
  let ids = 0;
  const bodies: string[] = [];
  const checkout = createCartCheckout({
    pendingStorage: () => ({
      ...storage,
      setItem(key, value) {
        if (blocked) throw new Error("Quota exceeded");
        storage.setItem(key, value);
      },
    }),
    operationId: () => operation(++ids),
    onState() {},
    navigate() {},
    async request(body) {
      bodies.push(body);
      throw new Error("Outcome unverified");
    },
  });
  await checkout.start([{ variantKey: "soap-bar", quantity: 1 }]);
  assert.equal(checkout.phase, "blocked");
  assert.equal(bodies.length, 0);
  await checkout.start([{ variantKey: "replacement", quantity: 1 }]);
  assert.equal(ids, 1);
  blocked = false;
  await checkout.retry();
  assert.equal(checkout.phase, "uncertain");
  assert.equal(ids, 1);
  assert.deepEqual(JSON.parse(bodies[0]!), {
    operationId: operation(),
    lines: [{ variantKey: "soap-bar", quantity: 1 }],
  });
});

test("unverified writes, failed rejection cleanup and failed redirect persistence keep checkout locked", async () => {
  for (const failure of [
    "silent-write",
    "remove-denied",
    "redirect-write-denied",
  ]) {
    const storage = session();
    let writes = 0;
    let ids = 0;
    let requests = 0;
    let navigated = false;
    const checkout = createCartCheckout({
      pendingStorage: () => ({
        ...storage,
        setItem(key, value) {
          writes++;
          if (failure === "silent-write") return;
          if (failure === "redirect-write-denied" && writes > 1)
            throw new Error("Storage became unavailable");
          storage.setItem(key, value);
        },
        removeItem() {
          throw new Error("Cannot verify cleanup");
        },
      }),
      operationId: () => operation(++ids),
      onState() {},
      navigate() {
        navigated = true;
      },
      async request() {
        requests++;
        return failure === "remove-denied"
          ? new Response('{"error":{"message":"Invalid input"}}', {
              status: 400,
            })
          : new Response(
              JSON.stringify({
                checkoutUrl:
                  "https://checkout.stripe.com/c/pay/cs_test_fixture",
              }),
            );
      },
    });

    await checkout.start([{ variantKey: "soap-bar", quantity: 1 }]);
    assert.equal(checkout.phase, "blocked", failure);
    await checkout.start([{ variantKey: "replacement", quantity: 1 }]);
    assert.equal(ids, 1);
    assert.equal(requests, failure === "silent-write" ? 0 : 1);
    assert.equal(navigated, false);
    assert.equal(storage.values.size, failure === "silent-write" ? 0 : 1);
  }
});

test("a successful server response followed by blocked redirect persistence cannot later release the intent on rejection", async () => {
  const storage = session();
  let writes = 0;
  let requests = 0;
  let ids = 0;
  const checkout = createCartCheckout({
    pendingStorage: () => ({
      ...storage,
      setItem(key, value) {
        if (++writes === 2) throw new Error("Write failed before redirect");
        storage.setItem(key, value);
      },
    }),
    operationId: () => operation(++ids),
    onState() {},
    navigate() {
      assert.fail("Cannot navigate without verified pending storage");
    },
    async request() {
      return ++requests === 1
        ? new Response(
            JSON.stringify({
              checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_fixture",
            }),
          )
        : new Response('{"error":{"message":"Origin changed"}}', {
            status: 403,
          });
    },
  });
  await checkout.start([{ variantKey: "soap-bar", quantity: 1 }]);
  assert.equal(checkout.phase, "blocked");
  await checkout.retry();
  assert.equal(checkout.phase, "uncertain");
  assert.equal(storage.values.size, 1);
  await checkout.start([{ variantKey: "replacement", quantity: 1 }]);
  assert.equal(ids, 1);
});
