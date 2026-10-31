# Specification: Apiary Market application foundation

Status: **scope approved by the owner on 2026-10-29**. This supersedes earlier Shopify recommendations for this project.

## Objective

Build the real True Hive application from **concept 04, Apiary Market**, with a custom storefront and custom PostgreSQL inventory foundation. Preserve all ten prototypes at `preview.thetruehive.com`. The eventual customer-facing site belongs at **`thetruehive.com`**, using native Render application hosting and Neon PostgreSQL.

The approved first slice is a product-led site and working backend foundation, **not live checkout or an exposed administration system**. The owner's later hosting approval selects one $7/month Render app in a Hobby workspace plus Neon Free PostgreSQL, both in Oregon. Paid database/plan upgrades and the production-domain cutover remain separate; no Docker.

## Users and use cases

| User | Scenario | Outcome |
|---|---|---|
| Local shopper | Explores goods, pickup expectations and the maker story | Understands actual versus concept information and finds approved contact channels |
| Homeowner/grower | Looks for planned beekeeper services | Finds distinct scope/inquiry guidance without a false booking promise |
| Owner/developer | Connects a real catalog database | Publishes approved product records without copying prototype prices/stock |
| Trusted operator, future admin | Adjusts a physical count through an authorized application layer | Transactional stock and an attributable, idempotent audit record |
| Maintainer | Proposes a code/schema change | Required CI passes before merge; the existing preview stays intact |

## Requirements

| ID | Requirement |
|---|---|
| A1 | Translate Apiary Market into readable Astro components and shared TypeScript content/types, not a second hand-edited copy of every prototype. |
| A2 | Provide crawlable home, goods, product, story and service routes with responsive/keyboard-accessible behavior. |
| A3 | Preserve all prototype URLs, the planning hub, its public-document allowlist and the existing static Pages export. Production output must not contain review plans or demo-cart scripts. |
| A4 | Use one Node-capable Astro application with clear server modules and PostgreSQL. No Shopify integration or separate microservices. |
| A5 | Provide read-only catalog/product/availability APIs and liveness/readiness endpoints. Bound and validate public inputs; use safe error responses and parameterized SQL. |
| A6 | Model products, variants/SKUs, locations, physical stock, commitments/holds and append-only stock movements with database constraints. Forecast harvest and buyer agreements are not sellable stock. |
| A7 | Provide an internal transactional on-hand adjustment operation with a trusted actor/reason, explicit conflicts and idempotent operation IDs. Do not expose it through a public HTTP route. |
| A8 | Distinguish intentional, clearly labeled showcase data from a real database catalog. Database failure/missing configuration/schema must never silently return fictional stock or prices. |
| A9 | Keep email deferred. Use only supplied/validated phone and social values; absent values remain honest nonfunctional placeholders, not invented links. |
| A10 | Keep checkout/payment, customer data, authenticated admin, reservations and real inventory import out of this slice. No payment keys or public stock-edit API. |
| A11 | Provide reproducible native Node application builds, migrations and documented deployment/rollback steps; do not use Docker or repoint the main domain before a host is configured. |
| A12 | Require protected pull requests and passing checks for preview integrity, application quality/build/browser behavior and real PostgreSQL integration before merge. Main changes deploy only after these gates. |

### Non-functional

Target WCAG 2.2 AA, 320/375/768/1440 px reflow, visible keyboard focus and reduced motion. Prefer HTML-first content and existing original local illustrations; no remote fonts, social embeds or invented reviews.

Use strict TypeScript and compatible pinned dependencies. PostgreSQL transactions use one checked-out client; connection/query timeouts are bounded. Database credentials, operator/audit details and raw SQL errors never appear in public responses or frontend bundles.

Default the new, unapproved production draft to **noindex**. Real canonical URLs use the chosen site origin; no mock Product offers/ratings. Indexing, live catalog/claims and real purchase behavior each require an explicit readiness decision.

## Non-goals

Live payment, an order/payment engine, customer accounts, custom authentication, public inventory mutations, business-email activation, shipping, manufacturing/BOM/lot software, paid database/plan upgrades, real inventory imports, or a production-domain cutover.

The internal count operation is not proof of secure owner administration. A later admin must supply authenticated/authorized actor identity and access control. Future payment/order reservations need a separately specified transactional design.

## Existing-system constraints

The root package currently supports the prototype/planning studio. Extend it without introducing a monorepo. Keep the existing `dist/` Pages artifact and give the Node application a separate **`dist-site/`** build output. Production source lives under `src/`; the review source remains under `prototypes/`.

The original SVG artwork may be reused as build-time image assets; prototype HTML, browser storage, fictitious prices and stock must not become production business data.

Main is now protected: pull requests and the existing `verify-and-build` check are required, including for administrators. Add the new stable application/DB gate contexts before merging this feature.

## Interfaces and data contracts

| Interface | Contract |
|---|---|
| `GET /api/catalog` | Source mode and safe published product/variant DTOs; no audit/private stock details |
| `GET /api/products/:slug` | One published product or a genuine 404; bounded slug validation |
| `GET /api/availability?variant=...&location=...` | Explicit location-scoped state; concepts are not real stock; no aggregate pickup promise |
| `GET /api/health/live` | Process liveness, independent of database availability |
| `GET /api/health/ready` | Explicit configured mode and actual database/schema readiness when database mode is selected |
| Internal on-hand adjustment | Variant/location, integer delta, UUID operation ID, trusted actor key and reason; atomic stock/ledger write and explicit replay/conflict |
| Migrations | Ordered SQL plus stored checksums; transactional application and drift rejection, not automatic destructive startup changes |

Production catalog mode uses PostgreSQL exclusively. Showcase mode uses separately labeled editorial concepts with no real sellable quantities or offers. No hidden fallback between them.

## Security and privacy

No public write route, customer form or payment data in this slice. Validate configuration and origin/URL fields; do not log secrets or full database exceptions. Keep database modules out of client code. Separate pooled read-only runtime credentials from the direct schema-owner connection. Remote TLS verifies certificates; the owner approved opportunistic, not strict required, channel binding.

Public responses omit internal quantities, adjustment actor/reason and audit history. Internal operator identifiers are not customer emails. Secure transport, backups, database role provisioning and owner authentication remain deployment/admin gates, not silently claimed features.

## Errors and edge cases

| Case | Expected outcome |
|---|---|
| Unknown/unpublished product or variant | 404 without disclosing draft records |
| Invalid/oversized query key | 400, not a query against arbitrary input |
| Database unavailable or migration missing | 503/setup-unavailable state; no fictional fallback |
| Concept product | Explicit concept state; no real availability/price or checkout |
| Disabled pickup location | Not offered, not summed with other locations |
| Count reduction would consume committed/held units | Conflict; neither stock nor audit changes |
| Two withdrawals compete for the last unit | At most one succeeds; constraints and row locks prevent negative stock |
| Same operation retried concurrently | One stock change and one ledger record; matching retries return the recorded result |
| Operation ID reused for different content | Conflict, not a second mutation or a misleading replay |
| Audit insert fails | Roll back the associated count change |
| Attempt to alter/delete an audit movement | Rejected by the database's append-only guard |

## Acceptance criteria

| Covers | Evidence |
|---|---|
| A1-A2 | Built application and browser tasks at narrow/desktop widths, keyboard and automated accessibility checks |
| A3 | Existing prototype tests, source/export link gates, curated build inspection and review-site smoke checks |
| A4-A5 | Server starts as a Node artifact; read APIs and health routes behave correctly with real HTTP responses |
| A6-A7 | Real PostgreSQL migration/constraint/concurrency/idempotency/rollback integration cases |
| A8-A10 | Missing/outage/concept-state cases; no public mutation/payment/email route or private audit fields in DTOs |
| A11 | Reproducible portable Node artifact and development/operations runbook; main-domain DNS remains unchanged |
| A12 | Observed PR CI results and verified required-status-check/PR protection on main |

## Open questions

Owner/partner: actual phone/social URLs, approved soap records/labels/photos/prices, pickup location/process, public copy and real inventory counts. Hosting: quota monitoring, backups and recovery ownership for the selected Render/Neon tiers. Later: authenticated owner roles, payment processor/order lifecycle, lot/batch needs and shipping.

These remain visible in the partner workbook. Infrastructure provisioning must not import prototype fixtures or enable real orders.

## Alternatives considered

- **Shopify:** explicitly rejected by the owner for storefront/inventory ownership; earlier recommendations are superseded.
- **Separate frontend/API services now:** unnecessary operational/CORS complexity for this first modular application; boundaries allow a later split if justified.
- **Next.js:** credible alternative, but Astro matches the selected HTML-first site without needing React/client state.
- **Custom admin/payment now:** outside the approved foundation and unsafe to imply without authorization/order requirements.

## Rollout and rollback

Preserve the static prototype preview. Build the production app separately, validate it through CI and local/staging operation, then deploy the reviewed source and native Node build to Render. Startup validates database/schema before listening; routine host checks use liveness so Neon may scale to zero. The owner's later **no Docker** instruction supersedes the initial container suggestion. CI uses the runner's native PostgreSQL installation. Do not change `thetruehive.com` DNS as part of this foundation.

Use reviewed PRs; passing checks are not a guarantee of zero defects. Restore a known-good application artifact for regressions without restoring old inventory over current records. Apply forward-compatible migrations deliberately; back up real databases before later schema changes.

## Ordered implementation tasks

| Task | Dependencies | Files / ownership | Acceptance and verification | Size |
|---|---|---|---|---|
| F1 - Scaffold | Approved scope | package/lock, Astro/TS config, `src/env.d.ts` | Supported versions, separate output; `npm run check` and `npm run build:site` | S |
| F2 - Data contracts | F1 | `src/server/`, `src/content/`, unit tests | Explicit configuration/source/error contracts; targeted native Node tests fail then pass | S |
| F3 - Database | F2 | `migrations/`, migration CLI, inventory repository, DB tests | Real constraints and transactional cases; `npm run test:db` against isolated PostgreSQL | M |
| F4 - Public API | F2-F3 | `src/pages/api/`, response helpers | Real read/status behavior and no public writes; unit/HTTP checks | S |
| F5 - Apiary Market UI | F1-F2 | layouts/components/pages/styles | Matching design and useful honest routes; production build and browser tasks | M |
| F6 - Operations/CI | F3-F5 | native artifact packaging, workflows, browser tests, runbook | Required CI including native real DB and built-site browser checks; no deploy from failing PR | M |
| F7 - Integration | F6 | docs, registries, focused fixes | All gates pass; protected merge; existing preview still serves ten designs | S |

F3 and F5 may proceed independently only after the F2 DTO/content contracts are frozen and with disjoint files. Shared package/configuration, API integration, documentation registry and final merge remain serialized.
