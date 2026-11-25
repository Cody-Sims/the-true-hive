// Generates live, truthful JSON-LD structured data & Agentic UX / SEO checks
// matching Google Search Central (July 2026) and web.dev/articles/ai-agent-site-ux.

import { siteMeta, products, pickupLocations } from "./data.mjs";

export function buildJsonLd(page, slug) {
  const baseOrg = {
    "@context": "https://schema.org",
    "@type": ["Organization", "LocalBusiness"],
    "@id": `${siteMeta.domain}/#business`,
    name: siteMeta.brand,
    url: siteMeta.domain,
    telephone: "+1-423-368-2262",
    email: siteMeta.email,
    description:
      "Small-batch handmade soaps with local pickup in Madisonville and Vonore, TN, plus no-cost honeybee colony rescue and farm pollination in Monroe, Blount, and Knox counties.",
    areaServed: [
      { "@type": "AdministrativeArea", name: "Monroe County, Tennessee" },
      { "@type": "AdministrativeArea", name: "Blount County, Tennessee" },
      { "@type": "AdministrativeArea", name: "Knox County, Tennessee" },
    ],
    address: {
      "@type": "PostalAddress",
      addressLocality: "Madisonville",
      addressRegion: "TN",
      addressCountry: "US",
    },
  };

  if (page === "product") {
    const product = products.find((p) => p.slug === slug) || products[0];
    return [
      baseOrg,
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${siteMeta.domain}/` },
          { "@type": "ListItem", position: 2, name: "Store", item: `${siteMeta.domain}/goods` },
          {
            "@type": "ListItem",
            position: 3,
            name: product.title,
            item: `${siteMeta.domain}/goods/${product.slug}`,
          },
        ],
      },
      {
        "@context": "https://schema.org",
        "@type": "ProductGroup",
        name: product.title,
        description: product.summary,
        brand: { "@type": "Brand", name: siteMeta.brand },
        productGroupID: product.key,
        variesBy: ["https://schema.org/size"],
        hasVariant: product.variants.map((v) => ({
          "@type": "Product",
          sku: v.key,
          name: `${product.title} — ${v.label}`,
          description: product.shortHook,
          offers: {
            "@type": "Offer",
            url: `${siteMeta.domain}/goods/${product.slug}?variant=${v.key}`,
            priceCurrency: "USD",
            price: (v.priceMinor / 100).toFixed(2),
            availability: "https://schema.org/InStock",
            itemCondition: "https://schema.org/NewCondition",
            availableDeliveryMethod:
              "http://purl.org/goodrelations/v1#DeliveryModePickUp",
            seller: { "@id": `${siteMeta.domain}/#business` },
          },
        })),
      },
    ];
  }

  if (page === "services") {
    return [
      baseOrg,
      {
        "@context": "https://schema.org",
        "@type": "Service",
        name: "No-Cost Honeybee Colony Rescue",
        serviceType: "Live Honeybee Removal & Relocation",
        provider: { "@id": `${siteMeta.domain}/#business` },
        areaServed: ["Monroe County, TN", "Blount County, TN", "Knox County, TN"],
        offers: {
          "@type": "Offer",
          price: "0.00",
          priceCurrency: "USD",
          description: "No-cost live honeybee relocation for homes and properties.",
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "Service",
        name: "East Tennessee Farm Pollination",
        serviceType: "Agricultural Honeybee Hive Rental & Pollination",
        provider: { "@id": `${siteMeta.domain}/#business` },
        areaServed: "East Tennessee",
        citation: siteMeta.scienceCitation.url,
      },
    ];
  }

  if (page === "goods") {
    return [
      baseOrg,
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "The True Hive Soap & Apiary Collection",
        url: `${siteMeta.domain}/goods`,
        mainEntity: {
          "@type": "ItemList",
          itemListElement: products.map((p, idx) => ({
            "@type": "ListItem",
            position: idx + 1,
            url: `${siteMeta.domain}/goods/${p.slug}`,
            name: p.title,
          })),
        },
      },
    ];
  }

  if (page === "cart") {
    return [
      baseOrg,
      {
        "@note":
          "Production /cart uses <meta name='robots' content='noindex, nofollow'> so checkout/cart pages stay out of Google Search index while pickup meetup details remain crawlable on /goods and /contact.",
        pickupMeetupPoints: pickupLocations.map((l) => `${l.name} (${l.street}, ${l.city}, ${l.region})`),
      },
    ];
  }

  return [baseOrg];
}

export function getPageSeoAudit(page) {
  const map = {
    home: {
      titleTag: "Handmade Beeswax Soap & Free Bee Rescue | Madisonville, TN | The True Hive",
      metaDesc:
        "Shop small-batch Coconut Milk & Vanilla Beeswax soaps ($10) with free US-411 pickup in Madisonville & Vonore, TN, plus $0 honeybee colony rescue in Monroe, Blount & Knox counties.",
      robots: "index, follow (FIXES current live noindex blocker!)",
      aiOverviewTargets: [
        "handmade soap Madisonville TN",
        "free honeybee removal Monroe Blount Knox County",
        "local beeswax soap East Tennessee",
      ],
      agentUxChecks: [
        "Semantic <header>, <nav>, <main>, <article>, <button>, <a href> hierarchy",
        "Primary CTA & Quick-Add controls have stable DOM positions & >=44px touch targets",
        "Zero transparent overlays blocking interactive elements (web.dev Agent UX rule)",
      ],
    },
    goods: {
      titleTag: "Shop Small-Batch Soaps ($10) | Local Pickup Madisonville TN | The True Hive",
      metaDesc:
        "Compare Coconut Milk Delight and The True Soap in 4oz Everyday Bars ($10) or Sculpted Wolf Molds ($12.50). Full ingredient transparency & $0 US-411 pickup.",
      robots: "index, follow (canonical /goods; noindex on ?q= search queries)",
      aiOverviewTargets: [
        "coconut milk teawood soap ingredients",
        "vanilla tonka bean beeswax soap TN",
        "sculpted wolf soap gift East Tennessee",
      ],
      agentUxChecks: [
        "In-stock products prioritized ahead of sold-out seasonal radar",
        "Variant buttons expose explicit aria-pressed state + clear accessible price labels",
        "Every product has crawlable <a href> link — not trapped behind JS-only search",
      ],
    },
    product: {
      titleTag: "Product Detail — Full Ingredients, Pricing & Pickup | The True Hive",
      metaDesc:
        "Compare 4oz Bar ($10) vs. Sculpted Wolf Mold ($12.50), read every saponified ingredient in plain English, and schedule $0 pickup in Madisonville or Vonore.",
      robots: "index, follow + ProductGroup/Offer JSON-LD matching visible price & stock",
      aiOverviewTargets: [
        "is lye left in cold process handmade soap",
        "what does coconut milk soap do for lather",
        "local soap pickup Madisonville TN",
      ],
      agentUxChecks: [
        "Predictable Add-to-Cart placement across all product pages (web.dev stable layout)",
        "Format radio/button group uses semantic labels + live price announcement",
        "Honest AI styling reference caption never obscures product CTAs",
      ],
    },
    services: {
      titleTag: "Free Honeybee Colony Rescue & Farm Pollination | East TN | The True Hive",
      metaDesc:
        "$0 no-cost live honeybee relocation in Monroe, Blount & Knox counties plus research-backed farm pollination (+24% median yield-gap closure in Science). Call (423) 368-2262.",
      robots: "index, follow + dual Service JSON-LD with $0 offer & Science DOI citation",
      aiOverviewTargets: [
        "free honeybee swarm removal Monroe County TN",
        "honeybee vs wasp how to tell safely",
        "do honeybees increase small farm crop yields",
      ],
      agentUxChecks: [
        "Interactive Honeybee vs Wasp helper uses semantic <button> + aria-live result region",
        "Direct tel:+14233682262 links with clear human-readable phone text",
        "Call-prep checklists structured as clean <ul> lists for fast LLM/agent extraction",
      ],
    },
    about: {
      titleTag: "About The True Hive | Madisonville TN Soap Makers & Beekeepers",
      metaDesc:
        "First-hand beekeeping and small-batch soap-making in Madisonville, Tennessee — connecting everyday bars, live colony rescue, and local farm pollination.",
      robots: "index, follow (E-E-A-T first-hand local experience page)",
      aiOverviewTargets: [
        "who owns The True Hive Madisonville TN",
        "East Tennessee beekeepers who make soap",
      ],
      agentUxChecks: [
        "First-hand local facts, county coverage, and real contact paths clearly linked",
        "No fabricated history, fake storefront hours, or generic AI filler prose",
      ],
    },
    cart: {
      titleTag: "Your Cart & Free US-411 Pickup | The True Hive",
      metaDesc:
        "Review your soap selections and pick a convenient US-411 meetup point in Madisonville or Vonore, Tennessee.",
      robots: "noindex, nofollow (transactional surface kept out of search index)",
      aiOverviewChecks: [],
      agentUxChecks: [
        "Explicit <label for> on meetup point selector and quantity controls",
        "Live subtotal updates announced via role='status' for assistive tech & agents",
        "Honest test-checkout boundary prevents accidental real-payment assumptions",
      ],
    },
    contact: {
      titleTag: "Contact The True Hive | Call (423) 368-2262 | Madisonville, TN",
      metaDesc:
        "Call (423) 368-2262 for no-cost honeybee rescue, farm pollination, or local soap questions, or prepare an email draft to loganstakely18@gmail.com.",
      robots: "index, follow",
      aiOverviewTargets: [
        "The True Hive phone number Madisonville TN",
        "how to schedule honeybee removal East Tennessee",
      ],
      agentUxChecks: [
        "Every form input paired with explicit <label for> and clear mailto disclosure",
        "No false 'form submitted' messaging — clearly prepares client email draft",
      ],
    },
  };
  return map[page] || map.home;
}
