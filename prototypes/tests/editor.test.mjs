import test from "node:test";
import assert from "node:assert/strict";
import { exampleProduct, changeVariant } from "../editor/model.mjs";

test("archiving hides an option without losing its stock/history, and restoration is reversible", () => {
  const original = exampleProduct();
  const archived = changeVariant(original, "demo-1", "archive");
  assert.equal(archived.error, undefined);
  assert.equal(archived.product.variants[0].active, false);
  assert.equal(archived.product.variants[0].stock, 8);
  assert.equal(archived.product.variants[0].history, true);
  assert.equal(original.variants[0].active, true);
  assert.equal(changeVariant(archived.product, "demo-1", "restore").product.variants[0].active, true);
});

test("permanent deletion is limited to unused options and never removes the last published format", () => {
  const original = exampleProduct();
  assert.match(changeVariant(original, "demo-1", "delete").error, /stock|history/i);
  assert.match(changeVariant(original, "demo-3", "delete").error, /stock|history/i);
  const deleted = changeVariant(original, "demo-2", "delete");
  assert.equal(deleted.product.variants.length, 2);
  assert.equal(deleted.product.variants.some((v) => v.id === "demo-2"), false);
  assert.match(changeVariant(deleted.product, "demo-1", "archive").error, /last.*variant/i);
  assert.equal(deleted.product.variants[0].active, true);
  assert.match(changeVariant(original, "unknown", "delete").error, /not found/i);
});
