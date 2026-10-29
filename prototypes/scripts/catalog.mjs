export const products = [
  {
    key: "seasonal-honey",
    title: "Seasonal honey",
    category: "honey",
    eyebrow: "For the table",
    image: "assets/honey-jar.svg",
    tone: "amber",
    description: "A first look at a future pantry staple. The harvest, floral source, processing, and jar format will be confirmed with the real product.",
    details: ["Illustrative honey product, not an actual harvest offer.", "Sample jar sizes and prices are for design review only.", "Real sourcing, net weight, label, and food-safety details require approval."],
    variants: [
      { id: "honey-12", label: "12 oz concept jar", sku: "DEMO-HNY-12", priceMinor: 1400, currency: "USD" },
      { id: "honey-24", label: "24 oz concept jar", sku: "DEMO-HNY-24", priceMinor: 2400, currency: "USD" },
    ],
  },
  {
    key: "honey-oat-soap",
    title: "Honey + oat soap",
    category: "body",
    eyebrow: "For the daily ritual",
    image: "assets/soap.svg",
    tone: "sage",
    description: "A tactile idea for the collection, with honey-and-oat-inspired packaging. The actual formula, ingredients, weight, and labeling are not final.",
    details: ["Concept formula and packaging; not a skin-care or health claim.", "Ingredients and safe-use information will be approved before sale.", "No fragrance, allergen, or suitability promise is made here."],
    variants: [
      { id: "soap-bar", label: "One concept bar", sku: "DEMO-SOAP-01", priceMinor: 800, currency: "USD" },
    ],
  },
  {
    key: "beeswax-candle",
    title: "Beeswax candle",
    category: "candles",
    eyebrow: "For a quieter evening",
    image: "assets/candle.svg",
    tone: "blush",
    description: "A candle concept for slower moments. Wax composition, fragrance, vessel, and burn instructions are still to be developed.",
    details: ["Original packaging illustration, not a real candle photograph.", "Small and large are provisional formats, not approved burn times.", "Composition, fire-safety labeling, and instructions require owner approval."],
    variants: [
      { id: "candle-small", label: "Small concept vessel", sku: "DEMO-CND-S", priceMinor: 1800, currency: "USD" },
      { id: "candle-large", label: "Large concept vessel", sku: "DEMO-CND-L", priceMinor: 2800, currency: "USD" },
    ],
  },
  {
    key: "hive-gift-set",
    title: "The hive gift set",
    category: "gifts",
    eyebrow: "A thoughtful collection",
    image: "assets/gift-set.svg",
    tone: "stone",
    description: "Honey, soap, and candle ideas brought together in one future collection. Contents, packaging, bundle stock, and price are provisional.",
    details: ["Sample gift collection, not a reserved or shippable item.", "Bundle component stock must be resolved before real sales.", "The sold-out demo state is intentional; it does not describe the business."],
    variants: [
      { id: "gift-set", label: "Concept gift collection", sku: "DEMO-GIFT-01", priceMinor: 3600, currency: "USD" },
    ],
  },
  {
    key: "whipped-honey",
    title: "Whipped honey",
    category: "honey",
    eyebrow: "Another way to savor",
    image: "assets/honey-jar.svg",
    tone: "cream",
    description: "A possible future honey variation. The process, ingredients, texture, packaging, and food labeling are not approved product facts.",
    details: ["A merchandising concept, not a promise of production.", "The image is shared concept packaging, not a texture photograph.", "Harvest and product specifications remain an owner decision."],
    variants: [
      { id: "whipped-jar", label: "Concept jar", sku: "DEMO-WHP-01", priceMinor: 1600, currency: "USD" },
    ],
  },
  {
    key: "honey-balm",
    title: "Hive balm",
    category: "body",
    eyebrow: "A small everyday idea",
    image: "assets/balm.svg",
    tone: "lavender",
    description: "A small-format balm idea for a future collection. Formula, product category, ingredients, and intended use require approval before merchandising.",
    details: ["No therapeutic, protective, or skin-treatment claim.", "Sample package and price, not an approved cosmetic.", "Real safe-use and ingredient information must precede sale."],
    variants: [
      { id: "balm-tin", label: "Concept tin", sku: "DEMO-BALM-01", priceMinor: 600, currency: "USD" },
    ],
  },
];

export const scenarios = [
  { id: "normal", label: "Normal sample inventory" },
  { id: "last-jar", label: "12 oz honey: one sample jar left" },
  { id: "sold-out", label: "12 oz honey: sold out in demo" },
  { id: "offline", label: "Inventory service unavailable" },
];

const locations = [
  { id: "fulfillment", name: "Demo pickup stock", channels: ["pickup"] },
  { id: "market", name: "Demo market stock", channels: [] },
];

const baseLevels = [
  { variantId: "honey-12", locationId: "fulfillment", onHand: 8, committed: 2, unavailable: 0, available: 6 },
  { variantId: "honey-12", locationId: "market", onHand: 9, committed: 0, unavailable: 0, available: 9 },
  { variantId: "honey-24", locationId: "fulfillment", onHand: 4, committed: 1, unavailable: 0, available: 3 },
  { variantId: "soap-bar", locationId: "fulfillment", onHand: 15, committed: 2, unavailable: 1, available: 12 },
  { variantId: "candle-small", locationId: "fulfillment", onHand: 6, committed: 1, unavailable: 0, available: 5 },
  { variantId: "candle-large", locationId: "fulfillment", onHand: 2, committed: 1, unavailable: 1, available: 0 },
  { variantId: "gift-set", locationId: "fulfillment", onHand: 0, committed: 0, unavailable: 0, available: 0 },
  { variantId: "whipped-jar", locationId: "fulfillment", onHand: 8, committed: 1, unavailable: 0, available: 7 },
  { variantId: "balm-tin", locationId: "fulfillment", onHand: 12, committed: 1, unavailable: 1, available: 10 },
];

export function createSnapshot(scenario = "normal") {
  if (!scenarios.some((entry) => entry.id === scenario)) {
    throw new RangeError("Unknown demo inventory scenario.");
  }
  const levels = baseLevels.map((level) => {
    const copy = { ...level };
    if (level.variantId === "honey-12" && level.locationId === "fulfillment") {
      if (scenario === "last-jar") Object.assign(copy, { onHand: 3, available: 1 });
      if (scenario === "sold-out") Object.assign(copy, { onHand: 2, available: 0 });
    }
    return copy;
  });
  return {
    status: scenario === "offline" ? "unavailable" : "ready",
    scenario,
    locations: locations.map((location) => ({ ...location, channels: [...location.channels] })),
    levels,
  };
}

export function findVariant(variantId, catalog = products) {
  for (const product of catalog) {
    const variant = product.variants.find((entry) => entry.id === variantId);
    if (variant) return { product, variant };
  }
  return null;
}

export function formatMoney(minor, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100);
}
