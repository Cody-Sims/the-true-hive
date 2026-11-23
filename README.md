# The True Hive

**The Apiary Market application foundation, ten preserved design directions, and a local-to-growth business plan** for The True Hive in Madisonville, Tennessee.

Updated **November 18, 2026**. Status: **inventory-backed storefront, native Workbench and private pickup scheduling**. Only Stripe test checkout is implemented; real payments are disabled.

## Build the actual site

Apiary Market (concept 04) is selected. The application uses **Astro + TypeScript, native Node and our own PostgreSQL inventory**, with **no Shopify or Docker**. It includes collection/detail pages, read APIs, health checks, MFA-gated inventory administration and explicitly gated Stripe test checkout. Real payments are not enabled.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run dev
```

Open `http://127.0.0.1:4321/`. Deliberate showcase mode requires no database and does not invent prices/stock. For native build, database, CI and Render details, read [development and operations](docs/14-development-and-operations.md) and the [approved specification](docs/13-production-foundation.md).

**Host boundary:** the public storefront and private inventory/studio share **https://thetruehive.com/**. Inventory, `/team-sprint`, all prototypes, planning documents and their dependencies require the existing Google + TOTP + active administrator membership. A single host-only session enables navigation across these workspaces; revocation applies everywhere. Exact legacy inventory/preview hosts only redirect safe reads; other hosts are denied except process liveness. Pages publishes redirects only, not private files. Follow the [canonical rollout](docs/14-development-and-operations.md#canonical-administrator-rollout). `CATALOG_SOURCE=database`, existing Neon authority, Stripe test-only restrictions and Render's **After CI Checks Pass** deployment remain unchanged; no new paid service is introduced.

Signed-in administrators get a separate, responsive **Private workspace** bar
for Inventory, Team board, Studio and Planning. The public header stays focused
on Store, Services and About us; anonymous visitors never see workspace links.

The commerce preparation adds ordered ingredient editing, location-scoped
low-stock notices, published variant prices and a device-local shopping cart.
Contact inquiries open an email draft that visitors must send themselves; no
email provider or submission backend is required. Contact channels and the form
live together at `/contact`; the collection says **Local Pickup Only** near
the top, with detailed pickup information in the cart. The global header is
**Store / Services / About us**. Cart and pickup navigation appear only in the
store; contact is available through Services and the footer, alongside Privacy
and Accessibility. Apply migration 004 before
deploying ingredient-aware code, and migration 005 before store controls.
Authorized inventory administrators can allow or pause new checkouts under
**Store settings**, while the catalog and cart remain visible. The switch
cannot override runtime payment restrictions; taxes are not yet calculated.
Stripe testing follows the
[sandbox runbook](docs/14-development-and-operations.md#isolated-stripe-sandbox-activation-checklist).
The owner's temporary current-site exception uses only a clearly named
test-stock location, test keys/events and non-indexable pages. Existing
Madisonville balances must not be used for simulated purchases. Ongoing testing
should return to a separate environment before a customer launch.

Customer pages lead with products, ingredients, prices and useful shopping
actions rather than implementation-stage notices. Actual stock states and
checkout admission remain authoritative. When checkout is disabled, its status
appears in the cart; when test mode is configured, shopping pages clearly
identify the test store and no-real-payment/pickup scope.

Each of the four current soap variants has its own original **AI styling reference**
image until real product photos are uploaded. These are photography/composition
examples, not claims about the finished soaps' exact appearance. Uploaded owner
photos take priority. Cards show one product with visible format prices;
choosing a format opens its preselected image and native product-page controls.
Product thumbnails and format radios stay synchronized without changing stock.

Native Add/Edit now uses the selected **Workbench**: form and customer preview
share the page scrollbar, phones open a card/product-detail preview modal, and
bounded account/product-scoped local drafts recover editable fields without
storing photos, stock, SKUs or credentials. Archive, restore-to-draft and guarded
permanent product/variant deletion are distinct audited actions. Products,
locations, orders, history, store settings and sign-in share the inventory shell.

Archive removes a product from the public shelf without deleting its stock or
history. A confirmed archive, restore or deletion keeps the old form locked;
use **Open the authoritative record** to continue with current controls.
Only an in-flight request shows the waiting cursor. The variant identifier
suggestion button and its guidance use separate rows, including on phones.

**Locations** at `/inventory/locations` separates inventory storage from customer
pickup meetup points. Main inventory in Madisonville is the real stock location;
Stripe Sandbox is explicitly test inventory, not a second real storage location.
Choose inventory to view the pickup points it supplies. Meetup points do not
get independent stock counts or require duplicate inventory records.
Authorized operators configure sites, IANA timezones, stock-location mappings, weekly
windows, date overrides, notice/horizon, capacity, cutoff and travel policies.
New databases start with scheduling disabled. The approved Weigel's (Vonore),
Dunkin' (Madisonville) and Pizza Hut (Madisonville) meetup points are configured
as inactive drafts with no hours; provisional policies must be reviewed before
activation. Hours changes require
review of the exact affected appointments, which remain reserved and marked
for review. Paid-unscheduled/help queues and operator-assisted arrangements
remain available in **Pickups** at `/inventory/pickups`, which focuses on
appointments and help rather than a second location manager. Scheduling never
changes stock or marks an order collected. Mobile inventory navigation uses
a collapsed hamburger; Orders, History, Store settings and Team board use the
same workspace cards and hierarchy.

The checkout return page reads server-verified payment and same-browser access
before offering location/date/time selection, confirmation, rescheduling or a
durable help request. Private directions appear only for an authorized paid,
scheduled, not-ended appointment. Lost browser access and legacy orders need
operator assistance, not a public order-ID claim. Apply migrations **007/008**
and the exact private runtime grants **before deploying** this code; see the
[native rollout runbook](docs/14-development-and-operations.md#native-workbench-and-pickup-rollout).
No live payments, actual opening hours or notification provider are enabled.

The preserved [private pickup studio](https://thetruehive.com/prototypes/pickup/)
connects a fictional post-checkout location/date/time flow with an operator
workspace for per-location weekly hours, notice/horizon/slot/capacity examples,
date closures/overrides and impacted appointments. Try booking, rescheduling,
last-slot conflicts, pending payment and no-availability recovery. Changes
connect within the same tab and reset on reload; no customer records, directions,
backend writes, payment, stock or notifications are involved.
The [approved integration plan](docs/21-pickup-scheduling-plan.md) separates appointment
sites from inventory authority and records implementation phases and business
decisions still needing approval. The prototype is not the native booking system.

**01 / Workbench** in the [three-direction comparison](https://thetruehive.com/prototypes/editor/index.html?design=workbench&mode=edit)
now uses one page scrollbar: the form and customer/review column move together,
without an independently scrolling form or a pinned product preview. Section
shortcuts jump within the page; Preview and publication controls stay in reach
in a bottom dock. Phones retain the card/product-page preview modal.
Editable prototype text and variants autosave to a versioned, bounded
`localStorage` draft, separately for Add and Edit. Incomplete drafts restore on
reload; clear/reset requires confirmation. Save failures, corrupt drafts and
other-tab changes are disclosed instead of silently overwriting data.
Photos are never persisted or uploaded; restored drafts ask for reattachment.
Only fictional editable content is stored, not stock/history metadata, real
SKUs, credentials or other application data. Local drafts can be cleared or
evicted by the browser and are not an inventory backup.

The guided review compares **two scrolling prototypes**:

| Prototype | Behavior |
|---|---|
| [Shared page](https://thetruehive.com/prototypes/guided-scroll/?layout=together) | One page scrollbar moves the form and product preview together; neither column has an independent scroll pane. |
| [Compact preview](https://thetruehive.com/prototypes/guided-scroll/?layout=compact) | A smaller summary card fits beside the editor without scrolling. The form is the editor's only scroll area; wheel input over the card also moves the form. |

Switching layouts preserves the draft. The compact card shows up to two title
lines, starting price and active-format count rather than an unbounded format
list. Open the full card/product-page modal for the complete customer view.
Phones and very short compact windows use the pop-out preview instead of an
inline card. Both alternatives retain fictional in-memory data, local-only
photo preview, variant actions and guarded demo publication. No live editor or
inventory behavior is changed. Desktop/laptop/mobile screenshots and real
wheel/keyboard behavior are checked with Playwright.

The improved version also replaces **02 / Guided editor** in the shared
[three-direction comparison](https://thetruehive.com/prototypes/editor/index.html?design=guided&mode=edit).
Its Direction selector keeps Workbench, Guided editor and Variant desk together
at the existing gallery URLs. Both scrolling options, Add/Edit modes and the
mobile product-page modal remain available without an iframe or an extra scroll
wrapper. Unsaved changes require confirmation before changing direction.

The previous prototype refines the owner's chosen **02 / Guided editor**:
**https://thetruehive.com/prototypes/guided-next/**. Previous/Next stay
anchored while each step scrolls independently and retains its inputs, selected
photo and scroll position. On mobile, Preview opens a modal instead of adding
a long card beneath the form. Click its image or format to move from the
collection card into a fuller product-page preview, including current photo,
description, prices, active formats, details and ingredients; return to the
card or close the modal without losing your editing context. Cart controls are
non-operational. This remains a fictional, memory-only prototype; choosing 02
as a base does not deploy an editor redesign to the live inventory.

The **three Add / Edit product-page redesigns** are compared at
**https://thetruehive.com/prototypes/editor/**: Workbench (split editing
canvas), Guided editor (four focused steps), and Variant desk (master/detail
format editing). Each supports adding and editing fictional products, a local
photo preview, publication review, and explicit **Archive variant**, **Restore
variant**, and **Delete variant** controls with confirmations and stock/history
safeguards. Nothing is sent to inventory or uploaded.
Workbench stores local text drafts only; Guided and Variant desk remain
memory-only. These comparison pages remain fictional; native inventory uses
the selected Workbench described above.
The preview landing page now prioritizes this comparison; older concepts are
consolidated in the [design archive](prototypes/archive.html) and their existing
direct URLs remain available.

The earlier storefront concepts remain separately reviewable at
**https://thetruehive.com/prototypes/next/**: Ingredient Atelier,
Honeyglass, Field Notes, Soft Geometry and Night Apiary. Each covers home,
store, product/ingredients and the shared service/about journeys. They use a
static public product snapshot and local demo carts, never live inventory or
payments. The original ten-design studio is preserved; no new concept is
automatically selected for the live storefront.

The earlier **customer product-page-only** studies are at
**https://thetruehive.com/prototypes/product-pages/**: Quick Pick,
Formula Map, Format Studio, Label Room and Gallery Focus. These explore only
the product detail area inside one fixed brand shell, not new home or store
pages. Switch products/formats to compare the four reference images and exact
ingredient lists. Add to cart is a local demonstration without storage,
checkout or inventory requests; normal navigation links open the existing site.

The private inventory home groups variants into collapsible category shelves,
with location-specific stock status and in-stock/out-of-stock filters. Select a
product name or row to open its focused stock inspector; on mobile it opens in
a dialog. Receive stock discloses an audited Add/Reduce form, and quantity
presets only prepare a reviewable change, never a stock mutation by themselves.
Shared navigation, page-heading and select components keep inventory pages
consistent. New-product and location-management shortcuts remain available.
Product editors can move explicit
ingredient blocks out of Details and copy generated ingredient text. Internal
labels encode existing SKUs as Code 128 barcodes, with no retail registrations,
GTINs or provider fees. See the [inventory workbench guide](docs/14-development-and-operations.md#inventory-workbench-and-internal-labels).

## Repository maintenance

The repository's `docs/20-reusable-components-and-cleanup.md` guide records
existing UI boundaries, current extractions, proven-dead code and
separately gated follow-up work. It is repository maintenance guidance, not an
addition to the private studio's source manifest.

## Open the studio

| UI | What you can do |
|---|---|
| [Current design review](prototypes/index.html) | Compare three Add / Edit product layouts with explicit variant lifecycle actions |
| [Earlier design archive](prototypes/archive.html) | Revisit the ten original directions and later storefront/product-page studies |
| [Project and business hub](prototypes/plan.html) | Read the actual plans, requirements, research, phases and business roadmap inside the UI |
| [Partner workbook](prototypes/plan.html?doc=questions) | Review confirmed decisions and the unanswered questions to discuss together |
| [Store preview](prototypes/store.html?design=hearth) | Browse/filter concepts, choose variants, build a demo cart and inspect checkout handoff |
| [Inventory lab](prototypes/inventory.html?design=hearth) | Explore fictional variant/location stock, sold-out and inventory-outage states |

Use the authenticated native app, not `file://` or a repository-root HTTP server, for the studio. The production entry point is **https://thetruehive.com/prototypes/**. For local setup:

```sh
git clone https://github.com/Cody-Sims/the-true-hive.git
cd the-true-hive
npm ci --ignore-scripts
npm run dev
```

Configure the real isolated Firebase/TOTP/membership credentials privately and use a matching development loopback `SITE_URL` before signing in. Then:

```sh
open http://127.0.0.1:4321/prototypes/
open http://127.0.0.1:4321/prototypes/plan.html
```

The only studio browser-rendering dependency is the locally served, pinned Markdown parser; no CDN, remote font, live social feed or third-party tracking is loaded. Core homepage concepts still use ordinary HTML/CSS/SVG. `npm test` runs prototype and application unit cases; database and built-browser gates are separate commands in the operations guide.

For an existing checkout, skip the clone step. The [sharing/CI guide](docs/12-sharing-and-deployment.md) describes native deployment and mandatory replacement of the earlier public Pages site with canonical redirects. Mail settings remain unchanged.

After editing planning or prototype sources, refresh the native development app or rebuild/restart the native server. `npm run build:pages` and `npm run preview` intentionally contain only redirects, never the studio.

**Contact behavior:** the Contact page shows the current approved/configured channels. The inquiry form prepares an email draft for the visitor to send; repository maintenance does not configure mail delivery, forwarding or a mailbox.

## Confirmed direction

**Product-led local sales; local pickup first, shipping later.** Build on the existing small-scale soap business and beekeeping, rather than assuming every prototype product is ready. Retail honey is not available merely because a honey jar appears in a mockup: the owner reports that the next harvest already has a purchaser. See the [business plan](docs/09-local-business-launch-plan.md) for the owner-approved current context and allocation constraints.

The store is **our own primary-domain experience**, with PostgreSQL-authoritative stock/order rules and explicitly gated Stripe card-only test checkout. Earlier Shopify recommendations are superseded. Render manages infrastructure, not merchandising/inventory ownership; live sales remain a separate explicit gate.

**Inventory administration:** [secure inventory administration and connected checkout](docs/15-inventory-admin-and-commerce.md) documents the deployed `inventory.thetruehive.com` workspace, using an isolated Firebase identity project, mandatory app-enforced MFA and PostgreSQL admin membership. Product/location management, audited count changes, Stripe card-only test checkout and Record pickup share the same PostgreSQL authority. Payment admission remains explicitly gated; no live charges or provider upgrades are authorized by repository cleanup.

**Apiary Market is selected.** All ten directions remain available for comparison/history. Selection is an owner decision, not a proven conversion-rate ranking.

## Ten design directions

| Concept | Visual hypothesis | Explore |
|---|---|---|
| 01 - Meadow & Amber | Warm heritage editorial, balanced story | [Home](prototypes/meadow.html) / [Store](prototypes/store.html?design=meadow) |
| 02 - Fieldwork | Modern working apiary, service-forward reference | [Home](prototypes/fieldwork.html) / [Store](prototypes/store.html?design=fieldwork) |
| 03 - Hive & Hearth | Premium plum, sculptural product rituals | [Home](prototypes/hearth.html) / [Store](prototypes/store.html?design=hearth) |
| 04 - Apiary Market | Neighborhood market and tactile product shelf | [Home](prototypes/market.html) / [Store](prototypes/store.html?design=market) |
| 05 - Honey House | Contemporary studio and architectural product grid | [Home](prototypes/honeyhouse.html) / [Store](prototypes/store.html?design=honeyhouse) |
| 06 - Blue Ridge | Blue landscape editorial and local goods | [Home](prototypes/ridge.html) / [Store](prototypes/store.html?design=ridge) |
| 07 - Golden Hour | Sunlit terracotta maker collection | [Home](prototypes/golden.html) / [Store](prototypes/store.html?design=golden) |
| 08 - The Quiet Hive | Precise cream-and-ink minimalism | [Home](prototypes/quiet.html) / [Store](prototypes/store.html?design=quiet) |
| 09 - Bloom & Field | Botanical frames and seed-catalog sensibility | [Home](prototypes/bloom.html) / [Store](prototypes/store.html?design=bloom) |
| 10 - The Hive Journal | Newspaper-like editorial commerce | [Home](prototypes/journal.html) / [Store](prototypes/store.html?design=journal) |

Each has an independently composed homepage and a coordinated collection/product/cart/checkout preview. Shared commerce behavior is intentional: no need for ten divergent stock engines to compare visual directions.

All prices, product formats, packaging and quantities in the shop are **fictional fixtures**. The cart stores only sample variant IDs and quantities in this browser; it does not reserve stock, collect personal information, take payment or create orders. Try the normal, last-jar, sold-out and inventory-unavailable scenarios. Social/contact destinations remain pending rather than invented.

## Planning library

| Document | Purpose |
|---|---|
| [00 - Requirements](docs/00-project-brief.md) | Scope, production-versus-demo boundaries, measurable acceptance |
| [01 - Market research](docs/01-market-and-design-research.md) | Local/regional and national examples, evidence and limits |
| [02 - Experience and content](docs/02-experience-and-content.md) | Product-first customer journeys, services, social and content approvals |
| [03 - Architecture](docs/03-architecture.md) | Initial site versus integrated commerce; readable module boundaries |
| [04 - Data contracts](docs/04-data-and-integrations.md) | Content, products, inquiry and integration ownership |
| [05 - Decisions and risks](docs/05-decision-register.md) | Confirmed choices, recommendations and review triggers |
| [06 - SEO and acquisition](docs/06-storefront-seo-and-acquisition.md) | Crawlable commerce, local discovery, trust and customer funnel |
| [07 - Inventory and operations](docs/07-inventory-and-operations.md) | Variant/location stock, pickup, allocations, concurrency and owner workflows |
| [08 - Prototype comparison](docs/08-prototype-expansion.md) | Ten-concept rationale, shared journeys and evaluation criteria |
| [09 - Business launch plan](docs/09-local-business-launch-plan.md) | Existing soap business -> reliable local sales -> disciplined growth |
| [10 - Partner workbook](docs/10-partner-workbook.md) | Confirmed facts, open decisions, owners and gates |
| [11 - Business readiness evidence](docs/11-business-readiness-evidence.md) | Verified federal guidance versus unverified Tennessee/local confirmation needs |
| [12 - Sharing and CI/CD](docs/12-sharing-and-deployment.md) | Public approval, static artifact boundaries, deployment and recovery |
| [13 - Application foundation](docs/13-production-foundation.md) | Approved custom frontend/backend slice, contracts and acceptance |
| [14 - Development and operations](docs/14-development-and-operations.md) | Actual commands, native PostgreSQL, required CI, Render and recovery |
| [15 - Secure inventory phase](docs/15-inventory-admin-and-commerce.md) | Approved admin/MFA and test-checkout contracts, shared stock accounting, parallel ownership and activation gates |

The hub renders these source files directly, including tables, diagrams, citations and internal links. There is no separate stale summary masquerading as the full plan.

## Website delivery phases

| Phase | Outcome | Gate |
|---|---|---|
| [0 - Discovery and selection](docs/phases/00-discovery-and-design.md) | Business inputs, research, shortlist and approved direction | Owner approves real facts, scope and design |
| [1 - Foundation](docs/phases/01-engineering-foundation.md) | Small production app, content contracts, controlled preview | Reproducible accessible foundation |
| [2 - Product-led local landing](docs/phases/02-landing-page-launch.md) | Real identity/contact/social; honest goods and planned services | No fake claims, stock, fulfillment or broken contact |
| [3 - Real local catalog](docs/phases/03-local-catalog-and-leads.md) | Approved products, useful detail and reliable inquiry/publishing | Actual product/operating information can stay current |
| [4 - Integrated store and inventory](docs/phases/04-commerce-and-inventory.md) | Real same-site store, hosted checkout, pickup and managed stock | Operational test purchase and owner training complete |
| [5 - Measured growth](docs/phases/05-operations-and-growth.md) | Justified workflow, channel and shipping improvements | Evidence supports the maintenance/operating cost |

Business milestones **B0-B6** in the business plan are a separate readiness roadmap. A completed website design does not satisfy legal/product/pickup/production readiness. Basic inventory administration launches with commerce, not after orders are taken.

## Privacy and release boundary

The earlier public Pages approval is superseded by authenticated studio access and a redirect-only artifact. The repository and historical GitHub source remain public; application authentication does not erase previously disclosed copies. Future confidential details, buyer identity/terms, private finances, credentials and customer records must not enter public Git. **Noindex is not authentication.**

The Pages build publishes only fixed canonical redirect HTML, `.nojekyll` and empty-source metadata. The native server bundles the complete current studio privately, including binary images. Review all future public commits; files excluded from Pages are still visible if committed to the public repository.

Before public launch, resolve the relevant [partner-workbook questions](docs/10-partner-workbook.md), approve real copy/assets/contacts, and implement only the selected production direction.
