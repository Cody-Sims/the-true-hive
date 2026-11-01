import test from "node:test";
import assert from "node:assert/strict";
import {
  InventoryConflictError,
  InventoryInputError,
  nextOnHand,
  validateAdjustment,
} from "../../src/server/inventory/rules.ts";

const request = {
  variantKey: "soap-bar",
  locationKey: "pickup",
  delta: -1,
  operationId: "078c36d4-8ad1-4638-956f-90ce38d60952",
  actorId: "operator:test",
  reason: "Physical count correction",
};

test("stock corrections accept a bounded attributable operation, not a browser price or quantity override", () => {
  const result = validateAdjustment({
    ...request,
    reason: "  Physical count correction  ",
    price: 1,
  });
  assert.deepEqual(result, request);
});

test("invalid identities, unsafe deltas and missing audit information are rejected", () => {
  const invalid = [
    { variantKey: "';drop table" },
    { locationKey: "" },
    { operationId: "not-a-uuid" },
    { actorId: "someone@example.com" },
    { reason: "   " },
    { reason: "x".repeat(501) },
    ...[0, 0.1, NaN, Infinity, 2147483648].map((delta) => ({ delta })),
    ...[0, -1, 0.1, NaN, Infinity, 2147483648, null, "1"].map(
      (expectedRevision) => ({ expectedRevision }),
    ),
  ];
  for (const change of invalid) {
    assert.throws(
      () => validateAdjustment({ ...request, ...change }),
      InventoryInputError,
    );
  }
});

test("count reductions cannot consume committed or unavailable stock", () => {
  assert.equal(nextOnHand({ onHand: 5, committed: 2, unavailable: 1 }, -2), 3);
  assert.throws(
    () => nextOnHand({ onHand: 5, committed: 2, unavailable: 1 }, -3),
    InventoryConflictError,
  );
  assert.throws(
    () => nextOnHand({ onHand: 1, committed: 0, unavailable: 0 }, -2),
    InventoryConflictError,
  );
  assert.throws(
    () => nextOnHand({ onHand: 2147483647, committed: 0, unavailable: 0 }, 1),
    InventoryConflictError,
  );
});

test("count reductions cannot consume checkout-held stock", () => {
  const balance = { onHand: 5, held: 2, committed: 1, unavailable: 1 };
  assert.equal(nextOnHand(balance, -1), 4);
  assert.throws(() => nextOnHand(balance, -2), InventoryConflictError);
  for (const held of [-1, 0.1, NaN, Infinity, 2147483648]) {
    assert.throws(
      () => nextOnHand({ ...balance, held }, 1),
      InventoryConflictError,
    );
  }
});

test("expected revisions are optional for legacy corrections and preserved when supplied", () => {
  assert.deepEqual(validateAdjustment(request), request);
  assert.deepEqual(validateAdjustment({ ...request, expectedRevision: 7 }), {
    ...request,
    expectedRevision: 7,
  });
});
