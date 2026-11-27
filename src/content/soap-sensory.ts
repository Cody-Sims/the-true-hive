const profiles = {
  "coconut-milk-delight": {
    category: "Small-Batch Soap",
    badge: "Creamiest Lather",
    hook: "A Teawood-scented coconut milk bar crafted with shea and mango butter for a dense, luxurious lather.",
    story:
      "Built around coconut milk, avocado oil, sweet almond oil, and both shea and mango butters, Coconut Milk Delight pairs crisp warm Teawood notes with a cushiony lather made for everyday sinks and showers.",
    notes: ["Warm Teawood", "Rich Coconut Milk", "Shea & Mango Butter"],
    scores: [95, 78, 84],
  },
  "the-true-soap": {
    category: "Signature Soap",
    badge: "The Original Bar",
    hook: "The warm vanilla and tonka bean bar with beeswax that started The True Hive.",
    story:
      "Our signature recipe brings soap-making and beekeeping into a single bar. Warm vanilla and tonka bean meet simple plant oils and real beeswax - the original inspiration behind every bar we pour in Madisonville.",
    notes: ["Warm Vanilla", "Toasted Tonka Bean", "Local Beeswax"],
    scores: [82, 94, 92],
  },
} as const;

export function soapSensoryProfile(key: string) {
  return Object.hasOwn(profiles, key)
    ? profiles[key as keyof typeof profiles]
    : null;
}
