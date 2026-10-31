import type { Product } from "../domain/catalog.ts";

export const showcaseProducts: readonly Product[] = [
  {
    key: "soap-collection",
    slug: "everyday-soap",
    title: "Everyday soap",
    summary:
      "A place for the daily ritual. Our sample soap illustration introduces the collection while final formulas, labels, and formats are confirmed.",
    details: [
      "The illustration is a packaging concept, not a photograph of an approved formula.",
      "Actual ingredients, net quantity, scent, use information, and price will be published with the real product.",
      "No therapeutic or skin-treatment claim is made.",
    ],
    category: "soap",
    imageKey: "soap",
    kind: "concept",
    variants: [
      {
        key: "soap-concept",
        label: "Format to be confirmed",
        priceMinor: null,
        currency: "USD",
      },
    ],
  },
  {
    key: "honey-collection",
    slug: "seasonal-honey",
    title: "Seasonal honey",
    summary:
      "A future pantry possibility. Retail release, harvest details, floral source, and jar formats have not been confirmed.",
    details: [
      "A future retail concept only; no honey stock, preorder, or harvest allocation is offered.",
      "The jar is an original illustration, not final packaging or a real product photograph.",
      "Sourcing, processing, net weight, labeling, and retail availability require approval before sale.",
    ],
    category: "honey",
    imageKey: "honey",
    kind: "concept",
    variants: [
      {
        key: "honey-concept",
        label: "Future format",
        priceMinor: null,
        currency: "USD",
      },
    ],
  },
  {
    key: "candle-collection",
    slug: "beeswax-candle",
    title: "Beeswax candle",
    summary:
      "A quieter moment at home. Candles are a planned collection direction, not current inventory.",
    details: [
      "Composition, fragrance, vessel, size, and safety instructions are not final.",
      "The artwork illustrates a possible package, not an actual available candle.",
      "Product development and safety/label review precede any sale.",
    ],
    category: "candles",
    imageKey: "candle",
    kind: "concept",
    variants: [
      {
        key: "candle-concept",
        label: "Planned format",
        priceMinor: null,
        currency: "USD",
      },
    ],
  },
];
