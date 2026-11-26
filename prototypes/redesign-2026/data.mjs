// Shared verified content & 5 distinct customer-facing brand prototypes for The True Hive.
// Prototype 01 combines Golden Direct (Light) + Apothecary Noir (Dark) with OS prefers-color-scheme + manual toggle.
// Prototypes 02–05 each deliver a genuinely distinct, real-world DTC/brand aesthetic, layout, and conversion psychology.

export const siteMeta = {
  brand: "The True Hive",
  city: "Madisonville, Tennessee",
  region: "East Tennessee",
  counties: ["Monroe", "Blount", "Knox"],
  phone: "(423) 368-2262",
  phoneHref: "tel:+14233682262",
  email: "loganstakely18@gmail.com",
  pickupVehicle: "2018 Nissan Altima",
  domain: "https://thetruehive.com",
  scienceCitation: {
    label: "2016 study in Science",
    url: "https://doi.org/10.1126/science.aac7287",
    stat: "24%",
    detail:
      "Across 33 pollinator-dependent crop systems, increased pollinator visits closed crop yield gaps by a median of 24% on fields smaller than 2 hectares (about 5 acres).",
  },
  safetyNote:
    "Give bees space. Do not disturb a colony or approach it for a photograph.",
};

export const pickupLocations = [
  {
    key: "weigels-vonore",
    name: "Weigel's — Vonore",
    shortName: "Weigel's",
    town: "Vonore",
    street: "2031 US-411",
    city: "Vonore",
    region: "TN",
    postalCode: "37885",
    mileNote: "North end of US-411",
  },
  {
    key: "dunkin-madisonville",
    name: "Dunkin' — Madisonville",
    shortName: "Dunkin'",
    town: "Madisonville",
    street: "4529 US-411",
    city: "Madisonville",
    region: "TN",
    postalCode: "37354",
    mileNote: "Central Madisonville US-411",
  },
  {
    key: "pizza-hut-madisonville",
    name: "Pizza Hut — Madisonville",
    shortName: "Pizza Hut",
    town: "Madisonville",
    street: "4629 US-411 Ste 12",
    city: "Madisonville",
    region: "TN",
    postalCode: "37354",
    mileNote: "South Madisonville US-411",
  },
];

export const ingredientNotes = {
  "Avocado Oil": "Rich, conditioning plant oil that leaves skin feeling soft.",
  "Coconut Oil": "Creates a dense, bubbly, thoroughly cleansing lather.",
  "Distilled Water": "Pure base used to dissolve lye cleanly during saponification.",
  "Coconut Milk": "Adds creamy cushion and silky slip to every wash.",
  Lye: "Used to turn oils into true soap — completely transformed during curing so zero lye remains in the finished bar.",
  "Shea Butter": "Adds rich creaminess and a smooth, comforting finish.",
  "Mango Butter": "Lightweight plant butter that supports a firm, long-lasting bar.",
  "Castor Oil": "Locks in creamy, stable lather bubbles.",
  "Sweet Almond Oil": "Gentle conditioning oil prized for a smooth glide.",
  "Palm Oil": "Gives the bar lasting hardness so it holds up well in the soap dish.",
  "Local Beeswax":
    "Straight from the beekeeping side of The True Hive — adds natural firmness and subtle golden warmth (cleaned from 'Beeswax ;)' on the live site).",
};

export const products = [
  {
    slug: "coconut-milk-delight",
    key: "coconut-milk-delight",
    category: "soap",
    categoryLabel: "Small-Batch Soap",
    status: "in-stock",
    badge: "Creamiest Lather",
    title: "Coconut Milk Delight",
    scentLine: "Warm Teawood & Creamy Coconut Milk",
    scentNotes: ["Warm Teawood", "Rich Coconut Milk", "Shea & Mango Butter"],
    meters: { richness: 95, warmth: 78, firmness: 84 },
    shortHook:
      "A Teawood-scented coconut milk bar crafted with shea and mango butter for a dense, luxurious lather.",
    summary:
      "A Teawood scented soap made with coconut milk to give a luxurious lather.",
    story:
      "Built around coconut milk, avocado oil, sweet almond oil, and both shea and mango butters, Coconut Milk Delight pairs crisp warm Teawood notes with a cushiony lather made for everyday sinks and showers.",
    whyTwoFormats:
      "Choose the classic 4oz Everyday Bar ($10) for daily washes, or the Sculpted Wolf Mold ($12.50) for a memorable local gift.",
    details: [
      "Format options: Everyday 4oz Bar ($10.00) or Sculpted Wolf Mold ($12.50)*",
      "Hand-poured in small batches in Madisonville, Tennessee",
      "Free local pickup along US-411 in Madisonville or Vonore ($0 shipping)",
      "Cosmetic-honest formula: true cleansing soap with no medical claims",
    ],
    weightAuditNote:
      "*Owner check: live site labels Wolf Mold '1oz' while URL slug reads '4oz-wolf' — verify cured weight before live launch.",
    ingredients: [
      "Avocado Oil",
      "Coconut Oil",
      "Distilled Water",
      "Coconut Milk",
      "Lye",
      "Shea Butter",
      "Mango Butter",
      "Castor Oil",
      "Sweet Almond Oil",
    ],
    variants: [
      {
        key: "coconut-milk-delight-4oz-single",
        shortLabel: "4oz Everyday Bar",
        label: "Single 4oz Bar",
        roleTag: "Best for daily use",
        priceMinor: 1000,
        image: "../next/assets/soap-delight-bar.webp",
        small: "../next/assets/soap-delight-bar-small.webp",
        alt: "AI styling reference of Coconut Milk Delight ivory soap bar.",
      },
      {
        key: "coconut-milk-delight-4oz-wolf",
        shortLabel: "Sculpted Wolf Mold",
        label: "Sculpted Wolf Mold",
        roleTag: "Artisan gift shape",
        priceMinor: 1250,
        image: "../next/assets/soap-delight-wolf.webp",
        small: "../next/assets/soap-delight-wolf-small.webp",
        alt: "AI styling reference of Coconut Milk Delight ivory wolf-shaped soap mold.",
      },
    ],
  },
  {
    slug: "the-true-soap",
    key: "the-true-soap",
    category: "soap",
    categoryLabel: "Signature Soap",
    status: "in-stock",
    badge: "The Original Bar",
    title: "The True Soap",
    scentLine: "Warm Vanilla, Tonka Bean & Local Beeswax",
    scentNotes: ["Warm Vanilla", "Toasted Tonka Bean", "Local Beeswax"],
    meters: { richness: 82, warmth: 94, firmness: 92 },
    shortHook:
      "The warm vanilla and tonka bean bar with beeswax that started The True Hive.",
    summary:
      "A vanilla and tonka bean soap. This simple soap is what started it all for us and acts as the inspiration for a lot of our soaps.",
    story:
      "Our signature recipe brings soap-making and beekeeping into a single bar. Warm vanilla and tonka bean meet simple plant oils and real beeswax — the original inspiration behind every bar we pour in Madisonville.",
    whyTwoFormats:
      "Pick the 4oz Everyday Bar ($10) for daily use, or grab the Sculpted Wolf Mold ($12.50) as a standout East Tennessee gift.",
    details: [
      "Format options: Everyday 4oz Bar ($10.00) or Sculpted Wolf Mold ($12.50)*",
      "Made with real beeswax from our beekeeping roots",
      "Free local pickup along US-411 in Madisonville or Vonore ($0 shipping)",
      "Simple, readable 7-ingredient recipe — zero synthetic fluff",
    ],
    weightAuditNote:
      "*Owner check: 'Beeswax ;)' cleaned to 'Local Beeswax' and Wolf Mold weight flagged for confirmation.",
    ingredients: [
      "Avocado Oil",
      "Distilled Water",
      "Palm Oil",
      "Coconut Oil",
      "Lye",
      "Castor Oil",
      "Local Beeswax",
    ],
    variants: [
      {
        key: "the-true-soap-4oz-single",
        shortLabel: "4oz Everyday Bar",
        label: "Single 4oz Bar",
        roleTag: "Our original recipe",
        priceMinor: 1000,
        image: "../next/assets/soap-true-bar.webp",
        small: "../next/assets/soap-true-bar-small.webp",
        alt: "AI styling reference of The True Soap warm beige soap bar.",
      },
      {
        key: "the-true-soap-4oz-wolf",
        shortLabel: "Sculpted Wolf Mold",
        label: "Sculpted Wolf Mold",
        roleTag: "Artisan gift shape",
        priceMinor: 1250,
        image: "../next/assets/soap-true-wolf.webp",
        small: "../next/assets/soap-true-wolf-small.webp",
        alt: "AI styling reference of The True Soap warm beige wolf-shaped soap mold.",
      },
    ],
  },
];

export const seasonalRadar = [
  {
    slug: "wildflower-honey",
    category: "honey",
    title: "Wildflower Honey",
    format: "Single 3-pound jar",
    priceLabel: "$15.00",
    statusLabel: "Sold out / Seasonal harvest",
    note: "Current harvest is allocated. Kept honestly on our seasonal radar rather than taking fake preorders.",
  },
  {
    slug: "nile-crocodile",
    category: "candles",
    title: "Nile Crocodile",
    format: "Single 10oz candle",
    priceLabel: "$10.00",
    statusLabel: "Sold out / Next batch",
    note: "Currently sold out. Ask via Contact if you’d like a heads-up when candles return.",
  },
];

export const faqs = [
  {
    category: "services",
    q: "Is honeybee colony rescue really free in Monroe, Blount, and Knox counties?",
    a: "Yes. The True Hive provides no-cost ($0) live honeybee relocation for homes and properties across Monroe, Blount, and Knox counties in East Tennessee. Call (423) 368-2262 with your address, where the hive sits on the property, and a good time to visit.",
  },
  {
    category: "soap",
    q: "Your soap ingredients list lye — is there lye left in the finished bar?",
    a: "No. Lye is required to turn plant oils and butters into true soap through saponification. Once cured, zero lye remains in the finished bar — only gentle soap and naturally occurring glycerin.",
  },
  {
    category: "pickup",
    q: "How does local pickup work in Madisonville and Vonore?",
    a: "Online orders are handed off for $0 shipping at three convenient US-411 meetup spots: Dunkin' (4529 US-411, Madisonville), Pizza Hut (4629 US-411 Ste 12, Madisonville), or Weigel's (2031 US-411, Vonore). Wait for your confirmed time window and look for a 2018 Nissan Altima.",
  },
  {
    category: "services",
    q: "How much can farm pollination improve crop yields?",
    a: "A 2016 study published in Science across 33 pollinator-dependent crop systems found that increased pollinator visits closed crop yield gaps by a median of 24% on fields smaller than 2 hectares (about 5 acres). We inspect your land, crops, and timing to recommend the right hive count.",
  },
  {
    category: "soap",
    q: "Why are some product photos labeled 'AI styling reference'?",
    a: "We believe in complete honesty: while we photograph every final soap batch and mold, our current soap visuals are clearly marked AI styling references. Real ingredient lists, prices, and pickup details are 100% factual.",
  },
];

export const beeIdSteps = [
  {
    id: "body",
    question: "Look safely from a distance (do not approach or spray). What does the insect look like?",
    options: [
      {
        label: "Fuzzy, golden-brown & amber stripes, plump body",
        result: "honeybee",
        title: "Likely Honeybees — We Can Rescue Them for $0",
        detail:
          "Fuzzy golden-brown bodies and calm clustering on a branch, wall, or shed usually point to honeybees. Do not spray or disturb them — call (423) 368-2262 for no-cost live relocation in Monroe, Blount, or Knox County.",
      },
      {
        label: "Smooth/shiny bright yellow & black, narrow pinched waist",
        result: "wasp",
        title: "Likely Wasps, Yellowjackets, or Hornets",
        detail:
          "Smooth, hairless bright yellow-and-black insects with narrow waists or paper nests are typically wasps or yellowjackets rather than honeybees. Give them wide space; honeybee rescuers only relocate honeybees.",
      },
      {
        label: "Not sure — I just see buzzing or insects entering a wall",
        result: "unsure",
        title: "Play It Safe — Give Us a Quick Call",
        detail:
          "Stay back and do not approach for a close-up photo. Call (423) 368-2262 and describe where they are and how they behave so we can help you figure out the safest next step.",
      },
    ],
  },
];

export const prototypes = [
  {
    id: "golden-apothecary",
    number: "01",
    name: "Golden Apothecary",
    subtitle: "Golden Direct (Light) ↔ Apothecary Noir (Dark)",
    tagline: "Selected Direction — Product-First, Adaptive Light & Dark",
    swatchesLight: ["#FFFBF4", "#C46806", "#1F1711", "#1F5C3E"],
    swatchesDark: ["#111210", "#E8AE42", "#F5EFE4", "#242721"],
    psychology: [
      "Product-first hero with stocked soap photography, clear prices, and no adjacent bee imagery",
      "Adaptive Light/Dark Halo Effect: sunlit honey warmth by day, luxury obsidian apothecary by night (follows user OS settings automatically)",
      "Cinematic Craft-inspired per-recipe sensory profiles on home, shop, and product pages (illustrative preview scores, not lab measurements)",
      "Product-focused trust strip, separate lower bee rescue and pollination section, and complete bottom FAQ",
    ],
    seoFocus: "Balanced Google Merchant Listing + LocalBusiness + ProductGroup visibility with effortless scannability.",
    bestFor: "The exact Golden Direct / Apothecary Noir aesthetic you liked, unified with OS auto-switching.",
  },
  {
    id: "story-flagship",
    number: "02",
    name: "Cinematic Craft",
    subtitle: "Full-Bleed Atmospheric Hero & Sensory Rituals",
    tagline: "Flamingo Estate / Aesop-Inspired Tactile Luxury",
    swatchesLight: ["#F8F4EC", "#2E4739", "#C57A25", "#1F2620"],
    swatchesDark: ["#121814", "#D8A44E", "#EFEAE0", "#1C251F"],
    psychology: [
      "Sensory Transportation: Full-bleed atmospheric honeycomb hero immerses visitors in 2 seconds",
      "Mental Simulation & Tactile Framing: Visual Scent & Lather meters (Richness / Warmth / Beeswax) help shoppers 'feel' each bar online",
      "Soft Botanical Arch Framing elevates $10 bars & $12.50 Wolf Molds into artisanal gifts",
      "Calm Dual-Purpose Storytelling connects soap craft directly to rescuing live colonies",
    ],
    seoFocus: "High engagement & dwell time paired with rich sensory descriptors that fuel AI Overview summaries.",
    bestFor: "Emotional storytelling, luxury artisan positioning, and making a $10–$12.50 bar feel unforgettable.",
  },
  {
    id: "modern-dtc",
    number: "03",
    name: "Modern DTC",
    subtitle: "High-Velocity Conversion & One-Tap Pickup Pair",
    tagline: "Dr. Squatch / Allbirds-Inspired Sales Engine",
    swatchesLight: ["#FFFFFF", "#E07A12", "#141414", "#186442"],
    swatchesDark: ["#0E0F11", "#F5A623", "#F7F7F5", "#27A06A"],
    psychology: [
      "Pattern-Interrupt Hook & Bundle Anchoring: Interactive 'Grab Both Scents ($20)' 1-click Local Pickup Pair increases average order value honestly (zero fake discounts)",
      "Loss Aversion & Contrast Framing: Visual 'What’s Inside vs. Never Inside' strip dismantles grocery-soap skepticism fast",
      "Zero-Friction Thumb UX: Bold modern sans typography, oversized contrast buttons, and immediate Add-to-Cart",
      "Zero-Price Effect Banner puts $0 Honeybee Colony Rescue front and center",
    ],
    seoFocus: "Built for high-intent commercial clicks, clean comparison signals, and rapid mobile Core Web Vitals.",
    bestFor: "Maximum sales velocity, raising average order size ($10 → $20 pairs), and punchy modern energy.",
  },
  {
    id: "local-hearth",
    number: "04",
    name: "East TN Hearth",
    subtitle: "Neighbor-First Dual Doorway & Visual US-411 Route",
    tagline: "Grounded Farmstead Warmth & Local Trust",
    swatchesLight: ["#FAF6EE", "#1E4635", "#BA4324", "#D99226"],
    swatchesDark: ["#121A16", "#E5A948", "#F3EDE2", "#D96645"],
    psychology: [
      "In-Group & Proximity Bias: Immediately anchors Madisonville, Vonore, Monroe, Blount & Knox counties so local visitors feel 'this is my neighbor'",
      "Dual-Doorway Hick’s Law Clarity: Side-by-side cards let Soap Buyers and Bee-Rescue Homeowners self-route in 2 seconds",
      "Risk Reversal Visual US-411 Corridor: Shows Weigel’s → Dunkin’ → Pizza Hut as a friendly visual route strip to eliminate pickup hesitation",
      "Community Trust Flywheel: $0 Colony Rescue builds massive goodwill that feeds soap word-of-mouth",
    ],
    seoFocus: "Engineered to dominate local East Tennessee Google Search, Google Business Profile, and 'near me' AI Overviews.",
    bestFor: "Winning local East Tennessee trust and converting both soap shoppers and bee-rescue/farm callers.",
  },
  {
    id: "gallery-minimal",
    number: "05",
    name: "Studio Minimal",
    subtitle: "Gallery Whitespace, Processing Fluency & Live Stage",
    tagline: "Le Labo / Apple-Inspired Calm Precision",
    swatchesLight: ["#FCFCFA", "#181816", "#A8640C", "#ECEBE4"],
    swatchesDark: ["#111110", "#F3F2EC", "#E5AF4F", "#1D1D1A"],
    psychology: [
      "Cognitive Processing Fluency (Reber, Schwarz & Winkielman): Ultra-clean whitespace makes every claim feel effortlessly trustworthy and high-craft",
      "Focal Isolation & Sculptural Stage: Oversized interactive product stage swaps Bar ($10) ↔ Wolf Mold ($12.50) seamlessly with zero clutter",
      "Framing Effect: Gallery presentation turns an affordable $10 handmade bar into an immediate 'must-try' bargain",
      "Agentic Browser UX Purity (web.dev): Crystal-clear semantic hierarchy & predictable controls",
    ],
    seoFocus: "Fastest visual comprehension, clean Accessibility Tree for AI browser agents, and crisp structured data.",
    bestFor: "Timeless modern restraint where the soaps, bees, and honest ingredients speak for themselves.",
  },
];

export function formatMoney(minor) {
  return `$${(minor / 100).toFixed(2)}`;
}
