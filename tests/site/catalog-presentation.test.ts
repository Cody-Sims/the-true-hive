import test from "node:test";
import assert from "node:assert/strict";
import type { Product, ProductVariant } from "../../src/domain/catalog.ts";
import {
  homeSelection,
  prioritizeProducts,
} from "../../src/domain/catalog-presentation.ts";
import { render } from "./barcode-test-helper.ts";

function product(
  key: string,
  variants: ProductVariant[],
  kind: Product["kind"] = "active",
): Product {
  return {
    key,
    slug: key,
    title: key,
    summary: "",
    details: [],
    category: "soap",
    imageKey: "soap",
    kind,
    variants,
  };
}
function variant(
  key: string,
  state: "available" | "out_of_stock" | "unverified",
): ProductVariant {
  return {
    key,
    label: key,
    currency: "USD",
    priceMinor: 1000,
    stock: { state },
  };
}

test("the live shelf leads with stocked products while preserving source order and identities", () => {
  const first = product("first-soap", [variant("first-bar", "available")]);
  const sold = product("seasonal", [variant("seasonal-bar", "out_of_stock")]);
  const second = product("second-soap", [
    variant("second-bar", "available"),
    variant("second-wolf", "available"),
  ]);
  const catalog = [first, sold, second];
  const result = homeSelection(catalog);
  assert.equal(result.stocked, true);
  assert.deepEqual(
    result.featured.map((entry) => entry.key),
    ["first-soap", "second-soap"],
  );
  assert.deepEqual(
    result.hero.map((entry) => entry.variant?.key),
    ["first-bar", "second-bar", "second-wolf"],
  );
  assert.equal(result.hero[2]?.product, second);
  assert.deepEqual(
    catalog.map((entry) => entry.key),
    ["first-soap", "seasonal", "second-soap"],
  );
  assert.deepEqual(
    prioritizeProducts(catalog).map((entry) => entry.key),
    ["first-soap", "second-soap", "seasonal"],
  );
});

test("a stocked format wins over a sold-out format without inventing availability for unknown stock", () => {
  const unknown = product("unknown", [variant("unknown-bar", "unverified")]);
  const soap = product("soap", [
    variant("sold-bar", "out_of_stock"),
    variant("ready-wolf", "available"),
  ]);
  const result = homeSelection([unknown, soap]);
  assert.deepEqual(
    result.featured.map((entry) => entry.key),
    ["soap"],
  );
  assert.equal(result.hero[0]?.variant?.key, "ready-wolf");
  assert.equal(homeSelection([unknown]).stocked, false);
});

test("low stock is genuine stock, while concepts and invalid prices never become stocked offers", () => {
  const low = product("low", [
    {
      ...variant("low-bar", "available"),
      stock: { state: "low_stock", remaining: 2 },
    },
  ]);
  const concept = product(
    "concept",
    [variant("concept-bar", "available")],
    "concept",
  );
  const unpriced = product("unpriced", [
    { ...variant("unpriced-bar", "available"), priceMinor: null },
  ]);
  assert.deepEqual(
    homeSelection([concept, unpriced, low]).featured.map((entry) => entry.key),
    ["low"],
  );
  assert.equal(homeSelection([concept, unpriced]).stocked, false);
});

test("an empty catalog stays empty rather than substituting demo products or prices", () => {
  assert.deepEqual(homeSelection([]), {
    stocked: false,
    featured: [],
    hero: [],
  });
});

test("unavailable and unpriced formats produce generic product tiles, not selectable-format promises", () => {
  for (const variants of [
    [variant("sold-bar", "out_of_stock"), variant("sold-wolf", "out_of_stock")],
    [
      {
        ...variant("hidden-bar", "available"),
        stock: { state: "not_offered" } as const,
      },
    ],
    [{ ...variant("unpriced-bar", "available"), priceMinor: null }],
  ]) {
    const selection = homeSelection([product("unavailable", variants)]);
    assert.equal(selection.stocked, false);
    assert.equal(selection.hero.length, 1);
    assert.equal(selection.hero[0]?.variant, undefined);
  }
});

test("public bar profiles render current catalog facts without changing the private editor preview", async () => {
  const soap = product("facts-soap", [
    { ...variant("facts-bar", "available"), priceMinor: 725 },
    { ...variant("facts-wolf", "available"), priceMinor: 1250 },
  ]);
  soap.ingredients = ["Coconut Oil", "Beeswax"];
  const card = await render("src/components/ProductCard.astro", {
    product: soap,
  });

  assert.match(card, /data-product-profile/);
  assert.match(card, /2 listed/);
  assert.match(card, /\$7\.25/);
  assert.doesNotMatch(card, /Creaminess|Scent Warmth|95\/100/);
  const editor = await render("src/components/ProductCard.astro", {
    product: soap,
    preview: true,
  });
  assert.doesNotMatch(editor, /data-product-profile/);
});

test("public cards expose canonical one-item format selection and quick add without enabling unavailable choices", async () => {
  const soap = product("quick-soap", [
    variant("quick-bar", "available"),
    { ...variant("quick-wolf", "available"), priceMinor: 1250 },
    variant("quick-sold", "out_of_stock"),
  ]);
  const card = await render("src/components/ProductCard.astro", {
    product: soap,
  });

  assert.match(card, /data-catalog-card/);
  assert.match(card, /data-quick-add/);
  assert.match(card, /type="hidden" name="quantity" value="1"/);
  assert.match(card, /data-card-image="quick-wolf"/);
  assert.match(card, /value="quick-sold"[^>]*disabled/);
  assert.doesNotMatch(card, /href="[^"]*#ingredients"/);
  const editor = await render("src/components/ProductCard.astro", {
    product: soap,
    preview: true,
  });
  assert.doesNotMatch(editor, /data-add-to-cart|data-quick-add/);
});

test("product ingredients offer a separate full-width grid without changing plain ordered ingredient rendering", async () => {
  const html = await render("src/components/ProductIngredients.astro", {
    ingredients: ["Coconut Oil", "Lye", "<b>Owner supplied ingredient</b>"],
    grid: true,
    soapRecipe: true,
  });
  assert.match(html, /id="ingredients"/);
  assert.match(html, /class="ingredient-grid/);
  assert.match(html, /&lt;b&gt;Owner supplied ingredient&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>/);
  assert.match(html, /saponification/);
  assert.doesNotMatch(html, /zero lye|lab-tested/);
});

test("non-soap ingredient grids do not infer a soap recipe from a shared ingredient name", async () => {
  const html = await render("src/components/ProductIngredients.astro", {
    ingredients: ["Beeswax"],
    grid: true,
  });
  assert.match(html, /<strong>Beeswax<\/strong>/);
  assert.doesNotMatch(html, /soap recipe/);
});
