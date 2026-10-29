import test from "node:test";
import assert from "node:assert/strict";
import { getAvailability, changeCart, readCart, priceCart } from "../scripts/commerce-model.mjs";

const products = [
  { key: "honey", title: "Sample honey", variants: [
    { id: "honey-12", label: "12 oz", priceMinor: 1400, currency: "USD" },
  ] },
  { key: "soap", title: "Sample soap", variants: [
    { id: "soap-bar", label: "One bar", priceMinor: 800, currency: "USD" },
  ] },
];

const snapshot = {
  status: "ready",
  locations: [
    { id: "pickup", channels: ["pickup"] },
    { id: "market", channels: [] },
  ],
  levels: [
    { variantId: "honey-12", locationId: "pickup", available: 2 },
    { variantId: "honey-12", locationId: "market", available: 40 },
    { variantId: "soap-bar", locationId: "pickup", available: 0 },
  ],
};

const context = { products, snapshot, fulfillment: "pickup" };

test("availability is fulfillment-scoped, not the total across stock locations", () => {
  const result = getAvailability(snapshot, "honey-12", "pickup");
  assert.equal(result.status, "available");
  assert.equal(result.quantity, 2);
});

test("a shipping channel not offered is different from zero pickup stock", () => {
  assert.equal(getAvailability(snapshot, "honey-12", "shipping").status, "not_offered");
  assert.equal(getAvailability(snapshot, "soap-bar", "pickup").status, "sold_out");
});

test("an inventory outage returns unknown rather than sold out or available", () => {
  const result = getAvailability({ ...snapshot, status: "unavailable" }, "honey-12", "pickup");
  assert.equal(result.status, "unknown");
  assert.equal(result.quantity, null);
});

test("a missing or malformed inventory record is unknown, not zero stock", () => {
  assert.equal(getAvailability(snapshot, "missing", "pickup").status, "unknown");
  const malformed = { ...snapshot, levels: [{ variantId: "honey-12", locationId: "pickup", available: -1 }] };
  assert.equal(getAvailability(malformed, "honey-12", "pickup").status, "unknown");
});

test("pickup stock at different locations is not combined into an invented pickup promise", () => {
  const multiple = { ...snapshot,
    locations: [...snapshot.locations, { id: "second-pickup", channels: ["pickup"] }],
    levels: [...snapshot.levels, { variantId: "honey-12", locationId: "second-pickup", available: 5 }],
  };
  assert.equal(getAvailability(multiple, "honey-12", "pickup").status, "unknown");
  assert.equal(getAvailability(multiple, "honey-12", "pickup", "second-pickup").quantity, 5);
  assert.equal(getAvailability(multiple, "honey-12", "pickup", "pickup").quantity, 2);
});

test("adding a cart line leaves the input cart and inventory unchanged", () => {
  const lines = [];
  const before = structuredClone(snapshot);
  const result = changeCart(lines, { variantId: "honey-12", quantity: 1, operation: "add" }, context);
  assert.equal(result.ok, true);
  assert.deepEqual(result.lines, [{ variantId: "honey-12", quantity: 1 }]);
  assert.deepEqual(lines, []);
  assert.deepEqual(snapshot, before);
});

test("existing quantity counts against availability without silently clamping", () => {
  const result = changeCart([{ variantId: "honey-12", quantity: 2 }],
    { variantId: "honey-12", quantity: 1, operation: "add" }, context);
  assert.equal(result.ok, false);
  assert.match(result.error, /2/);
});

test("invalid quantities and unknown variants are rejected explicitly", () => {
  for (const quantity of [-1, 0, 0.5, 100, NaN, Infinity]) {
    const result = changeCart([], { variantId: "honey-12", quantity, operation: "add" }, context);
    assert.equal(result.ok, false);
    assert.match(result.error, /whole|quantity/i);
  }
  assert.match(changeCart([], { variantId: "missing", quantity: 1, operation: "add" }, context).error, /variant/i);
});

test("removing a line remains possible during an inventory outage", () => {
  const result = changeCart([{ variantId: "honey-12", quantity: 1 }],
    { variantId: "honey-12", quantity: 0, operation: "set" },
    { ...context, snapshot: { ...snapshot, status: "unavailable" } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.lines, []);
});

test("saved-cart parsing accepts only versioned IDs and quantities, never stored prices", () => {
  const result = readCart(JSON.stringify({ version: 1, lines: [
    { variantId: "honey-12", quantity: 1, priceMinor: 1 },
  ] }), products);
  assert.equal(result.ok, true);
  assert.deepEqual(result.lines, [{ variantId: "honey-12", quantity: 1 }]);
  assert.deepEqual(readCart(null, products), { ok: true, lines: [] });
});

test("invalid JSON, duplicate lines, stale variants and unsupported saved versions are not silently accepted", () => {
  const invalid = [
    "{broken",
    JSON.stringify({ version: 2, lines: [] }),
    JSON.stringify({ version: 1, lines: [{ variantId: "missing", quantity: 1 }] }),
    JSON.stringify({ version: 1, lines: [{ variantId: "honey-12", quantity: -2 }] }),
    JSON.stringify({ version: 1, lines: [
      { variantId: "honey-12", quantity: 1 },
      { variantId: "honey-12", quantity: 1 },
    ] }),
  ];
  for (const raw of invalid) {
    const result = readCart(raw, products);
    assert.equal(result.ok, false);
    assert.match(result.error, /saved demo cart/i);
  }
});

test("cart totals use catalog prices and mark stale quantities as blocking issues", () => {
  const result = priceCart([{ variantId: "honey-12", quantity: 2, priceMinor: 1 }],
    products, snapshot, "pickup");
  assert.equal(result.subtotalMinor, 2800);
  assert.equal(result.itemCount, 2);
  assert.equal(result.canReview, true);
  const lastUnit = { ...snapshot, levels: [{ variantId: "honey-12", locationId: "pickup", available: 1 }] };
  const stale = priceCart([{ variantId: "honey-12", quantity: 2 }], products, lastUnit, "pickup");
  assert.equal(stale.canReview, false);
  assert.match(stale.issues[0], /1/);
});

test("an empty cart cannot proceed to review", () => {
  const result = priceCart([], products, snapshot, "pickup");
  assert.equal(result.canReview, false);
  assert.equal(result.subtotalMinor, 0);
});
