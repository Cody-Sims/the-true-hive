# Specification: The True Hive

Status: **scope confirmed; design and production details await approval**  
Date: **2026-10-28**  
Source: the owner's requests and follow-ups: Madisonville, TN; ten total concepts; product/local-sales priority; pickup first; integrated future storefront/inventory; an in-UI planning and business hub.

## Objective

Establish The True Hive as an approachable, credible local maker/bee business in Madisonville, Tennessee. Prioritize product discovery and local sales, building on existing small-scale soap sales and beekeeping; keep planned removal and pollination services easy to find. Start with local pickup, add shipping only when ready, and plan an integrated storefront with authoritative inventory. Provide ten design directions and an internal UI for the complete website/business plan.

## Users and Use Cases

| User | Concrete scenario | Desired outcome |
|---|---|---|
| Homeowner/property manager | Finds a colony and wants professional guidance | Understands the offered removal scope, service area, and how to inquire safely |
| Farmer/grower | Needs managed hives for a crop's bloom window | Finds pollination information and knows what details to provide |
| Local shopper | Wants honey, soap, candles, or a gift | Understands the proposed range and current purchase/inquiry arrangements |
| Social visitor | Arrives from Facebook or Instagram on a phone | Recognizes the same brand and reaches the relevant service/product section |
| Business owner | Needs to update offerings and, later, manage real stock | Has an explicit content workflow now and a manageable inventory workflow later |

## Requirements

### Functional

| ID | Requirement |
|---|---|
| R1 | Identify the business as **The True Hive** and its confirmed base as **Madisonville, Tennessee**. Do not invent a street address or wider coverage. |
| R2 | Provide distinct paths for **colony/hive removal inquiries** and **farm pollination inquiries**; explain assessment rather than promising instant scheduling. |
| R3 | Make an approved direct contact method reachable from the first screen and footer of the production site. A form is not required for the initial launch. |
| R4 | Provide clearly named, verified Facebook and Instagram links in the production site. Until supplied, prototypes must disclose that links are pending. |
| R5 | Keep unapproved goods clearly provisional on a public pre-commerce site. Interactive design-review store flows may show explicitly labeled fictional prices/stock/cart behavior, but never accept payment, create orders or imply real availability. Retail honey release is unconfirmed; do not sell against an allocated future harvest. |
| R6 | Include an owner-approved story, local context, and only substantiated trust claims. Do not invent reviews, credentials, awards, hive counts, founding dates, or sustainability certifications. |
| R7 | Keep core production marketing content/navigation/contact usable without client-side JavaScript. Real collections/products must be crawlable and rendered for search; the internal interactive demo and planning viewer may require JavaScript with honest fallbacks. |
| R8 | Prepare honest page metadata and local search information; publish structured data only for verified facts and eligible content. |
| R9 | Define future boundaries for catalog, hosted checkout, and owner inventory administration without shipping payment, authentication, or an inventory database now. |
| R10 | Deliver ten distinct responsive homepage compositions and coordinated collection/product/cart/checkout previews, with design rationales and a linked multiphase plan. |
| R11 | Plan the future storefront as part of the coherent primary-domain website experience, not merely an unrelated outbound shop. Managed hosted checkout may handle payment. |
| R12 | Define authoritative variant/location inventory, pickup eligibility, market/wholesale allocation, error/freshness behavior and owner administration; distinguish future production forecasts from physical stock. |
| R13 | Render the actual planning documents, requirements, research, roadmap and unanswered questions inside a navigable browser UI. |
| R14 | Include an actionable local-to-growth business plan based on owner-reported existing soap sales, two hives and next-harvest allocation; identify assumptions, costs, operating gates and partner decisions without inventing revenue/yield forecasts. |
| R15 | Include sourced product/local SEO and customer-acquisition practices; keep prototypes non-indexable and free of fake offer/rating markup. |

### Non-functional

| ID | Requirement |
|---|---|
| N1 | Support 320, 375, 768, and 1440 CSS-pixel viewport widths; readable reflow at 200% zoom; no unintended horizontal scrolling. |
| N2 | Target **WCAG 2.2 AA** in production, including keyboard navigation, visible focus, contrast, semantic structure, and meaningful image alternatives. This is a goal, not a certification claim. |
| N3 | Target field p75 LCP <= 2.5 s, INP <= 200 ms, and CLS <= 0.1, separately for mobile/desktop when sufficient data exists. Use lab evidence before field data exists; do not equate Lighthouse with field compliance. |
| N4 | For the landing page, budget <= 1 MB initial transferred resources, <= 25 KB compressed first-party browser JavaScript, and no automatic third-party social/feed/map requests. Revisit budgets explicitly if requirements change. |
| N5 | Use one production application, clear content/presentation boundaries, strict TypeScript, a committed lockfile, and small components. Do not introduce a monorepo or microservices for this scope. |
| N6 | Keep privileged credentials out of public code. Collect no service-inquiry data until a real receiving workflow, privacy treatment, and failure behavior exist. |
| N7 | Provide reproducible preview/production deployments, documented ownership, and an actionable rollback procedure. |
| N8 | Keep internal plans and demo fixtures out of public production output. Local/noindex review is not an authentication mechanism; protected hosted review needs real access control. |

The performance thresholds are sourced in [the research](01-market-and-design-research.md). Byte budgets are proposed engineering constraints, not external standards.

## Non-Goals

For the first public release: checkout, customer accounts, custom admin, inventory quantities, booking calendars, subscriptions, shipping quotes, loyalty programs, live social feeds, uploads, interactive maps, multi-language support, and a blog publishing system.

For this planning package: a production commerce backend, real admin/auth/payment collection, business registration, legal/accounting advice, guaranteed harvest/revenue forecasts, final photography/identity, trademark clearance, and competitor conversion-rate measurement. A read-only fixture explorer is not an admin implementation.

"Local-first" means **locally focused customers and services**, not an offline-sync application.

## Existing-System Constraints

- The project began with three static prototypes; their existing URLs must remain valid while expanding to ten.
- The prototype now has a minimal package/lockfile for a pinned, locally served Markdown parser and native Node tests. This is not a production framework scaffold.
- Existing production brand assets, domain, contact endpoints, social accounts, catalog, and inventory system have not been supplied.
- Preserve the confirmed business name and locality across all deliverables.
- The standalone prototypes are review artifacts, not the production component architecture.

## Interfaces and Data Contracts

- **Current inputs:** approved business facts, service descriptions, social/contact URLs, original or licensed images, and labeled showcase records.
- **Current outputs:** static pages; real outbound links after approval; metadata containing only verified facts.
- **Prototype outputs:** local HTML/CSS/SVG/ES modules, a fictional inventory/cart simulation, and an actual-Markdown planning viewer. No submissions, payment/commerce-provider requests, analytics, or remotely loaded assets.
- **Future contracts:** separate business content, service inquiry data, product/variant data, and location-scoped inventory. See [data and integrations](04-data-and-integrations.md).
- **Versioning:** pin supported dependencies during production setup, not in a long-lived planning snapshot. Select an explicit supported commerce API version when commerce is implemented.

## Security and Privacy

No site-managed inquiry database, checkout, or authentication is needed for phase 2. Hosting and email providers can still process request/contact data; the privacy notice must describe the actual arrangement rather than claiming "no data collected."

Keep home/property addresses, colony photos, and exact hive locations out of public pages and analytics. Prefer ordinary social links to automatically loaded embeds. Future forms require server-side validation, abuse controls, restricted access, retention rules, and truthful submission status. Use managed owner authentication and MFA before considering a custom admin.

## Error and Edge Cases

| Case | Expected behavior |
|---|---|
| Social URL or business phone missing | Visible planning placeholder in prototypes; block production launch if an approved equivalent is absent |
| Product is fictional or details unknown | Explicit showcase label; no price, quantity, or purchase affordance |
| Request is outside the service area | Explain that coverage must be confirmed; do not imply acceptance |
| Colony is inaccessible or not honeybees | Describe assessment/referral limits; do not promise a removal result |
| Pollination dates/capacity uncertain | Explain that availability and suitability require confirmation |
| No customer reviews yet | Use real process/story information, not fabricated testimonials |
| Social network is unavailable | The website's service information and direct contact remain usable |
| Image fails or JavaScript is unavailable | Essential meaning remains in HTML; layout and contact navigation still work |
| Later form/provider fails | Preserve the person's input, show failure plainly, and offer the approved direct contact alternative |
| Future inventory is stale/unavailable | Show "ask about availability" or an explicit unknown state, never invented stock or a successful purchase |
| Demo cart exceeds stock or a scenario changes | Reject explicitly or block review; do not silently clamp quantities, reserve stock or fabricate success |
| Future harvest has a buyer but is not harvested | Keep forecast/commitment records separate; do not publish retail stock or preorders without an approved unallocated quantity |
| Planning document fetch or saved demo cart is invalid | Surface the failure; provide source/reset/recovery rather than a misleading empty or successful state |

## Acceptance Criteria

| Covers | Observable acceptance |
|---|---|
| R1 | Name/locality are consistent; no invented address or radius appears. |
| R2 | A visitor can separately locate removal and pollination information and the next step. |
| R3 | Production phone/email works from a real mobile device and appears in both primary contact routing and footer. |
| R4 | Owner confirms both account URLs; links reach the correct profiles. Prototype placeholders do not navigate to guessed accounts. |
| R5 | All mock goods/prices/counts/cart actions are explicitly fictional; no real checkout/order occurs and no retail harvest promise appears. |
| R6 | Owner signs off every factual claim and image permission; no invented social proof remains. |
| R7 | Core marketing remains usable without JavaScript; production commerce crawlability is a release gate. Demo-only JS requirements are disclosed. |
| R8 | Metadata matches approved content; schema contains no fake address, offers, or ratings. |
| R9 | A documented source of truth exists for each future commerce/inventory field; no commerce/admin code is required to deploy the landing page. |
| R10 | The gallery opens ten different homepages and coordinated complete review flows; original three URLs still work. |
| R11 | The approved commerce decision includes a unified primary-domain route/navigation/identity plan; an unrelated external-shop link alone does not satisfy it. |
| R12 | Inventory requirements cover physical/committed/available and location scope, pickup/market/B2B handling, last-unit competition, outages, reconciliation and managed owner workflows. |
| R13 | The UI displays the real Markdown contents, including requirements, business plan and partner workbook; navigation/source links resolve and unknown documents fail clearly. |
| R14 | The business roadmap starts from actual owner facts, contains bounded actions/gates and an illustrative cost worksheet, and preserves unanswered questions and private-copy boundaries. |
| R15 | SEO/acquisition recommendations cite primary sources, separate facts from hypotheses, and prohibit indexing/mock offer markup in review artifacts. |
| N1 | Named widths and 200% zoom expose no content loss or unintended horizontal scrolling. |
| N2 | Automated accessibility checks and manual keyboard/screen-reader review meet the selected production criteria; unresolved issues block release. |
| N3 | Lab results meet the approved release budget; field p75 is reviewed when representative traffic exists, or recorded as unavailable. |
| N4 | Network inspection meets byte/JavaScript budgets and makes no unapproved automatic third-party requests. |
| N5 | Dependency installation is reproducible and boundaries remain small and reviewable. |
| N6 | Public output contains no privileged secrets; any later submission workflow has documented receipt/failure and retention behavior. |
| N7 | A preview can be promoted and the previous known-good deployment restored without losing required external business records. |
| N8 | Production exclusions/access controls are explicit; no internal owner/partner context or demo inventory is promoted as public business content. |

## Open Questions

Product priority, own-made production and pickup-first direction are now confirmed. Pickup details, real product facts/prices, account URLs, brand choice, honey agreement details, service capability, compliance and costs remain open. The [partner workbook](10-partner-workbook.md) is the authoritative question list; the [decision register](05-decision-register.md) records accepted/recommended decisions and risks.

## Alternatives Considered

- **Astro + TypeScript:** recommended for a content-led static site with focused later integration points.
- **Next.js App Router:** valid if committed custom application requirements or team expertise justify the additional rendering/caching concepts.
- **Shopify native theme now:** best if commerce becomes imminent or owner-managed merchandising outweighs the custom marketing-site preference.
- **Custom inventory/admin now:** rejected; an unverified need does not justify custom auth, stock logic, or operational responsibility.
- **Social-only presence:** useful acquisition channel, but does not replace an independently accessible local-service website.

## Rollout and Rollback

Review these artifacts locally, approve phase 0, build in a private preview, then publish the landing page only after contact/content/operational gates pass. Keep preview sites non-indexable. Maintain a previous deployment and restore it if a release breaks the site. Rollback must not revert external orders or inventory; those future systems require their own migration and reconciliation plan.
