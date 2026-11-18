import test from "node:test";
import assert from "node:assert/strict";
import { exampleProduct } from "../editor/model.mjs";
import { encodeDraft, decodeDraft } from "../workbench-next/drafts.mjs";

test("unfinished editable drafts restore exactly without persisting photo or inventory metadata", () => {
  const product = exampleProduct();
  product.title = "An unfinished <b>example</b>";
  product.ingredients = "Example wax\nExample wick";
  product.variants[0].price = "12.";
  product.variants[0].stock = 999;
  product.photo = "blob:do-not-store";
  product.token = "do-not-store-secret";
  const raw = encodeDraft(product, "edit", true, 1234);
  assert.equal(raw.includes("blob:"), false);
  assert.equal(raw.includes("do-not-store"), false);
  assert.equal(raw.includes('"stock"'), false);
  const restored = decodeDraft(raw, "edit");
  assert.equal(restored.state, "restored");
  assert.equal(restored.product.title, product.title);
  assert.equal(restored.product.ingredients, product.ingredients);
  assert.equal(restored.product.variants[0].price, "12.");
  assert.equal(restored.product.variants[0].stock, 8);
  assert.equal(restored.product.variants[0].history, true);
  assert.equal(restored.hasPhoto, true);
});

test("draft restoration preserves explicit variant removal and new variant edits", () => {
  const product = exampleProduct("new");
  product.variants = [{ id: "demo-9", label: "Example jar", price: "", active: false, stock: 0, history: false }];
  const restored = decodeDraft(encodeDraft(product, "new", false, 1), "new");
  assert.equal(restored.state, "restored");
  assert.deepEqual(restored.product.variants, product.variants);
  assert.equal(decodeDraft(encodeDraft(product, "new", false, 1), "edit").state, "invalid");
});

test("corrupt, future, unbounded and duplicate-ID drafts are rejected rather than silently restored", () => {
  assert.equal(decodeDraft(null, "edit").state, "empty");
  const valid = JSON.parse(encodeDraft(exampleProduct(), "edit", false, 1));
  for (const raw of ["{", "x".repeat(131073), JSON.stringify({ ...valid, version: 99 }),
    JSON.stringify({ ...valid, product: { ...valid.product, title: "x".repeat(161) } }),
    JSON.stringify({ ...valid, product: { ...valid.product, variants: [valid.product.variants[0], valid.product.variants[0]] } })])
    assert.equal(decodeDraft(raw, "edit").state, "invalid");
});
