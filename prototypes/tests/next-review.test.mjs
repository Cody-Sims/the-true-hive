import test from "node:test";
import assert from "node:assert/strict";
import { resolveReview, updatePreviewCart, cartSummary } from "../next/model.mjs";

test("review links select their requested design, product and individual variant without cross-product leakage", () => {
  const state = resolveReview(new URLSearchParams({
    design: "night-apiary", view: "product", product: "the-true-soap", variant: "the-true-soap-4oz-wolf",
  }));
  assert.equal(state.concept.id, "night-apiary");
  assert.equal(state.view, "product");
  assert.match(state.variant.image, /soap-true-wolf/);
  assert.deepEqual(state.product.ingredients.slice(-2), ["Castor Oil", "Beeswax ;)"]);
  const foreign = resolveReview(new URLSearchParams({ product: "the-true-soap", variant: "coconut-milk-delight-4oz-wolf" }));
  assert.match(foreign.variant.image, /soap-true-bar/);
  const invalid = resolveReview(new URLSearchParams("design=../../secret&view=<script>&product=missing"));
  assert.equal(invalid.concept.id, "atelier");
  assert.equal(invalid.view, "home");
});

test("the local preview cart resolves only catalog identities and canonical prices and rejects invalid quantities", () => {
  let lines = updatePreviewCart([], "the-true-soap-4oz-wolf", 2);
  lines = updatePreviewCart(lines, "the-true-soap-4oz-wolf", 1);
  assert.deepEqual(lines, [{ variantKey: "the-true-soap-4oz-wolf", quantity: 3 }]);
  assert.equal(cartSummary(lines).totalMinor, 3750);
  for (const quantity of [-1, 0, 1.5, 101, "2", NaN])
    assert.throws(() => updatePreviewCart(lines, "the-true-soap-4oz-wolf", quantity));
  assert.throws(() => updatePreviewCart(lines, "unknown", 1));
  assert.equal(cartSummary([{ variantKey: "unknown", quantity: 99, priceMinor: 1 }]).totalMinor, 0);
});
