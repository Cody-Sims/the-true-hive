import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  OrderInputError,
  validateCheckout,
  validatePayment,
  validatePickup,
} from "../../src/server/commerce/rules.ts";

test("checkout strips browser prices and uses only server location and line intent", () => {
  const operationId = randomUUID();
  assert.deepEqual(
    validateCheckout(
      {
        operationId,
        locationKey: "attacker-location",
        totalMinor: 1,
        lines: [{ variantKey: "soap-bar", quantity: 2, priceMinor: 1 }],
      },
      "pickup",
    ),
    {
      operationId,
      locationKey: "pickup",
      lines: [{ variantKey: "soap-bar", quantity: 2 }],
    },
  );
});

test("normalized receipts accept bounded reconciliation IDs and null intents, not raw provider payloads", () => {
  const receipt = {
    eventId: `reconcile_${"a".repeat(64)}`,
    orderId: randomUUID(),
    sessionId: "cs_test_session",
    paymentIntentId: null,
    totalMinor: 800,
    currency: "USD",
    customer: { email: "test-only@example.invalid" },
  };
  const { customer, ...normalized } = receipt;
  assert.deepEqual(validatePayment(receipt), normalized);
  for (const change of [
    { eventId: "e".repeat(256) },
    { sessionId: "contains spaces" },
    { paymentIntentId: "" },
    { orderId: "invalid" },
    { currency: "usd" },
    { totalMinor: 0 },
    { totalMinor: Infinity },
  ])
    assert.throws(
      () => validatePayment({ ...receipt, ...change }),
      OrderInputError,
    );
});

test("pickup uses the trusted actor and requires a bounded positive expected revision", () => {
  const operationId = randomUUID();
  assert.deepEqual(
    validatePickup(
      { operationId, expectedRevision: 3, actorId: "browser-actor" },
      "operator:test",
    ),
    {
      operationId,
      expectedRevision: 3,
      actorId: "operator:test",
    },
  );
  for (const expectedRevision of [
    undefined,
    null,
    0,
    -1,
    1.5,
    "1",
    2147483648,
  ]) {
    assert.throws(
      () => validatePickup({ operationId, expectedRevision }, "operator:test"),
      OrderInputError,
    );
  }
});

test("checkout rejects unsafe keys, quantities, identities and duplicate lines", () => {
  const valid = {
    operationId: randomUUID(),
    lines: [{ variantKey: "soap-bar", quantity: 1 }],
  };
  for (const invalid of [
    null,
    { ...valid, operationId: "not-a-uuid" },
    { ...valid, lines: [] },
    { ...valid, lines: Array(21).fill(valid.lines[0]) },
    { ...valid, lines: [valid.lines[0], valid.lines[0]] },
    ...[0, -1, 1.5, 101, "1", NaN, Infinity].map((quantity) => ({
      ...valid,
      lines: [{ variantKey: "soap-bar", quantity }],
    })),
    { ...valid, lines: [{ variantKey: "';drop table", quantity: 1 }] },
  ]) {
    assert.throws(() => validateCheckout(invalid, "pickup"), OrderInputError);
  }
  assert.throws(
    () => validateCheckout(valid, "Invalid location"),
    OrderInputError,
  );
});
