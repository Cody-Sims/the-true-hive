# Product-first SEO and customer acquisition

Status: proposed strategy and release gates, **not a ranking guarantee or measured conversion forecast**.  
Date: **2026-10-28**. Priority: local product sales, starting with the real soap operation; local pickup first.

## The customer journey we are designing

```text
Local recommendation / approved market QR / search / Facebook / Instagram
                                  |
                  useful collection or actual product page
                                  |
        real formula/materials + format + price + pickup expectations
                                  |
           authoritative variant/location sellability + clear cart
                                  |
                  hosted checkout and accurate receipt
                                  |
             prepare -> notify ready -> pickup -> genuine feedback
                                  |
                         repeat local purchase
```

Services have a separate supporting journey. The planning hub, demo carts and ten branded prototypes are review artifacts, not customer-acquisition pages.

## Positioning and evidence

The earlier [market study](01-market-and-design-research.md) observed recognizable product families, origin/making stories, education and distinct visitor paths at local/regional and established national analogues. Those patterns suggest hypotheses for True Hive; they do not prove design-caused revenue or a conversion winner.

The clarified owner facts change the initial emphasis: approved real soaps lead; candles/other goods remain a readiness decision; retail honey is not promised from a future harvest that already has a purchaser. Do not attract customers with offers the business cannot fulfill.

Use the [ten-concept comparison](08-prototype-expansion.md) to test visual fit and practical comprehension. A beautiful interface that hides pickup conditions, mislabels stock or implies medical benefits is not a good sales design.

## Refreshed primary-source evidence

The bounded commerce refresh retrieved ten primary pages on **2026-10-28**. These are source-text observations and documented recommendations, not browser audits or proof of local demand. Google recommendations are not universal legal obligations; structured-data rules apply to the particular search feature.

| Source | Supported wording / observation | Application and limit |
|---|---|---|
| [G1 - Google ecommerce navigation](https://developers.google.com/search/docs/specialty/ecommerce/help-google-understand-your-ecommerce-site-structure) | "Googlebot generally doesn't try to submit searches into a search box"; recommends category -> product `<a href>` paths | Search/filter UI cannot be the only discovery route |
| [G2 - Google URL structure](https://developers.google.com/search/docs/specialty/ecommerce/designing-a-url-structure-for-ecommerce-sites) | Consistent URLs in internal links, sitemaps and canonical tags | Deliberate route/parameter policy, not one indexed URL per filter |
| [G3 - Google pagination](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading) | "Don't use the first page of a paginated sequence as the canonical page" | Distinct page URLs/canonicals and discoverable sequential links; pagination is not automatically a unique-title-per-page case |
| [G4 - Google merchant listings](https://developers.google.com/search/docs/appearance/structured-data/merchant-listing) | Recommends "Product structured data in the initial HTML for best results" | Real visible offers/availability; this is not a mandate to use a particular framework |
| [G5 - Google product variants](https://developers.google.com/search/docs/appearance/structured-data/product-variants) | Variant URLs should select the right image, price and availability; single/multi-page models have different canonical rules | Choose the actual variant-page model before imposing canonical rules |
| [G6 - Google noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing) | A resource must not be blocked by robots.txt for Google to encounter its noindex | Noindex and access control remain separate concerns |
| [G7 - Business Profile](https://support.google.com/business/answer/3038177?hl=en) | Physical customer-visit or customer-travel eligibility and accurate real-world representation | Confirm operating/pickup model; no invented public shop/address |
| [B1 - Baymard public checkout research](https://baymard.com/lists/cart-abandonment-rate) | Lists extra costs, forced account creation and inability to see total cost among reported abandonment reasons | Cost/account clarity is relevant; applying it specifically to pickup is a hypothesis, not a measured pickup-specific lift |
| [C1 - Savannah Bee collection](https://savannahbee.com/collections/honey) | Named products/prices, collection explanation, filter/sort and load-more content in fetched HTML | Useful category education pattern; visual quality/crawlability/effectiveness not audited |
| [C2 - Zach & Zoe](https://zachandzoe.co/) | Family-story material alongside a short named product/favorites selection | Product-plus-story content pattern; no revenue/conversion/health claim is established |

The retrieved navigation/URL/pagination/noindex pages displayed December 10, 2025 updates; merchant/variant pages displayed September 8, 2026 updates; Baymard labeled its page 2026. Retailer/Business Profile editorial-update dates were not reliably established. Recheck rolling documentation at implementation; do not treat retailer prices as True Hive pricing research.

## Local discovery before broad traffic

| Channel | Initial action | Integrity and measurement |
|---|---|---|
| Existing soap buyers | Learn what they buy/repeat and what makes pickup difficult | Record voluntary nonpersonal themes, not invented demographics |
| Local word of mouth | One accurate business/contact destination and clear product information | Count actual inquiries/orders through the real operating process |
| Approved markets/outlets | Real product cards/QR links and consistent identity | Confirm vendor rules; do not imply an unapproved venue/retail partnership |
| Facebook/Instagram | Real owned profiles, approved product/process images, direct page links | No guessed handles, live-feed dependency, fake followers or customers' private details |
| Organic search | Useful crawlable approved product/local content | Do not claim keyword volume, rankings or map eligibility without evidence |
| Paid promotion | Small bounded experiment after stock, pickup and contribution work | A spend/stop rule and actual orders, not clicks alone |

Use ordinary labeled social links by default. Referral tags may include source/medium/campaign but not names, phones, addresses, order details or inquiry text.

## Search intent and page map

These are **proposed intents**, not measured search volumes.

| Page | Purpose | Must not imply |
|---|---|---|
| Home | The True Hive, Madisonville, real product range and local relationship | A public retail address, broad service area or credentials not approved |
| Soap collection | Browse the actual approved range with useful comparisons | That sample honey-and-oat formula/price is a real current SKU |
| Product detail | Real name/format, ingredients/materials, photos, price, safety/use information, pickup eligibility | Medical/organic/sourcing claims without support |
| Honey information / future collection | Explain actual availability and only approved product facts | Retail allocation, preorder capacity or a guaranteed harvest |
| Candle/gift collection when ready | Real products with composition, safe-use and component-stock information | That conceptual packaging proves production readiness |
| Pickup/help | Actual location/process, timing, instructions, fees, no-show/returns and contact | "Ready now," free pickup or public walk-in access without approval |
| Service pages when ready | Distinct real removal/pollination scope and inquiry guidance | Emergency service, structural capability, hive capacity or yield guarantees |
| Local story | Approved soap-making/beekeeping context and original images | Public commercial terms, invented history or competitor endorsements |

Choose one canonical route map at the platform decision. Native collection/product paths are the baseline; `/shop` can be a supported entry/redirect if appropriate. Do not promise arbitrary paths a chosen theme/platform cannot support.

## Crawlable architecture and content

Production needs real HTML links from navigation -> collection -> product, meaningful breadcrumbs and server-rendered/prerendered core content. The exact framework is not the ranking mechanism; useful accessible pages, truthful information and crawlable delivery matter.

Rendering core visible content initially is an engineering resilience/SEO recommendation for this project. Google's explicit quoted initial-HTML recommendation above concerns **Product markup**; it is not a blanket rendering-framework requirement.

For the live store, search-visible product name, price, currency, availability and structured data must agree with the customer-visible authoritative source. Do not put an important product behind a search box, click handler or JavaScript-only "load more" path without a crawlable equivalent.

Use distinct descriptive titles and helpful text, not repeated "best honey soap near me" phrases or a page per neighboring town with copied content. Build separate local/service pages only when the business really covers them and has distinct useful information.

### Canonicals, facets, pagination and lifecycle

| Surface | Proposed production policy |
|---|---|
| Main home/collection/product | One canonical URL per intended indexable page, correct production domain, no preview URLs |
| Campaign parameters | Canonical clean content URL; do not create an indexed page per campaign |
| Small-catalog filters/sort | Avoid indexable combinatorial duplicates; choose a deliberate canonical/crawl policy rather than making every filter an acquisition page |
| Useful distinct collection landing | Can be indexable when it serves real unique intent/content; not a thin near-duplicate |
| Paginated collection | Crawlable links and distinct page URLs; do not blindly canonicalize every page to page 1 |
| Variant choices | Follow the chosen product/variant URL strategy and platform's supported behavior; do not invent independent canonical pages for trivial duplicate states |
| Temporary real stockout | Keep useful real product information, update actual availability and offer an honest next step; do not replace it with a fake preorder |
| Permanent removal | Choose correct removal/redirect behavior based on genuine replacement/content; do not redirect every discontinued item to home |
| Cart/checkout/internal/admin | Not search-acquisition pages; appropriate platform access/indexing controls |
| Prototypes/planning | Local/protected review plus noindex; excluded from production sitemap and public output |

Robots blocking is not privacy and is not the same as a crawlable noindex directive. Do not block a URL and assume Google has read its page-level noindex. Protect internal hosted plans with real access controls.

## Structured data and merchant information

Use applicable real `Product`/`Offer` and, where appropriate, `ProductGroup`/variant data only when the underlying product, price, currency and availability are real and visible. Do not emit fake reviews, ratings, discounts, GTINs or sample offers. Handmade products still need truthful identifiers; do not manufacture a barcode to fill a field.

All prototypes are noindex and deliberately omit purchase-offer markup. A concept product with a sample price is not eligible evidence for a real merchant feed.

If Merchant Center/free listings are selected, the platform/feed/page must agree on actual price, inventory, fulfillment/returns and business identity. Establish who owns feed problems and how inventory changes propagate; do not maintain a second manually edited stock source.

Validate actual chosen markup and inspect what is rendered. Structured data does not guarantee a rich result, ranking, local listing or legal compliance.

## Local business information and pickup privacy

Google's [Business Profile guidelines](https://support.google.com/business/answer/3038177?hl=en) require accurate real-world representation. Its [service-area guidance](https://support.google.com/business/answer/9157481?hl=en) explains address visibility and place/postcode-based areas rather than a radius.

Confirm the actual operating/customer-visit model before creating/updating a profile. Do not publish a private home/apiary, fake storefront, invented hours or a new profile for every market. "Pickup first" alone does not establish a qualifying public storefront.

Add applicable business/website metadata using verified facts. Do not invent a street address to qualify for Google's LocalBusiness results; useful Schema.org statements and eligibility for a particular search feature are not identical.

## Conversion practices: practical, not manipulative

| Practice | Application to True Hive |
|---|---|
| Product information before pressure | Clear real ingredients/materials, format, photos and price; no unsupported skin/health claims |
| Visible availability meaning | Selected variant + actual pickup location; sold-out and unknown are distinct |
| Fulfillment clarity | Pickup process, timing, fees and restrictions before commitment; shipping not assumed |
| Simple cart | Obvious item/format/quantity, update/remove, readable errors and current totals |
| Honest checkout boundary | Hosted payment, provider validation and clear receipt/ready notification; no account requirement without need |
| Genuine trust | Actual maker/process, working contact, accurate policies and real feedback |
| No dark patterns | No fake scarcity, invented "bestseller" numbers, countdowns, fabricated reviews or automatic marketing opt-in |
| Accessible mobile use | Readable reflow, touch targets, contrast, keyboard focus and clear field/error labels |

These are engineering/design recommendations, not guaranteed conversion lifts. Where public UX research is used, distinguish the study's context from True Hive's small local catalog.

## Performance and measurement

Target [LCP <= 2.5 seconds](https://web.dev/articles/lcp), [INP <= 200 ms](https://web.dev/articles/inp) and [CLS <= 0.1](https://web.dev/articles/cls) at field p75 when representative data exists, separately by device category. Lab checks are useful before launch but [not a substitute for field measurement](https://web.dev/articles/vitals).

Use appropriately sized/dimensioned real photos, no lazy loading for the main LCP image, minimal client JavaScript and no unnecessary social/video/map embeds. An attractive prototype illustration is not proof of real-photo performance.

Measure actual product discovery, qualified inquiries, ready/collected orders, repeat purchases, contribution and stock discrepancies. A purchase event comes from a real accepted transaction, not a Buy-button click. Keep analytics free of customer/inquiry/payment details. Establish consent/disclosures based on actual tools and applicable obligations.

Do not set a conversion-rate target or paid acquisition budget from a generic industry benchmark. First establish a baseline and the owner's capacity/economics.

## Business and product readiness

Before promoting real products/channels, confirm the applicable Tennessee/local business, tax, apiary, product-category, labeling, safety and insurance requirements for the actual operation. True soap, cosmetics, food and candles are not interchangeable regulatory categories. Do not assume a home-production exemption covers every ingredient, claim, channel or later shipment.

The [business plan](09-local-business-launch-plan.md) sequences operating readiness and the [partner workbook](10-partner-workbook.md) assigns Q04/Q11/Q13/Q15 to qualified confirmation. This document does not establish that current operations have been audited or that a specific license/exemption applies.

The [business-readiness evidence table](11-business-readiness-evidence.md) records the verified FDA/CPSC guidance and the Tennessee/local access failures. Do not convert an unverified official-source link into a compliance conclusion.

## SEO and acquisition release gate

| Gate | Inspection |
|---|---|
| S1 - Real offer | Product, formula/label, photo, price and stock approved; no allocated-future-honey offer |
| S2 - Crawlability | Actual rendered page source and anchor links expose approved collections/products |
| S3 - URL/index policy | Correct canonical domain/routes, actual 404 behavior, sitemap and intentional filters/pagination policy |
| S4 - Metadata/data consistency | Unique useful titles; applicable real structured data/feed matches visible prices/availability |
| S5 - Local/pickup truth | Actual contact/profile, appropriate address privacy and approved pickup process |
| S6 - Customer task | Shopper can find a real product, understand pickup/total and complete an authoritative checkout without ambiguity |
| S7 - Mobile/accessibility/performance | Agreed production budgets and manual/automated review pass; field data recorded honestly when absent |
| S8 - Internal separation | No demo stock/offers, ten-prototype duplicates or private planning library in public deployment |

These gates belong to the production phase, not a claim that the current mock store is ready to sell.
