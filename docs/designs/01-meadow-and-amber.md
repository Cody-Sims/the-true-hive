# Concept 01: Meadow & Amber

[Open prototype](../../prototypes/meadow.html) | [Store preview](../../prototypes/store.html?design=meadow) | [Planning hub](../../prototypes/plan.html?doc=design01)

## Design thesis

A neighborly, editorial brand can make beekeeping services and honey-related goods feel like parts of the same local story. Warmth should never make the next service action hard to find.

**Balanced visual hypothesis**, not an approved identity or conversion winner. Product-led directions deserve equal consideration under the owner's clarified local-sales priority; Fieldwork can still inform concise service wording.

## Visual system

| Element | Direction |
|---|---|
| Paper | `#fbf6e9` |
| Main ink | `#293d30` |
| Secondary text | `#61684f` |
| Amber accent | `#ebbd57`; use dark text over it |
| Display type | Georgia/system serif, expressive but legible |
| Body type | Arial/Helvetica/system sans; no remote font dependency |
| Shape | Arch-shaped field illustration, modest borders, restrained rounding |
| Imagery | Original landscape/apiary + packaging illustrations now; actual people, safe working scenes and real products later |

Colors are design tokens, not blanket accessibility certification; inspect each actual combination. No ornamental honeycomb background, mascot overload or motion is needed.

## Composition and wireframe

```text
Wordmark                         Store / Beekeeping / Story / Connect
Madisonville                     Arched field + honey illustration
Good things from the hive.
Made for everyday.
[Preview the store] [Need a beekeeper?]
---------------- local context ribbon ----------------
Beekeeping: [Removal]             [Farm pollination]
Goods:      [Honey]               [Soap]               [Candle]
---------------- dark local-story chapter ----------------
Around the hive / social         Contact-preview panel
Footer / cross-concept navigation
```

This balanced composition keeps services before its home-page product showcase, but the primary hero action now enters the coordinated store. Test whether that balance underweights the product-first objective rather than assuming it is optimal.

## Prototype behavior and boundaries

Home links reach real sections or the coordinated collection/product/cart preview. The contact section does not pretend a message was sent. Social accounts are pending. Home products/art are concepts; the shared store adds explicitly fictional prices/stock and a read-only checkout handoff, never payment or an order. Retail honey release remains unconfirmed.

Mobile stacks copy before illustration, service cards before goods, and makes buttons wrap naturally. Navigation remains visible. Important interactions require no JavaScript; there are no hover-only elements.

## Why this direction is grounded in research

Appalachian Bee connects honey and other hive goods to a production story. Big Island Bees pairs provenance with distinct visitor paths. Those are **content patterns**, not evidence that these exact colors or arches outperform alternatives. See [research](../01-market-and-design-research.md).

## Tradeoffs

| Advantage | Risk / mitigation |
|---|---|
| Balances products, services and place | Large story/illustration can delay action; preserve service CTA and early service section |
| Approachable without looking like an exterminator | Could feel generic if only illustrated; replace with real owner/apiary context |
| Extends naturally to product packaging/catalog | Do not let future merchandising displace removal/pollination routes |

## Production translation

Implement the selected composition as the small components in [architecture](../03-architecture.md), not a copy-paste of the prototype page. Move approved business facts into typed content. Retain the illustration style only if the owner wants it; it does not substitute for evidence of the actual operation.

## Shared evaluation rubric

Use this rubric for **all ten concepts**, first shortlisting 2-3 with the owners. Give 5-8 local prospects/current soap buyers a rotated subset, not ten exhausting full reviews. Include secondary service tasks where practical; results are formative, not statistically representative.

| Criterion | Weight | Observable question |
|---|---|---|
| Product discovery and clarity | 30% | Can the person find soap, understand the format/material information and choose a sample variant? |
| Pickup and commercial honesty | 25% | Can they explain the intended pickup process and distinguish fictional stock/price/cart from a real order? |
| Mobile/accessibility usability | 20% | Can they navigate, read, recover from unavailable stock and use the flows at narrow width/zoom/keyboard? |
| Brand and local fit | 15% | Does the look fit the actual business/products and identify Madisonville without invented claims? |
| Secondary service findability | 10% | Can they find removal/pollination information and understand assessment rather than booking? |

Score each 1-5 using recorded task evidence; weights are an explicit proposal, not scientific market weights. Compare comments and failures as well as totals. A high visual score does not override an inaccessible flow or a misleading purchase expectation.

**Approval needed:** selected direction, story/tone, real contact/social URLs, imagery, service scope and product status.

## Future SEO intent

Use one selected public direction with real product/collection pages, crawlable links, useful local context and accurate metadata. The ten review versions remain noindex; no sample offer/rating markup. Real soaps and pickup details must replace concepts before merchandising, and an allocated future harvest is not retail honey inventory.
