# Owner approvals and blocked work

Updated: 2026-11-14. This is the morning review queue for the professional website
phase. It records **pending authorization and business facts**, not secrets.

On 2026-11-14 the owner approved the redesign and publishing it, and requested
proper hosting at **thetruehive.com**. AP-01 is complete: the approved redesign
is published and apex/www HTTPS routing is verified on the existing Render service.
That website release did not activate inventory, checkout, email or tax.
The owner separately approved inventory-only setup below; payments remain off.

The repository is public. Do not enter credentials, private account identifiers,
authenticator codes, personal addresses or real stock records here.

## Authorized website work

- [x] Detailed phased plan and bounded parallel subagents for the website.
- [x] Improve the approved Apiary Market identity, shared visual system,
  homepage/story/services and collection/product discovery.
- [x] Use ethical attention patterns: hierarchy, recognizable choices, useful
  content, progressive detail and honest calls to action.
- [x] Run existing local validation and prepare a loopback review preview.
- [x] Retain disabled hosted inventory/payment flags and all ten prototypes.

These local outcomes are now implemented: shared visual system, original brand
mark, homepage/story/services, coherent product cards/details, and no-JS
collection search/filter/reset. The two implementation streams ran in parallel,
with shared integration and visual inspection owned by the coordinator.

Source: the owner's 2026-11-13 request to plan, implement in phases and record
new authorization needs rather than assuming consent while they are away.
The 2026-11-14 continuation also authorizes the next local technical-readiness
slice: accurate draft privacy/accessibility guidance, focus/error/metadata
repairs, restricted TEST-key compatibility and read-only sandbox planning.
Owner-dependent items below are listed and skipped, not treated as consent.
WX2 is now implemented and verified: privacy/search disclosures, accessibility
guidance, actual skip-target focus, useful 404 recovery, search/error metadata
guards and restricted-test-key compatibility. The real sandbox planner also
confirmed retaining hosted Checkout; no payment/invoice/Tax setting was enabled.
WX3 adds the matching original favicon and first-party social-preview artwork.
These are static local assets and metadata, not a social integration or tracker.

## Approved publication and domain work

| ID | Authorization | Boundary |
|---|---|---|
| AP-01 | Completed: owner-approved redesign merged through PR #6 and verified live at `https://thetruehive.com` on 2026-11-14 | Existing CI-gated Render service; verified apex/www TLS and redirects; mail, preview and inventory records preserved; no plan upgrade or operational sales activation |
| AP-03 | Public business telephone confirmed by the owner and published with the services copy | Reuse the confirmed contact sitewide. Only configured, validated social links are shown; no guessed profiles, email setup or inquiry submission is implied |
| AP-09 | Completed: separately approved inventory-only hostname, TLS and private preparation runtime are live on 2026-11-14 | Existing Google/TOTP admin and database, anonymous/forged-session and wrong-host denial verified, public showcase unchanged, checkout disabled, no seeded records; 2 of 2 included domain slots used, no additional charge or plan upgrade |
| AP-11 | Metered product photos approved on 2026-11-14 using the website's existing Google Cloud storage project; separate True Hive bucket and scoped principal provisioned and private GCS roundtrip verified | No personal bucket/key reuse, no change to the separate True Hive Auth project/plan, no fake product/stock seed. Photo code release and live checks follow protected CI and the photo runbook |
| AP-12 | Owner requested a production-facing non-shopping website and removal of unfinished-feature placeholders | Use confirmed business facts and working contact links; hide unconfigured channels. Shopping, payments, indexing settings and explicitly deferred forms remain separate |
| AP-13 | Owner approved parallel ingredients, inventory-priced cart and Stripe sandbox preparation; editable quantities with customer counts only at 1-5 remaining and sold-out at zero; free contact/service email drafts | No invented ingredients/prices/counts, live charges, production-stock test purchases, paid email provider or server-side inquiry storage. Visitors review/send drafts in their email app. Runtime credentials, isolated sandbox setup, migrations and publication remain deliberate follow-up operations |
| AP-14 | Owner approved production publication of the commerce preparation, confirmed the pickup address, and requested an inventory-admin purchase switch with catalog visible while closed | Deploy with purchases closed and runtime checkout disabled. Publish the confirmed pickup address without invented hours; preserve real products/counts and existing orders. No live-payment, paid Tax feature, registration or guessed tax-rate authorization follows from asking whether taxes are calculated |

## Still blocked: needs the owner

| ID | Decision / authorization | Why it is blocked | What can continue without it |
|---|---|---|---|
| AP-02 | Supply real photographs and approve new substantiated product/service claims | Approved original illustrations and concepts are not real product/farm photographs; no credentials, testimonials, ingredients or availability may be invented | Retain approved illustrations, neutral copy and truthful planning states |
| AP-04 | Confirm genuine products, SKUs, USD prices, locations, opening counts and pickup arrangements privately | Concept data must never become physical inventory or a purchase promise | Empty/draft/filtered showcase UX and secure administration code |
| AP-05 | Finish private test credential/webhook wiring and review the Payments/Invoicing/Tax extension decisions | Actual sandbox discovery/planning now works and confirmed the existing hosted-Checkout baseline, but usable credentials and operational test delivery are not verified; no duplicate key generation | Non-transactional website experience, restricted-test-key support and a clearly scoped integration plan; checkout stays disabled |
| AP-06 | Approve any Invoice/Tax fees, confirm invoice use cases and applicable tax registrations/product classifications | Selecting product interests does not approve live invoicing, paid features or tax/legal decisions | Document proposal gaps; do not send invoices, register tax or collect money |
| AP-07 | Participate in real sign-out/access-removal, purchase/expiry/pickup and operational recovery rehearsals | Existing local MFA and empty-backup restore do not prove all real operational journeys | Automated regressions and honest evidence/limits |
| AP-08 | Set backup/recovery ownership, acceptable data-loss window and reconciliation scheduling/monitoring | A script and free-tier history are not an operating agreement or verified schedule | Local restore/testing and operator documentation |
| AP-10 | Approve other future paid assets/resources or analytics/marketing capture if later requested | Conditional boundary, separate from the approved scoped photo storage in AP-11; no analytics/marketing capture is enabled | Local fonts/assets and no-tracking discovery |

AP-01/AP-03/AP-09 are complete and AP-11/AP-12 authorization is received. The remaining blocked rows
gate final business content or operational features, not publication of the
approved honest showcase.
No new sign-in, payment or legal choice was guessed to get around them.

## Explicitly excluded, not awaiting permission

Fake reviews, fabricated visitor/stock counters, artificial urgency, misleading
health/quality claims, hidden charges, forced notifications, infinite engagement
loops and consent manipulation are not part of this design.

## Published website and review artifacts

- **Live website: https://thetruehive.com/**; `www` redirects to the apex while
  preserving paths/queries, and both hostnames have verified HTTPS.
- **Private inventory: https://inventory.thetruehive.com/**; sign in using the
  previously enrolled Google account and authenticator. The hosted login client
  and access boundaries are verified; a new-host authenticated owner rehearsal
  remains manual. Checkout is disabled and the public shop remains showcase.
- PR #6 merged after all three required CI checks; Render identified the exact
  merged release as Live. Real no-JS desktop/mobile routes, assets, focus,
  category filtering, 404 recovery and disabled inventory/checkout were checked.
- Private pre/post DNS snapshots confirm only the apex ALIAS and new `www`
  record changed. Mail/TXT, preview, wildcard and certificate challenges remain.

- [Detailed implementation plan](docs/17-professional-website-plan.md)
- [Broader owner setup checklist](docs/16-owner-setup-checklist.md)
- [Actual Stripe planner baseline and extension plan](docs/18-stripe-payments-invoicing-tax-plan.md)
- [Product-photo architecture and rollout](docs/19-product-photos.md)
- Verified local website preview: **http://127.0.0.1:4330/** on this machine.
- Eight final desktop/mobile screenshots and `metrics.json` are in the session
  artifact directory **`website-review-2026-11-13/`**; they are not published.
- Five additional support/error/readiness captures and metrics are in
  **`website-review-2026-11-14/`**; the preview now includes this continued work.
- Five refreshed no-JS captures and metrics are in
  **`website-sharing-review-2026-11-14/`**, following the original favicon/share
  artwork work and the final combined release gates.
- The detailed plan records actual acceptance results and remaining limits.

## Current handoff status

**WX1-WX3 are complete locally and verified. All authorized local website
requirements are satisfied; the owner-dependent decisions above remain deferred
as requested. The redesign and private inventory hostname are live; checkout and public-catalog activation remain separate.**
The local preview remains loopback-only and leaves inventory/checkout off.
Approved source was released through the required PR/CI process. Existing installed
skills, private credentials, backend authority and the ten-prototype studio are
preserved.

The owner's recorded approval permits this redesign release and apex/www hosting.
The separate inventory-only approval permits private catalog preparation, not
payments, invoices, tax, email or a paid upgrade. Operational/test-commerce
rehearsals remain separate from this private-preparation rollout.
