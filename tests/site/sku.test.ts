import assert from "node:assert/strict";
import test from "node:test";
import { suggestVariantIdentifiers } from "../../src/domain/sku.ts";

test("explicit suggestions use confirmed identities, remain readable, deterministic and bounded", () => {
  const suggestion = suggestVariantIdentifiers("fixture-soap", "Oval mold");
  assert.match(suggestion.key, /^fixture-soap-oval-mold-/);
  assert.match(suggestion.sku, /^TH-FIXTURE-SOAP-OVAL-MOLD-/);
  assert.deepEqual(
    suggestVariantIdentifiers("fixture-soap", "Oval mold"),
    suggestion,
  );
  assert.notDeepEqual(
    suggestVariantIdentifiers("fixture-soap", "Round mold"),
    suggestion,
  );
  const long = suggestVariantIdentifiers("p".repeat(80), "v".repeat(160));
  assert.ok(long.key.length <= 80);
  assert.ok(long.sku.length <= 128);
  assert.match(long.key, /^[a-z0-9][a-z0-9-]*$/);
});

test("suggestions require confirmed bounded identities instead of inferring sizes or ingredients", () => {
  for (const [product, variant] of [
    ["", "Oval"],
    ["Bad Key", "Oval"],
    ["p".repeat(81), "Oval"],
    ["soap", ""],
    ["soap", "x".repeat(161)],
    ["soap", "\u0000oval"],
    ["soap", "蜂"],
  ])
    assert.throws(() => suggestVariantIdentifiers(product!, variant!));
});
