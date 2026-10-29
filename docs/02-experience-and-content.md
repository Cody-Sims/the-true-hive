# Experience, content, and local discovery

Status: proposed production experience; no final business copy approved.

## Experience priorities

1. Establish **products, place and a useful next step**: The True Hive, Madisonville, Tennessee.
2. Lead with the real soap range when approved; honey/candles and other sample concepts are not automatically ready for retail.
3. Make **local pickup first** understandable without inventing a public location, hours, fees or readiness promise.
4. Keep colony-removal and farm-pollination inquiries distinct and easy to find, but secondary to the confirmed product-sales priority.
5. Connect verified social/contact channels and a coherent future same-site collection -> product -> cart -> hosted checkout journey.

The research supports these as design hypotheses. It does not establish a universal "best" page or a guaranteed conversion lift.

## Landing-page information architecture

| Order | Section | Content and interaction | Production component |
|---|---|---|---|
| 1 | Header | Wordmark; Collection, Beekeeping, Story, Connect; later a genuine cart only when commerce is live | `SiteHeader` |
| 2 | Hero | Business/locality; one clear product-led headline and exploration CTA; visible secondary service route | `HomeHero` |
| 3 | Hive goods | Approved real soaps or clearly labeled concepts; no live purchase/stock promise before commerce | `ProductShowcase` |
| 4 | Pickup expectations | Owner-approved local process when real; explicitly unresolved details in review | `PickupOverview` |
| 5 | Services | Distinct removal/pollination paths and scope; no unsupported booking/capacity claim | `ServiceOverview` |
| 6 | Local story | Approved soap-making/beekeeping story and real photographs; private buyer/hive details not automatically public | `LocalStory` |
| 7 | Around the hive | Curated owned images and ordinary verified social links; no automated feed | `SocialLinks` |
| 8 | Contact and service area | Approved phone/email, coverage and realistic response expectations | `ContactSection` |
| 9 | Footer | Name/locality, contact, social, privacy/accessibility information | `SiteFooter` |

The selected art direction can reorder services and goods, but neither journey should be hidden. Do not put an FAQ, newsletter modal, sale banner, or carousel between the visitor and the main next step.

### Primary journeys

| Journey | Path | Important boundary |
|---|---|---|
| Property has a colony | Hero or Services -> removal details -> call/email | Inquiries are not confirmed bookings; no emergency/instant-response promise |
| Grower needs hives | Services -> crop/date/acreage guidance -> contact | An inquiry is not a promise of hive supply, stocking rate, yield, or suitability |
| Shopper wants goods before commerce | Hive goods -> approved detail / concept -> actual inquiry/pickup information | No public pretend checkout or stock |
| Shopper after commerce is enabled | Collection -> real product/variant -> fulfillment availability -> cart -> hosted checkout | Same-site coherent experience; provider validates totals/stock |
| Owner comparing prototypes | Homepage -> sample store -> variant -> demo cart -> read-only checkout explanation | Explicit fictional counts/prices; no payment, customer data or order |
| Instagram/Facebook visitor | Social post -> relevant page/section -> service/product action | Profile and site must present consistent identity/contact facts |
| Owner updates content | Typed content file and preview review initially | Inventory quantities are not edited in marketing content |

## Service-content outline

### Colony / hive removal

Explain the offered scope in plain language: swarm collection, established-colony removal, structural cut-outs, and pest control are **not interchangeable**. Only publish the categories the owner actually handles. Clarify inspection, property access, repair responsibility, charge/estimate policy, insurance, and limitations before offering structural work.

Suggested initial inquiry details: town, where the bees are located, approximate height/access, and whether the insects have been identified. Do not ask a visitor to approach a colony for a photograph. Do not claim every colony can be recovered or that all jobs are free.

Use a concise safety note: keep a safe distance and do not disturb the colony; this is not an emergency service. Medical emergencies belong with emergency services, not a web form.

### Farm pollination

Explain that placement is planned around crop, acreage, bloom dates, site access, and an agreed management/pesticide communication plan. Do not publish a universal hives-per-acre rate or promise a yield increase.

Suggested inquiry details: farm locality, crop, approximate acreage, expected bloom window, and best contact. Detailed site addresses and agreements can follow privately. Confirm capacity and transport obligations before publishing availability.

## Product and image strategy

| Initial mock | Safe current wording | Must be confirmed before real merchandising |
|---|---|---|
| Seasonal honey | "Concept product; harvest and jar details to be confirmed" | Floral origin, source, processing claims, net weight, ingredients/label requirements |
| Honey + oat soap | "Concept product; formula and format to be finalized" | Actual formula, labeling category, ingredients, claims and safe-use information |
| Beeswax candle | "Concept product; wax blend and size to be finalized" | Composition, fragrance, vessel, burn/safety instructions |
| Future gift collection | "Possible future collection" | Included SKUs, packaging, bundle stock behavior, pricing and fulfillment |

No unverified "organic," "allergy relief," "healing," "chemical-free," "100% local," or therapeutic claims. Genuine trust comes from accurate sourcing, real people, helpful service information, and transparent limitations.

Prototype illustrations are original placeholders, **not photos of real products or properties**. Before launch, obtain owner/apiary context, safe working/service photos and consistent real soap/product photographs. Record ownership/permission, alt-text intent, crop and focal point. Do not reuse competitor assets.

The owner already makes/sells soaps, but the prototype's formula, format and sample price are not approved real records. The next honey harvest reportedly has a purchaser: do not advertise a retail honey release, preorder or stock until allocation/physical availability is resolved privately.

## Facebook and Instagram

Put ordinary labeled profile links in the header/contact area and footer. A static "Around the hive" section can use approved locally hosted photos and captions; it must not pretend to be a live Instagram feed.

No guessed account handles, platform homepages disguised as business profiles, follower counts, copied posts, pixels, or embeds. Until exact URLs are supplied, a preview says "account link pending"; production launch requires owner approval of the real links.

Use consistent social bios, profile image, business name, locality, and contact route. Point posts to relevant services or product sections rather than always sending visitors to the top of the page. Campaign tags may identify source/medium/campaign but must never contain customer names, phone numbers, addresses, or inquiry text.

## Responsive and accessible behavior

- Mobile navigation stays visible and wraps naturally; only introduce a disclosure menu if actual content requires it.
- Put text before illustrations in the document order. Product/service cards become one column; CTAs remain full, clearly labeled targets.
- Use 16 px or larger body text, comfortable line length, visible focus, descriptive link text, and a skip link.
- Target at least 44 x 44 CSS px for important standalone controls as a design choice; WCAG 2.2 AA's target-size criterion is 24 x 24 with specified exceptions, not a universal 44 px rule.
- Use 4.5:1 normal-text contrast, 3:1 qualifying large-text contrast, and appropriate non-text/focus contrast. Check actual combinations, not just the palette.
- No autoplay video, scroll hijacking, hover-only information, or essential animation. Respect reduced motion.
- Reserve image dimensions; do not lazy-load the main hero image. Optimize below-the-fold images appropriately.

## Local search strategy

Lead with actual product/local-shopping intent, such as soaps and an approved local-pickup process in Madisonville. Honey and beekeeper-service intents apply only when the corresponding offering is real. These are seed intents, **not verified keyword volumes, a public honey-availability assertion or a ranking promise**. The dedicated [SEO/acquisition plan](06-storefront-seo-and-acquisition.md) covers collections, variants, canonical URLs, stock/merchant data and local channels.

Use one accurate homepage title, useful service headings, canonical URL, indexable production content, sitemap, robots configuration, and Open Graph imagery. Add individual service pages in phase 3 only when there is enough distinct useful content; do not create thin near-duplicate pages for every nearby town.

Confirm Google Business Profile eligibility and the actual customer-visit model. A service-area business that does not receive customers at its address should not expose that address just to fill a map or schema field. Google's service-area settings use named places/postcodes, not a radius.

Use `Organization`/`WebSite` metadata first if appropriate. Only add `LocalBusiness` markup after checking its requirements and the owner's public-address/privacy choice. Do not invent a street address to qualify for a rich result; valid Schema.org statements and eligibility for Google's particular rich results are different questions. Do not mark mock goods up as purchasable `Product` offers, and do not add self-serving fake ratings. See [primary sources](01-market-and-design-research.md#accessibility-performance-and-local-search-sources).

## Content approval checklist

| Required before launch | Owner/evidence |
|---|---|
| Exact display name, approved domain and locality | Owner confirmation; domain ownership |
| Phone/email and ability to monitor them | Real-device contact rehearsal |
| Facebook/Instagram profile URLs | Owner signs in and confirms profile ownership |
| Actual coverage and service categories | Owner capability, travel and insurance review |
| Business story and claims | Owner sign-off with evidence for objective claims |
| Images and temporary/final identity | Permission record and owner approval |
| Product showcase status | Explicit concepts, or complete approved real product records |
| Response and capacity wording | Real operating commitment, not an invented SLA |
| Privacy/accessibility contact and hosting disclosures | Reflect actual providers and behavior |

## Measurement and concept selection

First shortlist **2-3 of the ten directions** with the owners. Then run a small formative review with **5-8 prospective local customers**, primarily local shoppers/current soap buyers, plus service users where practical. Do not force every person through ten full flows; rotate a balanced subset to reduce fatigue and order bias. This is not a statistically representative market study.

Use consistent tasks: find a soap, inspect formula/format/price disclosures, explain pickup expectations, add a sample variant and recognize that no real order is possible, recover from unavailable stock, locate services/social, and find the partner workbook in the review UI. Record comprehension and friction rather than asking only "which looks nicest?"

Use the [shared design rubric](designs/01-meadow-and-amber.md#shared-evaluation-rubric). Treat findings as directional. After launch, review successful contact journeys, inquiry quality, unanswered leads, and actual local sales where attributable. Social clicks are not revenue; page views alone do not prove business value. Do not set conversion targets without a baseline.
