import assert from "node:assert/strict";
import test from "node:test";
import {
  extractIngredientsFromDetails,
  formatIngredientLabel,
} from "../../src/domain/ingredients.ts";

test("ingredient label text uses only supplied names in their supplied order", () => {
  assert.equal(
    formatIngredientLabel([
      " Fixture oil ",
      "Fixture blend (A, B)",
      "Fixture wax ;)",
    ]),
    "Ingredients: Fixture oil, Fixture blend (A, B), Fixture wax ;)",
  );
  assert.equal(formatIngredientLabel([]), "");
  assert.equal(
    formatIngredientLabel(["<b>Fixture text</b>"]),
    "Ingredients: <b>Fixture text</b>",
  );
});

test("explicit ingredient blocks move without changing size, care or the original details", () => {
  for (const bullet of ["-", "- ", "* ", "\u2022 "]) {
    const details = Object.freeze([
      "Size: fixture size",
      "Ingredients:",
      `${bullet}Fixture oil`,
      `${bullet}Fixture blend (A, B)`,
      "Care: Keep fixture dry.",
    ]);
    assert.deepEqual(extractIngredientsFromDetails(details), {
      ingredients: ["Fixture oil", "Fixture blend (A, B)"],
      details: ["Size: fixture size", "Care: Keep fixture dry."],
    });
    assert.equal(details[1], "Ingredients:");
  }
});

test("missing, empty and ambiguous blocks require review instead of guessing", () => {
  for (const details of [
    ["Size: fixture size", "No confirmed formula."],
    ["Ingredients:"],
    ["Ingredients:", "- "],
    [
      "Ingredients:",
      "- Fixture oil",
      "Unclear unbulleted text",
      "- Fixture water",
    ],
    ["Ingredients:", "- Fixture oil", "Ingredients:", "- Fixture water"],
    ["Ingredients: Fixture oil, fixture water"],
  ]) {
    const original = [...details];
    assert.throws(() => extractIngredientsFromDetails(details));
    assert.deepEqual(details, original);
  }
});

test("ingredient bounds match the saved list and preserve complete Unicode entries", () => {
  const maximum = Array.from({ length: 40 }, () => "\u{1f41d}".repeat(200));
  assert.equal(
    formatIngredientLabel(maximum),
    `Ingredients: ${maximum.join(", ")}`,
  );
  for (const ingredients of [
    Array.from({ length: 41 }, () => "Fixture"),
    ["x".repeat(201)],
    [""],
    [" "],
    ["Fixture\nwater"],
    ["Fixture\0water"],
    ["\ud800"],
  ]) {
    assert.throws(() => formatIngredientLabel(ingredients));
    assert.throws(() =>
      extractIngredientsFromDetails([
        "Ingredients:",
        ...ingredients.map((ingredient) => `- ${ingredient}`),
      ]),
    );
  }
});
