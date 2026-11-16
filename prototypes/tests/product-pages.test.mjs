import test from "node:test";
import assert from "node:assert/strict";
import { selectStudy, studyUrl, previewLine } from "../product-pages/model.mjs";

test("product-only studies select new layouts and preserve product-specific variant identities", () => {
  for (const design of ["quick-pick", "formula-map", "format-studio", "label-room", "gallery-focus"]) {
    const state = selectStudy(new URLSearchParams({ design, product: "the-true-soap", variant: "the-true-soap-4oz-wolf", view: "home" }));
    assert.equal(state.design.id, design);
    assert.equal(state.product.title, "The True Soap");
    assert.equal(state.variant.image, "assets/soap-true-wolf.webp");
    assert.equal("view" in state, false);
  }
  const foreign = selectStudy(new URLSearchParams({ product: "the-true-soap", variant: "coconut-milk-delight-4oz-wolf", design: "../../secret" }));
  assert.equal(foreign.design.id, "quick-pick");
  assert.equal(foreign.variant.key, "the-true-soap-4oz-single");
  const url = studyUrl(foreign, { design: "<script>", product: "missing", variant: "unknown" });
  assert.match(url, /^index\.html\?design=quick-pick&product=coconut-milk-delight&variant=coconut-milk-delight-4oz-single$/);
});

test("product-page demos show canonical format prices and accept only bounded whole quantities", () => {
  const state = selectStudy(new URLSearchParams({ product: "the-true-soap", variant: "the-true-soap-4oz-wolf", priceMinor: "1" }));
  assert.deepEqual(previewLine(state, 2), {
    variantKey: "the-true-soap-4oz-wolf", quantity: 2, unitPriceMinor: 1250, totalMinor: 2500,
  });
  for (const quantity of [0, -1, 1.5, 101, "2", NaN])
    assert.throws(() => previewLine(state, quantity));
});
