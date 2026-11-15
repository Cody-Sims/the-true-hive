import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCart,
  serializeCart,
  updateCart,
  resolveCart,
  stockLabel,
  pricedVariants,
  money,
} from "../../src/domain/cart.ts";
import type { Catalog, Product } from "../../src/domain/catalog.ts";

function product(): Product {
  return {
    key: "soap",
    slug: "soap",
    title: "Test fixture soap",
    summary: "Not production inventory",
    details: [],
    category: "soap",
    imageKey: "soap",
    kind: "active",
    variants: [
      { key: "soap-bar", label: "Bar", priceMinor: 725, currency: "USD" },
      { key: "soap-pair", label: "Pair", priceMinor: 1400, currency: "USD" },
    ],
  };
}

test("cart persistence strips untrusted prices and details and merges bounded duplicate IDs", () => {
  const parsed = parseCart(
    JSON.stringify({
      version: 1,
      customer: "must not persist",
      lines: [
        { variantKey: "soap-bar", quantity: 2, priceMinor: 1 },
        { variantKey: "soap-bar", quantity: 3, stock: 999 },
      ],
    }),
  );
  assert.deepEqual(parsed.lines, [{ variantKey: "soap-bar", quantity: 5 }]);
  assert.deepEqual(JSON.parse(serializeCart(parsed.lines)), {
    version: 1,
    lines: [{ variantKey: "soap-bar", quantity: 5 }],
  });
});

test("corrupt, oversized and future cart payloads recover safely with no invented lines", () => {
  for (const raw of [
    "{",
    "null",
    "[]",
    '{"version":2,"lines":[]}',
    " ".repeat(8193),
  ]) {
    assert.deepEqual(parseCart(raw), { lines: [], recovered: true });
  }
  assert.deepEqual(parseCart(null), { lines: [], recovered: false });
  const lines = [
    { variantKey: "<script>", quantity: 1 },
    { variantKey: "bad-number", quantity: "3" },
    { variantKey: "huge", quantity: 101 },
    { variantKey: "negative", quantity: -2 },
    { variantKey: "fraction", quantity: 1.5 },
    ...Array.from({ length: 22 }, (_, i) => ({
      variantKey: `valid-${i}`,
      quantity: 1,
    })),
  ];
  const parsed = parseCart(JSON.stringify({ version: 1, lines }));
  assert.equal(parsed.recovered, true);
  assert.equal(parsed.lines.length, 20);
  assert.deepEqual(parsed.lines[0], { variantKey: "valid-0", quantity: 1 });
  assert.deepEqual(
    parseCart(
      JSON.stringify({
        version: 1,
        lines: [
          { variantKey: "soap-bar", quantity: 90 },
          { variantKey: "soap-bar", quantity: 20 },
        ],
      }),
    ).lines,
    [{ variantKey: "soap-bar", quantity: 100 }],
  );
});

test("adding merges distinct variants, editing/removing keeps bounds and never mutates callers", () => {
  const initial = [{ variantKey: "soap-bar", quantity: 2 }];
  const merged = updateCart(initial, "soap-bar", 3, "add");
  assert.deepEqual(merged, [{ variantKey: "soap-bar", quantity: 5 }]);
  assert.equal(initial[0]!.quantity, 2);
  const pair = updateCart(merged, "soap-pair", 1, "add");
  assert.equal(pair.length, 2);
  assert.deepEqual(updateCart(pair, "soap-bar", 0), [
    { variantKey: "soap-pair", quantity: 1 },
  ]);
  assert.throws(() => updateCart(merged, "soap-bar", 100, "add"), /100/);
  assert.throws(() => updateCart(merged, "bad key", 1), /variant/i);
  assert.throws(() => updateCart(merged, "soap-bar", NaN), /quantity/i);
  const full = Array.from({ length: 20 }, (_, i) => ({
    variantKey: `variant-${i}`,
    quantity: 1,
  }));
  assert.throws(() => updateCart(full, "another", 1, "add"), /20/);
  assert.equal(updateCart(full, "variant-0", 2).length, 20);
});

test("cart display always resolves canonical prices and preserves missing/unpriced/concept lines", () => {
  const soap = product();
  const catalog: Catalog = { source: "database", products: [soap] };
  const lines = [{ variantKey: "soap-bar", quantity: 2 }];
  assert.equal(resolveCart(lines, catalog).subtotalMinor, 1450);
  soap.variants[0]!.priceMinor = 875;
  assert.equal(resolveCart(lines, catalog).subtotalMinor, 1750);
  assert.equal(money(875), "$8.75");
  soap.variants[0]!.priceMinor = null;
  assert.equal(resolveCart(lines, catalog).subtotalMinor, null);
  assert.match(resolveCart(lines, catalog).lines[0]!.issue!, /price/i);
  soap.kind = "concept";
  assert.equal(pricedVariants(soap).length, 0);
  assert.equal(resolveCart(lines, catalog).canCheckout, false);
  catalog.products = [];
  assert.match(resolveCart(lines, catalog).lines[0]!.issue!, /no longer/i);
  assert.match(resolveCart(lines, null).lines[0]!.issue!, /unavailable/i);
  assert.equal(resolveCart([], catalog).canCheckout, false);
});

test("stock presentation discloses only valid low counts and blocks known unavailable variants", () => {
  const soap = product();
  const variant = soap.variants[0]!;
  const projected = variant as unknown as {
    stock?: { state: string; remaining?: number };
  };
  const catalog: Catalog = { source: "database", products: [soap] };
  const lines = [{ variantKey: variant.key, quantity: 2 }];
  projected.stock = { state: "low_stock", remaining: 3 };
  assert.equal(stockLabel(variant), "Only 3 left");
  assert.equal(resolveCart(lines, catalog).canCheckout, true);
  assert.equal(
    resolveCart([{ ...lines[0]!, quantity: 4 }], catalog).canCheckout,
    false,
  );
  for (const remaining of [0, 6, 100, NaN]) {
    projected.stock = { state: "low_stock", remaining };
    assert.equal(stockLabel(variant), "Availability unverified");
    assert.equal(resolveCart(lines, catalog).canCheckout, false);
  }
  projected.stock = { state: "available", remaining: 42 };
  assert.equal(stockLabel(variant), "Available");
  projected.stock = { state: "out_of_stock" };
  assert.equal(stockLabel(variant), "Sold out");
  assert.equal(resolveCart(lines, catalog).canCheckout, false);
  projected.stock = { state: "not_offered" };
  assert.equal(resolveCart(lines, catalog).canCheckout, false);
  projected.stock = { state: "unverified" };
  assert.equal(resolveCart(lines, catalog).canCheckout, false);
});
