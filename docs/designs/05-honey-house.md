# Concept 05: Honey House

[Open homepage](../../prototypes/honeyhouse.html) | [Store preview](../../prototypes/store.html?design=honeyhouse) | [Project and business plan](../../prototypes/plan.html) | [Comparison gallery](../../prototypes/index.html)

## Thesis

Treat a small product range with the clarity of a contemporary product studio:
simple hierarchy, architectural whitespace, honest material notes, and useful
collection links. Lead with goods for ordinary routines, not services or a
luxury price signal.

**Honey House is a visual direction, not a physical shop, showroom, or invitation
to visit.** The bento still life is original illustrative artwork, not a real
interior or packaging photograph. Soap has an intentionally prominent role
because local soap sales are the practical starting point; honey and candles
remain visible collection directions.

## Owner context: planning-only boundary

The small-scale, owner-made soap operation informs this internal design
priority; it is not approved public marketing copy. Soap is the most grounded
near-term product, candles remain planned, and consumer honey is a future retail
concept only. No real honey stock, preorder, or harvest allocation is offered.
Future harvest or B2B commitments are not consumer inventory. Keep operational
scale, production claims, and partnership context out of the homepage until
separately approved.

## Palette, type, and graphic language

| Role | Choice and application |
|---|---|
| Paper | `#f5f4ef`, calm main surface |
| Ink | `#202b29`, headings, body copy, primary action, contact chapter |
| Clay | `#b6522b`, one hero tile and selected display accents |
| Stone | `#ded8ce`, architectural art ground and pickup chapter |
| Display | System sans, normal weight, tight but readable spacing |
| Body | Arial/Helvetica/system sans; no remote fonts |
| Identity device | Four square modules, precise rules, indexed category navigation |
| Art | Asymmetric rectangular plinths, restrained shadows, original product still life |

No plum, ornamental apothecary frame, luxurious rounded product stage, or
service-dashboard styling is used. The result should feel like a practical
small contemporary maker, not a disguised version of Hearth or Fieldwork.

Calculated solid-color ratios: ink/paper approximately **13.25:1**, ink/stone
**10.30:1**, clay/paper **4.51:1**. Clay/paper is close to the normal-text
threshold: do not lighten the clay, apply text opacity, or change that tile's
paper text without rechecking contrast.

## Unique wireframe

```text
Explicit review bar / Project plan / Comparison gallery
Modular wordmark              Collection / Pickup / Maker / Beekeeping / Contact

Large two-line sans headline             Intro + store-preview action
Eight-column architectural still life    Four-column clay soap-preview tile
Image caption                             Product preview link

Horizontal category rail: The collection | Honey | Soap | Candles
Collection introduction
Large soap feature                       Compact honey product row
Large soap feature, continued            Compact candle product row

Stone pickup chapter: label | heading | factual pickup explanation
Three thin-rule numbered steps across the page

Maker monogram / portrait placeholder     Owner-story copy, explicitly provisional
Beekeeping introduction                  Two native disclosure assessment paths
Dark contact chapter                     Pending direct contacts / social profiles
Review footer / Gallery / Brief / Project plan / Store
```

The hierarchy is a deliberately asymmetric bento, followed by a horizontal
category rail and an unequal product arrangement. Its distinction depends on
space and proportion, not a recolor of a symmetric storefront.

## Customer acquisition rationale: a testable hypothesis

The [existing research](../01-market-and-design-research.md) observes recognizable
product families at established merchants and making/provenance stories at
Appalachian Bee and Big Island Bees. It does not show that minimalist design
improves conversion or that Madisonville shoppers prefer this aesthetic.

**Hypothesis:** a local buyer arriving from a product photograph, verified
social link, or an owner-shared soap link will find a focused, comprehensible
range without navigating a large merchant menu. The product studio can help
people inspect what a product is, while the pickup chapter answers the practical
next question.

Use the [shared evaluation rubric](01-meadow-and-amber.md#shared-evaluation-rubric).
Ask reviewers to find the soap, explore its full preview, and explain how pickup
would be arranged. Also ask whether "Honey House" suggests a public shop. Test
whether the category rail is understood as navigation rather than decoration.
These are formative tasks, not a fabricated demand study or a sales forecast.

## Coordinated collection-to-cart journey

Use **`design=honeyhouse`** throughout the shared commerce surfaces.

1. The main action opens the
   [shared collection](../../prototypes/store.html?design=honeyhouse).
   The hero soap tile and category rail offer direct product entry points.
2. All homepage product links open the full shared preview:
   [honey + oat soap](../../prototypes/product.html?design=honeyhouse&product=honey-oat-soap),
   [seasonal honey](../../prototypes/product.html?design=honeyhouse&product=seasonal-honey),
   and [beeswax candle](../../prototypes/product.html?design=honeyhouse&product=beeswax-candle).
   Variants and sample commerce behavior belong there, not in fake homepage
   add-to-cart controls.
3. Continue through the shared product/store interface to the
   [sample cart](../../prototypes/cart.html?design=honeyhouse). Theme and review
   boundaries must remain intact. Demo prices, stock, and cart entries are not
   real offers, reservations, payments, or orders.
4. The [inventory review](../../prototypes/inventory.html?design=honeyhouse)
   lets the owner discuss the catalog model; it is not a real admin service or
   proof of currently available products.

Before real selling, confirm the catalog, ingredients, materials, actual stock,
pricing, payment handling, and pickup process. No online shipping, public shop,
or real checkout is represented by this homepage.

## Mobile, accessibility, and resilience

- The desktop hero uses a twelve-column grid: headline and introduction above
  an eight/four split of art and soap feature.
- Below 760px, headline and introduction become full-width first; art and soap
  retain a smaller bento relationship until 480px, then stack.
- The category rail stays visible, wrapping its labels at narrow widths rather
  than requiring horizontal scrolling or a script.
- The product collection changes from a tall soap feature plus two smaller rows
  to a single sequence. Compact honey/candle entries become image-over-copy
  cards at phone widths.
- Pickup steps, maker story, service information, and contact blocks stack as
  needed. Native `details` elements are open initially, keyboard-operable, and
  do not need JavaScript.
- One h1, a skip link, labeled navigation, visible focus, image dimensions, and
  controls at least 44 CSS px tall support the core reading/selection tasks.
- Local SVGs and product art only; no scripts, embedded social feeds, remote
  fonts, or autoplay. Reduced motion disables smooth scrolling.
- Review at 320/375/768/1440px, with particular attention to the clay tile's text,
  the category rail, and whether the art crop hides product context.

## Future SEO intent

This is **noindex**, not a second production website. If selected, publish one
canonical site with real soap, honey, and candle pages, meaningful product
descriptions, verified ingredients/materials and availability, and accurate
Madisonville pickup context. The restrained category names should still map to
plain-language product searches, not cryptic internal collection titles.

Create separate service pages for genuine removal and pollination capabilities.
Do not invent a Honey House street address, shop hours, public visits, review
schema, product offers, eco certification, or therapeutic claims. Add structured
data only where supported by approved facts and a real commerce implementation.
No ranking or rich-result result is assumed.

## Tradeoffs and mitigations

| Opportunity | Tradeoff / mitigation |
|---|---|
| Calm, clear product hierarchy | Can feel impersonal; use the actual maker's voice and original photography |
| Soap prominence fits the starting business | Honey and candles could feel secondary; retain the category rail and equally real product links |
| Architectural whitespace creates separation | May push the collection lower; preserve the direct store CTA and soap-preview tile |
| Native disclosures keep services compact | Some users overlook collapsed details; both start open and remain in visible navigation |
| Contemporary studio language | Could imply a showroom; explicitly identify private pickup and no public shop |
| Compact local assets | Illustration cannot substantiate materials or quality; replace it with verified product imagery |

## Open owner decisions

Confirm whether this clean studio tone fits the actual products and customers.
Approve product naming, formula/ingredients, scent and material details, sizes,
packaging, and the prominence of soap. Confirm whether retail honey will launch
at all and which candle formats are viable. Decide stock/payment/pickup
operations before sales copy is finalized. Supply the owner interview, real
imagery, direct contact information, and owned social URLs. Verify beekeeping
coverage, capacity, structural-work/repair responsibility, and farm intake.
Public visits and shipping remain unapproved.
