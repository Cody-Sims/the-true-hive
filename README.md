# The True Hive

**The Apiary Market application foundation, ten preserved design directions, and a local-to-growth business plan** for The True Hive in Madisonville, Tennessee.

Updated **October 29, 2026**. Status: **owner-approved public planning and interactive review**, not a production storefront.

## Build the actual site

Apiary Market (concept 04) is selected. The application uses **Astro + TypeScript, native Node and our own PostgreSQL inventory**, with **no Shopify or Docker**. The first slice has collection/detail pages, read APIs, health checks and private transactional inventory foundations, not live checkout or an exposed admin.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run dev
```

Open `http://127.0.0.1:4321/`. Deliberate showcase mode requires no database and does not invent prices/stock. For native build, database, CI and Render details, read [development and operations](docs/14-development-and-operations.md) and the [approved specification](docs/13-production-foundation.md).

**Host boundary:** `preview.thetruehive.com` keeps all prototypes. The actual application targets `thetruehive.com` on native Render after host/content readiness, with Neon PostgreSQL in the same Oregon region. The selected infrastructure is a $7/month Render app in a Hobby workspace and Neon Free, not a paid Neon or Render database. The main-domain DNS remains unchanged.

## Open the studio

| UI | What you can do |
|---|---|
| [Design gallery](prototypes/index.html) | Compare ten original homepage directions and their coordinated store flows |
| [Project and business hub](prototypes/plan.html) | Read the actual plans, requirements, research, phases and business roadmap inside the UI |
| [Partner workbook](prototypes/plan.html?doc=questions) | Review confirmed decisions and the unanswered questions to discuss together |
| [Store preview](prototypes/store.html?design=hearth) | Browse/filter concepts, choose variants, build a demo cart and inspect checkout handoff |
| [Inventory lab](prototypes/inventory.html?design=hearth) | Explore fictional variant/location stock, sold-out and inventory-outage states |

Use the local HTTP preview, not `file://`, for the gallery's interactive features, shop and planning viewer. If the server is already running, open **http://127.0.0.1:4173/prototypes/**. Otherwise:

```sh
git clone https://github.com/Cody-Sims/the-true-hive.git
cd the-true-hive
npm ci --ignore-scripts
npm run preview
```

In another terminal:

```sh
open http://127.0.0.1:4173/prototypes/
open http://127.0.0.1:4173/prototypes/plan.html
```

The only studio browser-rendering dependency is the locally served, pinned Markdown parser; no CDN, remote font, live social feed or third-party tracking is loaded. Core homepage concepts still use ordinary HTML/CSS/SVG. `npm test` runs prototype and application unit cases; database and built-browser gates are separate commands in the operations guide.

For an existing checkout, skip the clone step. The [sharing/CI guide](docs/12-sharing-and-deployment.md) describes automatic deployment from reviewed `main` updates and the custom preview hostname, **https://preview.thetruehive.com/**. The main domain and mail settings remain unchanged; confirm the custom hostname's HTTPS readiness before sharing it.

**Contact direction:** phone and verified social profiles for now. `contact@thetruehive.com` is documented for future use only; no forwarding/mailbox is being activated, and actual phone/profile values still need owner confirmation.

## Confirmed direction

**Product-led local sales; local pickup first, shipping later.** Build on the existing small-scale soap business and beekeeping, rather than assuming every prototype product is ready. Retail honey is not available merely because a honey jar appears in a mockup: the owner reports that the next harvest already has a purchaser. See the [business plan](docs/09-local-business-launch-plan.md) for the owner-approved current context and allocation constraints.

The future store is **our own primary-domain experience**, with PostgreSQL-authoritative stock/order rules and a later selected payment processor. Earlier Shopify recommendations are superseded. Render manages infrastructure, not merchandising/inventory ownership; admin authentication and payment lifecycle remain explicit follow-up gates.

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

The owner approved the **complete current planning snapshot** for a public repository/Pages review on 2026-10-28. Future confidential details, buyer identity/terms, private finances, credentials and customer records are not included in that approval. **Noindex is not authentication.**

The Pages build publishes a curated static artifact, not the repository root. This is not the future production business site: real commerce uses appropriate hosting and excludes review plans, demo catalog/stock and sample carts. Review all future public commits; even files excluded from Pages are visible if committed to the public repository.

Before public launch, resolve the relevant [partner-workbook questions](docs/10-partner-workbook.md), approve real copy/assets/contacts, and implement only the selected production direction.
