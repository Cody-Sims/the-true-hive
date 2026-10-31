# Ten-concept design and commerce review

Status: review hypotheses, **not ten production websites or proven conversion rankings**.

**Implementation decision:** Apiary Market is now selected. The actual site uses our own Astro/Node/PostgreSQL foundation, not Shopify, and the ten prototypes remain a separate archive. Earlier platform suggestions in art-direction briefs are historical options, superseded by the [approved foundation](13-production-foundation.md).

## Why expand the comparison

The owner prioritizes product/local sales, pickup first and shipping later. The original three directions are retained and extended; seven additional compositions explore a broader retail identity. The actual small-scale soap operation is the near-term anchor. Honey/candle concepts do not prove retail readiness.

## Direction matrix

| # | Direction | Distinct composition / visual thesis | Hypothesis to evaluate |
|---|---|---|---|
| 01 | [Meadow & Amber](../prototypes/meadow.html) | Warm paper, large editorial serif, arched landscape/apiary art | A balanced local story can support goods and services |
| 02 | [Fieldwork](../prototypes/fieldwork.html) | Confident utility type, grid/site study and dominant service modules | Useful service-forward reference; may underweight the now-primary retail goal |
| 03 | [Hive & Hearth](../prototypes/hearth.html) | Centered identity, soft plum, sculptural product still life | Refined everyday-product rituals can unify the range |
| 04 | [Apiary Market](../prototypes/market.html) | Market-stall/product-shelf rhythm, tactile labels and forest/tomato paper | A neighborly shopping identity may fit local soap buyers |
| 05 | [Honey House](../prototypes/honeyhouse.html) | Contemporary studio, asymmetric bento and crisp category structure | A clear modern product studio can simplify discovery |
| 06 | [Blue Ridge](../prototypes/ridge.html) | Panoramic blue landscape and editorial product ledger | Region-inspired identity can feel local without generic rustic branding |
| 07 | [Golden Hour](../prototypes/golden.html) | Sunlit terracotta/apricot, expressive maker still life | Warm material storytelling may suit handmade goods |
| 08 | [The Quiet Hive](../prototypes/quiet.html) | Cream/ink Swiss precision, strong negative space and product architecture | Restraint may make products and information feel confident |
| 09 | [Bloom & Field](../prototypes/bloom.html) | Botanical frame, layered labels, sage/berry seed-catalog sensibility | A botanical material story may connect soap/goods to the hive |
| 10 | [The Hive Journal](../prototypes/journal.html) | Masthead, columns, lead product story and editorial commerce | Useful stories may build trust while preserving shopping paths |

Original artwork is illustrative, not evidence of an actual property, product formula or package. Each [design brief](designs/01-meadow-and-amber.md) records intent, tradeoffs, mobile behavior and future SEO considerations.

## Coordinated journey for every direction

| Surface | Review behavior |
|---|---|
| Homepage | Independent composition; product discovery, local context, planned services and honest pending contact/social |
| Collection | Shared sample catalog with search, categories, price ordering and explicit demo sellability |
| Product | Formula/format caveats, sample variants/prices, quantity and stock state, pickup context |
| Cart | Shared browser sample cart, update/remove, price recalculation and stock revalidation |
| Checkout concept | Read-only hosted-checkout handoff; no personal/payment form or actual order |
| Inventory lab | Fictional variant/location records from the same source, not a real admin |
| Planning hub | Real source documents: requirements, business plan, SEO, inventory, phases and partner workbook |

Reuse is intentional: separate art direction does not require separate stock logic. Shared cart behavior keeps the comparison fair and reduces inconsistent failure states.

## Demo scenarios to try

Use the shop's review controls, not imaginary production features:

1. Normal inventory: add a sample soap, change quantity, review the cart.
2. One honey jar left: request more than the scenario supports; expect an explicit rejection, not a silently reduced quantity.
3. Sold-out sample: compare known zero stock to unavailable inventory.
4. Inventory service unavailable: catalog descriptions remain, additions/review are blocked, removal still works.
5. Shipping/later phase: show not offered, rather than inventing shipping eligibility or prices.
6. Corrupt/outdated saved cart: explain the issue and offer an explicit reset; no false successful restoration.

Cart additions do not reserve or decrement stock. Real production concurrency and managed admin remain phase-4 requirements.

## Shared evaluation rubric

The detailed rubric is maintained in [Meadow & Amber's brief](designs/01-meadow-and-amber.md#shared-evaluation-rubric) for all ten directions.

Shortlist 2-3 with the owners before customer testing. Give a balanced rotated subset to 5-8 prospective local customers, especially existing soap buyers; do not ask every person to endure ten full flows.

Evaluate product finding, ingredient/format comprehension, honest sample status, pickup expectations, mobile/keyboard use, stock failure recovery and secondary service/social findability. Record task outcomes and confusion before asking aesthetic preference.

Do not select using a weighted score alone if the flow is inaccessible, misleading or cannot explain pickup. No design is a proven market winner until the business has relevant evidence; low-volume metrics may remain inconclusive.

## Acquisition and SEO boundaries

The prototypes explore clarity, useful product information, local context and trustworthy next steps. None is search-optimized by publishing mock offers or copying competitor copy.

All review pages are noindex, even though the owner approved the current snapshot for a public shareable preview. The final business site uses **one chosen direction**, unique approved content and coherent collection/product routes. Do not index ten duplicates as an acquisition strategy; review plans and demo data are excluded from production commerce.

See the [SEO/acquisition plan](06-storefront-seo-and-acquisition.md) for cited standards and the [business plan](09-local-business-launch-plan.md) for real channel/readiness gates.

## Decisions that still belong to the owners

Select the direction and real packaging/photography, approve actual soap information, resolve safe pickup, confirm domain/social/contact, choose a platform/maintenance budget, and clarify honey allocation before retail offers. The [partner workbook](10-partner-workbook.md) keeps these open questions visible inside the UI.
