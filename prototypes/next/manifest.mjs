export const concepts = [
  {
    id: "atelier",
    name: "Ingredient Atelier",
    number: "01",
    mood: "Quiet, tactile, ingredient-led",
    headline: "A little ritual.\nBeautifully considered.",
    treatment: "Readable ingredient notes layered beside the photograph.",
    layout: "annotated-split",
    ingredientMode: "overlay",
  },
  {
    id: "honeyglass",
    name: "Honeyglass",
    number: "02",
    mood: "Sun-warmed, generous, expressive",
    headline: "Good mornings.\nGolden little moments.",
    treatment: "A warm ingredient ribbon beneath the product stage.",
    layout: "sunlit-stage",
    ingredientMode: "ribbon",
  },
  {
    id: "field-notes",
    name: "Field Notes",
    number: "03",
    mood: "Precise, useful, quietly editorial",
    headline: "Simple goods.\nAll the right details.",
    treatment: "An indexed ingredient ledger for quick comparison.",
    layout: "indexed-ledger",
    ingredientMode: "ledger",
  },
  {
    id: "soft-geometry",
    name: "Soft Geometry",
    number: "04",
    mood: "Sculptural, playful, well ordered",
    headline: "Small shapes.\nEveryday favorites.",
    treatment: "An expandable ingredient card within a modular bento layout.",
    layout: "modular-bento",
    ingredientMode: "card",
  },
  {
    id: "night-apiary",
    name: "Night Apiary",
    number: "05",
    mood: "Deep forest, cinematic, restrained",
    headline: "Slow down.\nMake room for good.",
    treatment:
      "A high-contrast ingredient drawer over a cinematic image stage.",
    layout: "cinematic-drawer",
    ingredientMode: "drawer",
  },
];

export const reviewAssets = [
  "soap-delight-bar",
  "soap-delight-wolf",
  "soap-true-bar",
  "soap-true-wolf",
].flatMap((name) => [`assets/${name}.webp`, `assets/${name}-small.webp`]);
reviewAssets.push("assets/hive.webp");

export const reviewFiles = [
  "index.html",
  "concept.html",
  "styles.css",
  "app.mjs",
  "model.mjs",
  "data.mjs",
  "manifest.mjs",
  ...reviewAssets,
];
