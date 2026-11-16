# Development, deployment, and inventory operations

Status: **owner-approved inventory-backed public catalog and private inventory preparation**, not an activated checkout. No Shopify, Docker, active checkout or email setup.

## Public application, private workspace and preserved review

| Surface | Source | Build | Hosting |
|---|---|---|---|
| Ten-design review and planning hub | `prototypes/` and registered documents | `dist/` | Existing GitHub Pages / `preview.thetruehive.com` |
| Apiary Market application | `src/` and `migrations/` | `dist-site/` | Existing native Render service at `https://thetruehive.com`; Neon PostgreSQL remains the selected database |
| Private inventory workspace | Same application, `/inventory/` and `/api/admin/` | Same `dist-site/` | `https://inventory.thetruehive.com`; same service and database, Google/TOTP and server-side membership required |

Production uses original prototype illustrations and first-party brand assets in `src/assets/`, not prototype HTML, scripts, demo prices or browser cart. Application public output excludes plans, database code and review files.

## Run the application

Requirements: Node 24 and the committed npm lockfile. PostgreSQL is **not needed to view the deliberate concept collection**.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run dev
```

Open `http://127.0.0.1:4321/`. For a built server:

```sh
npm run build:site
npm run check:site-artifact
npm run start
```

The prototype viewer remains `npm run preview` on port 4173. It builds the curated Pages artifact and serves only `dist/`, not the repository root containing private configuration. After editing review documents or prototypes, run `npm run build:pages` and refresh, or restart the viewer. Do not point it at the production output or ship the repository root as the business site.

Native deployment retains the checked-out private `src/server/`, `scripts/start-site.mjs`, dependencies and `dist-site/` together. The start wrapper imports source modules for preflight, then starts the built entrypoint in the same process; `dist-site/` alone is not a complete deploy package. Serve only `dist-site/client/` as public static assets.

## Runtime configuration

Copy `.env.example` to an ignored `.env` **only if needed**. Native start/dev commands load it through Node's env-file option; CI and Render supply environment variables directly.

| Variable | Meaning |
|---|---|
| `SITE_URL` | Canonical site origin; default `https://thetruehive.com`, HTTP loopback allowed locally |
| `SITE_INDEXABLE` | `false` initially; cannot be enabled with showcase source |
| `CATALOG_SOURCE` | Explicit `showcase` or `database`; production uses `database`, local default remains `showcase`; no automatic fallback |
| `STOREFRONT_LOCATION_KEY` | Optional explicit pickup location for public stock states; counts appear only at 1-5 available, with no count at normal stock levels |
| `DATABASE_URL` | Private pooled connection using a least-privilege read-only role for the current public APIs |
| `MIGRATION_DATABASE_URL` | Private direct schema-owner connection for the migration CLI, not a frontend setting; a blank value falls back to `DATABASE_URL` |
| `DATABASE_TLS` | `verify-full` by default; `disable` is restricted to local development targets |
| `CONTACT_PHONE` | Optional public-number override; unset/blank uses the owner-approved business contact in `src/content/service-contact.ts` |
| `FACEBOOK_URL`, `INSTAGRAM_URL` | Approved HTTPS platform profiles; unset channels are omitted from the public contact area |
| `HOST`, `PORT` | Native server bind address/port; Render supplies its port |
| `ASTRO_TELEMETRY_DISABLED` | Set to `1` for build/check environments |

Never commit actual database URLs, passwords, destination inboxes, payment keys or customer data. Generated `.env`, `.env.local` and `.neon` context are ignored. Verify ignore rules before capturing credentials; keep private configuration files owner-readable only. Email stays deferred.

## Native PostgreSQL

The schema supports PostgreSQL 16+. CI uses the runner's native PostgreSQL 16, **not a container**. Local integration verification used an isolated native PostgreSQL cluster, not the default/global data directory.

Provision a dedicated Neon application database and separate runtime/operator credentials. Run privately with the direct owner connection:

```sh
npm run db:migrate
```

Migrations create **empty tables**, not business stock. They run transactionally under a migration lock, store checksums and reject changed/deleted applied history or newly backfilled files that sort before it. Add a new forward migration after the latest applied file; do not rewrite or retroactively insert migration history.

For database tests, provision a separate database named **`true_hive_test`**, set `TEST_DATABASE_URL` privately, and run:

```sh
npm run test:db
```

Tests create/drop their own randomly named schema inside that dedicated database. Do not use production credentials or a real inventory database. CI creates its own role/database with ephemeral test credentials.

## Custom inventory authority

`products` and `product_variants` hold approved records; `inventory_locations` determines pickup eligibility; `inventory_levels` constrains committed/held counts within physical stock. `inventory_movements` records attributable corrections and rejects editing/deleting history.

`adjustStock` is an **internal server function**, not an HTTP API. It validates the operation, serializes its idempotency key, locks the stock row, and commits balance/history together. Matching retries return the recorded result; different content under the same operation ID is a conflict. Audit failure rolls back the count.

This is not owner authentication, checkout reservation, manufacturing/lot tracking or a complete order engine. Those need separate role, lifecycle and reconciliation specifications.

Public APIs show only published products and coarse selected-location availability. Internal SKUs, exact quantities and audit actor/reason never enter public DTOs. Database outages/missing schema produce explicit unavailable responses, not concepts substituted for real stock.

The initial catalog has a deliberate 100-product bound. A larger published catalog fails with a capacity-review state rather than silently hiding records; add crawlable pagination before expanding beyond that launch limit.

## Application endpoints

| Route | Behavior |
|---|---|
| `/api/catalog` | Explicit source and published safe product DTOs |
| `/api/products/:slug` | One published product; genuine missing/invalid responses |
| `/api/availability?variant=...&location=...` | Selected-location state, never summed pickup stock |
| `/api/health/live` | Process liveness |
| `/api/health/ready` | Deliberate mode and actual database/schema readiness in database mode |

No public stock editing, admin, payment or inquiry submission route exists. The first site's concepts have no real price/quantity or Buy button.

`npm run start` validates the selected configuration and, in database mode, the actual public query shapes and read permissions **before listening**. PostgreSQL `EXPLAIN` checks catalog and availability tables/columns without scanning stock; one surviving table is not enough to pass. It does not run migrations automatically. Its temporary preflight pool is closed afterward. Render's routine health path is `/api/health/live`; continuously polling `/api/health/ready` would wake free Neon compute and consume its quota. Use readiness deliberately during setup, releases or incident diagnosis. Runtime database failures still return explicit unavailable responses rather than fictional fallback data.

Render can choose any verified custom domain as the `Host` for its
[HTTP health checks](https://render.com/docs/health-checks). Exact GET/HEAD
`/api/health/live` therefore remains reachable on the inventory hostname even
while inventory is disabled. It exposes only process status, not database or
business data. Inventory APIs, private pages and `/api/health/ready` retain their
existing private-host gates; do not replace the liveness probe with a stock or
database query.

## CI gates and branch safety

| Required check | Evidence |
|---|---|
| `verify-and-build` | Preserved prototype tests, registered document/link checks and curated Pages export |
| `site-checks` | Format, Astro/TypeScript diagnostics, unit contracts, native build, public-artifact/deploy policy and built-site Playwright/axe |
| `inventory-checks` | Native PostgreSQL migrations, constraints, last-unit competition, idempotency, audit rollback and public projection |

Main requires pull requests, passing checks and up-to-date branches; administrators are not exempt. PRs do not deploy the Pages review. Add all three observed required contexts before merging the application feature. The Render blueprint follows **main** and uses **`autoDeployTrigger: checksPass`**, not deploy-on-commit.

Render considers successful/neutral/skipped checks acceptable; therefore our required gate jobs deliberately run without path-based skip conditions. Operators must not manually deploy an unchecked commit. These controls reduce regressions; they cannot guarantee zero defects.

## Render and Neon setup

The selected starting infrastructure is **one $7/month native Render web service in a Hobby workspace and Neon Free PostgreSQL**, both in Oregon (`oregon` / `aws-us-west-2`). The Blueprint declares no Render database, Docker runtime, Pro workspace or paid Neon plan. Recheck public prices before provisioning; usage, future quotas and separately approved upgrades can change operating costs.

Only apply the Blueprint after this application's PR is merged and main checks pass. It now selects the approved database-backed public catalog; supply the existing private runtime connection separately. Noindex and disabled checkout remain unchanged. Use PostgreSQL 16 to match the native integration baseline.

**Hosting status - 2026-11-14:** the owner-approved redesign is live at
**https://thetruehive.com/**, initially in deliberate showcase mode after PR #6 merged
with all required checks passing. Render's actual service UI identified release
`9fffa65e1ff423a9417da1d3cff7440a892d8547` as **Live**. The service remains
connected to this repository's `main` branch with **After CI Checks Pass**.
The existing `https://the-true-hive-app.onrender.com/` endpoint remains enabled.
The owner subsequently approved the database-backed catalog described below.
`inventoryConnected` describes whether the **public catalog source** is database
mode, not whether private administration is enabled. Neither the public website
release nor catalog activation enables sales.

### Public catalog activation - 2026-11-14

The owner approved showing inventory-managed products in the public store.
The existing Render service now uses `CATALOG_SOURCE=database`, matching the
Blueprint. Published, non-archived products and active variants come directly
from the shared PostgreSQL catalog; there is no separate product copy or sync
job. Drafts remain private, and database failures do not substitute demo goods.

Read-only checks confirmed the single published product, **The True Soap**,
appears in `/api/catalog`, the homepage, `/goods` and `/goods/the-true-soap`.
The original three showcase products no longer appear in the live collection.
`CHECKOUT_MODE=disabled` and `SITE_INDEXABLE=false` were preserved; no products,
stock counts, prices, permissions, payment settings or DNS records were changed.
Continue to publish or unpublish products through the private inventory workspace.
Keep local development and fixture-based browser tests explicitly in showcase
mode when a database-backed catalog is not required.

### Ingredients, quantities, cart and inquiry preparation

The owner approved parallel implementation of ingredient editing, inventory-priced
cart preparation, limited customer stock visibility and a free email-draft inquiry
form. This approval does not enable checkout on the operational database or
authorize live payments, new paid resources or fabricated product facts.

- Apply `004_product_ingredients.sql` with the private migration-owner connection
  before deploying code that reads the new column. Existing products receive an
  empty list; enter only confirmed ingredients through the product editor, one
  per line in the intended order. Limits are 40 ingredients and 200 Unicode
  characters per ingredient. Omitted legacy fields preserve saved values; an
  explicit empty list clears them.
- Apply `005_storefront_settings.sql` before deploying store-control code. It
  creates one closed-by-default purchase setting and extends the existing
  immutable admin-operation action list. Give the public read role `SELECT`
  on `storefront_settings` and the private inventory role only `SELECT, UPDATE`.
  The migration does not guess role names or grant privileges automatically.
- Continue changing physical quantities through the existing audited inventory
  adjustment workflow. Public sellability subtracts held, committed and
  unavailable units from on-hand stock at `STOREFRONT_LOCATION_KEY`. At 1-5
  available, show `Only N left`; at zero, show `Sold out`; above five, omit exact
  quantities from both the page and public JSON. Missing levels are unverified,
  not assumed zero. An unconfigured storefront location omits stock information.
  The caller-selected availability endpoint retains only coarse availability
  outside the configured storefront location; it never exposes another
  location's exact low-stock count.
- Published active variants show their database prices even when checkout is
  disabled. The cart stores only bounded variant identities and quantities,
  refreshes canonical prices, and never reserves stock merely by adding an item.
  The checkout server remains the price and allocation authority. Concepts and
  unpriced variants are not merchandise offers. A pending test checkout retains
  its opaque request identity and frozen variant quantities in session storage.
  Only a matching server acknowledgment of a settled order or confirmed release
  clears that pending intent; the cart stays unchanged and another checkout
  requires an explicit action. Recovery displays the frozen checkout selection
  separately, then reloads the latest saved cart before allowing edits or a new
  checkout, preserving changes made in another tab.
- The inquiry form prepares a visitor-owned email draft at no email-service
  cost. It does not submit a request to the server, store personal form data,
  claim delivery or confirm a booking. Visitors must review and send the draft
  in their email app; the direct email link remains available without JavaScript.
  Messages are bounded to 600 characters and encoded draft links to 2,000;
  over-limit content is preserved for manual email rather than truncated.
  Contact channels and the form live at `/contact`, reached from Services and
  the footer rather than promoted throughout the shopping flow. The global
  header contains Store, Services and About us. Store pages supply a separate
  All products / Pickup / Cart navigation with the persisted cart count.
  The footer retains only Contact us, Privacy and Accessibility. Pickup details
  stay with the collection and cart; neither requires a large homepage section.

### Storefront photography references and format choices

The owner requested realistic generated soap images as references for later
real photography and their use in an image-led storefront. Four individual
images now distinguish the ivory/amber bars and their Wolf formats. The earlier
paired compositions remain photography references, not variant images.
All generated images are **AI styling references**, not actual product photos
or evidence of the finished color, formula, exact mold, packaging or dimensions.
Keep the concise visible caption and descriptive image alt text.

The live responsive WebP assets are `src/assets/soap-{delight,true}-{bar,wolf}.webp`
and their `-small` variants. They are generated originals, not copied brand
photographs. `src/content/soap-references.ts` maps only the two known product
keys; unknown products retain their ordinary illustration fallback. A stored
owner photo always wins. Product-level uploaded photography is not a new
variant-photo upload feature. Upload actual photography through the existing private
photo editor to replace a reference without changing product/SKU/stock records.

For the owner's own shoot, use the actual bar and wolf mold together, a neutral
stone surface, restrained linen, one soft side window and an uncluttered
background. Match the camera position and crop across products, leave room
around the subjects for mobile crops, and avoid ingredient props or packaging
claims that do not belong to the actual product.

The layout follows the information-first principles in
[NN/g's Photos as Web Content](https://www.nngroup.com/articles/photos-as-web-content/)
and the visible-choice guidance in
[Baymard's size-selection research](https://baymard.com/research-articles/use-buttons-for-size-selection).
These support the design direction, not a measured conversion claim for this
site. No other brand's assets or exact layout are reproduced.

One product card presents its real format labels and canonical prices rather
than duplicating the product per variant or repeating its full description.
Format links work without JavaScript and pass a variant key to the product
page. Only a matching, offered format is preselected; unknown, duplicate or
unavailable selections cannot force an invalid choice. The native radio group
exposes prices and unavailable formats directly. Existing cart code submits only
the selected identity and quantity; current catalog verification and the server
remain authoritative for prices, stock and checkout. No new checkout protocol,
database migration or inventory mutation is part of the display redesign.

The product gallery and radio group share the same validated initial variant.
Thumbnail clicks select that format; native radio changes select its image.
Only existing server-rendered image templates are cloned, with no arbitrary
image URLs, stock edits or checkout requests. Images remain viewable from direct
variant links without JavaScript; interactive synchronization requires JavaScript.

### Five new storefront review concepts

The owner approved publishing five separate concepts at
`https://preview.thetruehive.com/prototypes/next/` without replacing the live
design. The old ten-design gallery remains intact and links to this new hub.

| Concept | Layout and ingredient treatment |
|---|---|
| Ingredient Atelier | Tactile split layout with readable HTML ingredient notes layered beside the image |
| Honeyglass | Sun-warmed product stage, alternating collection shelves and an ingredient ribbon |
| Field Notes | Indexed collection rows and a precise ingredient ledger |
| Soft Geometry | Sculptural bento layout with an expandable ingredient card |
| Night Apiary | Dark forest image stage with a high-contrast ingredient drawer |

Each direction includes home/store/product views plus Services/About and a
local demo cart. Four individual variant images, variant links, saved ingredient
names and snapshot prices are shared as data, while layouts and disclosure
treatments differ. Ingredient text is selectable HTML, never embedded in the
generated images. No formula percentages, benefits or claims are inferred.

`prototypes/next/data.mjs` is a deliberate snapshot of already-public product
information, not a live catalog fetch. Local cart identities and quantities use
a review-only, per-concept session-storage key. No preview route creates an
order, payment, stock hold or inventory mutation, and no credentials, private
SKUs, exact stock counts, memberships or customer information are included.

`publishing.json` separately approves the five concept IDs and nine exact image
assets under `storefrontConcepts`. The Pages allowlist adds only the named
review files; WebP files are accepted only from that exact asset list. The
general private-file and regular-file/symlink safeguards are unchanged.
`tests/browser/next-concepts.spec.ts` exercises all five directions against a
loopback server serving the curated built artifact, including ingredient text,
variant images, cart totals, mobile layout, accessibility and no API/mutation
requests. No paid preview service or live-runtime flag is needed.

### Product-page-only studies

The newer product-page-only review is at
`https://preview.thetruehive.com/prototypes/product-pages/`. Its five new
compositions are Quick Pick, Formula Map, Format Studio, Label Room and Gallery
Focus, inside a fixed brand/navigation shell. Only product detail content
changes between directions; there are no new home/store views. The bounded
`productPageConcepts` approval publishes five source files and reuses the already
approved product snapshot and variant assets. The Add to cart control reports
a local demonstration only: no cart storage, requests, orders or payments.
Native site files remain unchanged; both older design galleries are preserved.

### Isolated Stripe sandbox activation checklist

The owner confirmed the existing **The True Hive sandbox** account. Hosted
Checkout remains the selected card-only USD test integration. Account discovery
and an accepted integration plan do not provision runtime credentials, verify
webhook delivery or enable payments.

The checklist below is the default for ongoing testing. The owner separately
approved the temporary current-site exception immediately after it; that
exception is not a general permission to test against ordinary stock.

1. Prepare a separate disposable database or approved Neon branch and a separate
   sandbox application environment. Do not copy the operational `.env`, private
   memberships, customer records or stock ledger into a test checkout. Do not
   repurpose the existing prototype hostname or shared production service
   without the separately recorded current-site authorization.
   A local application behind an approved HTTPS tunnel can avoid adding another
   paid web service; host/provider setup remains an operator action.
2. Apply migrations to that isolated database and provision distinct public-read
   and private-runtime roles using the existing least-privilege runbook. Add
   clearly test-only catalog/location/count fixtures there, never in production.
   Point both runtime connections at that same isolated database.
3. Configure the sandbox HTTPS `SITE_URL`, its `INVENTORY_ORIGIN`, existing
   Firebase/MFA requirements and an authorized sandbox administrator. Set
   `STOREFRONT_LOCATION_KEY` and `CHECKOUT_LOCATION_KEY` to the same test pickup
   location. Keep indexing off. Do not weaken TLS, authentication or role checks
   to make a local rehearsal pass.
4. Privately supply that Stripe sandbox's restricted or standard test API key and
   its endpoint signing secret. Reuse an existing appropriate key where possible;
   never commit or print credentials. Configure `/api/webhooks/stripe` on the
   sandbox storefront origin with the pinned API version and supported events.
   Stripe's [hosted Checkout guide](https://docs.stripe.com/payments/accept-a-payment?payment-ui=checkout&ui=stripe-hosted)
   and [webhook guide](https://docs.stripe.com/webhooks) describe the provider setup.
5. Set `CHECKOUT_MODE=stripe-test` only in the isolated environment. Start through
   the normal preflight wrapper, then explicitly allow new checkouts in the
   sandbox inventory store settings. Deliberately inspect readiness: database
   catalog connected and test checkout enabled. Verify visible TEST MODE/no-real-
   charge labels before selecting test merchandise.
6. Rehearse a multi-line cart, changed prices, last-unit competition, failed
   payment, confirmed expiry, lost responses, duplicate callbacks, pickup and
   reconciliation. Refresh/return URLs are not proof of payment; provider
   verification and persisted order state remain authoritative. Review backup,
   access-recovery and reconciliation ownership before any later sales release.

Rollback presentation code without restoring an old stock database. Retain the
additive ingredients column and saved values. Disabling test checkout stops new
attempts but does not release existing holds; reconcile those separately.

#### Owner-authorized temporary current-site rehearsal

On 2026-11-15 the owner explicitly reclassified the current deployment as a
temporary test store, stating it has no customer audience yet. The public URL
is still accessible: **noindex is not authentication**. Keep the existing
host/member/MFA boundaries and require a visible test-store label on shopping
pages. Do not remove the test/no-real-payment/no-real-pickup distinction while
cleaning up repetitive staging prose.

Use the existing **The True Hive sandbox**, card-only USD Checkout and
`CHECKOUT_MODE=stripe-test`. Live/organization keys and live provider events
remain rejected. Configure only the existing application's test key and signed
`checkout.session.completed` / `checkout.session.expired` webhook; planning/MCP
OAuth alone is not an application runtime credential. Preserve the pinned
Stripe API version and all price, association, retry and settlement checks.

Create a clearly named `stripe-sandbox-pickup` location through the audited
inventory workflow. Synthetic rehearsal units belong only there, with an
explicit test-fixture adjustment reason. Existing product identities, prices,
ingredients, photos and other location balances remain unchanged. Set both
`STOREFRONT_LOCATION_KEY` and `CHECKOUT_LOCATION_KEY` to that test location;
leave `SITE_INDEXABLE=false`. Enable store admission only after the test
runtime, banner, stock and webhook configuration are verified.

This is **location-level test-stock separation on a shared database**, not
database isolation. Test orders and audit entries remain real durable records
of a simulation; do not delete them or describe them as customer sales.
Before sharing the site with customers: pause admission, expire/reconcile
outstanding test sessions, verify every remaining test allocation, restore the
ordinary storefront location, disable the test runtime and retire the test
location without erasing history. Live payments and tax-aware totals still
require separate implementation and approval.

### Store purchase switch and confirmed pickup

The owner approved publishing the pickup address at **7031 New Highway 68,
Madisonville, TN 37354**, with pickup by arrangement rather than invented shop
hours. Maintain a genuine pickup location in inventory, select it with
`STOREFRONT_LOCATION_KEY`, and enter actual opening quantities through audited
adjustments. A new location creates disclosed zero balances, not an assumed
physical count.

Authorized administrators use **Inventory -> Store settings**
(`/inventory/store`) and **Allow new checkouts**, then save. The setting is
persisted with a revision and immutable operator receipt; uncertain retries reuse
the same operation, and conflicting revisions require explicit review.

Closing leaves the catalog, prices and cart visible and editable. Checkout
admission locks the singleton setting inside the reservation transaction: new
orders cannot allocate stock after closing wins the lock. Requests admitted
before closing may finish. Existing matching retries, signed webhooks, settlement,
pickup and reconciliation continue; closing is not a cancellation or stock-release
operation. The public readiness `checkoutEnabled` flag describes admission of
new checkout, not whether existing orders can still be processed.

The purchase setting cannot override disabled runtime checkout or the test-only
provider boundary. **Taxes are not currently calculated:** `automatic_tax` is
disabled and provider/order comparisons require zero tax. Publishing a pickup
address does not establish tax registration, product classification or a tax
rate. The normal runtime remains `CHECKOUT_MODE=disabled` outside the explicit
temporary test-store rehearsal above. Live sales require a separately reviewed
payment/tax implementation and business readiness.

For store-control rollout, first verify a private database backup, apply forward
migrations 004 and 005, and grant the exact runtime-role permissions above.
Confirm the singleton remains closed and run the public/private database
preflights before merging the checked application release. Do not overwrite
real products, prices, opening counts or existing inventory with test fixtures.

### Inventory workbench and internal labels

The private inventory home (`/inventory/products`, also the inventory root's
destination) shows current variant balances at the selected location. **On hand**
is the physical count; **Available** subtracts held, committed and unavailable
units. Missing records are unverified, not fabricated zeros. Search supports the
full existing SKU length and is bounded to 160 characters.

Products are grouped into collapsible category shelves. Primary counts, SKUs and
stock status remain visible; selecting a product name or row opens its focused
stock inspector, with a modal presentation on mobile. Location, category and
stock filters apply before pagination, including an explicit out-of-stock view.
Shared navigation and page-heading controls keep inventory pages consistent.
The heading exposes **New product**, **Add location** and **Manage locations**
even when a catalog read fails. Location creation still uses the existing
audited form and inactive/non-pickup defaults; it does not add customer-selectable
pickup addresses or change the configured storefront location.

This layout applies [NN/g progressive-disclosure guidance](https://www.nngroup.com/articles/progressive-disclosure/)
and [Carbon's expandable-row and toolbar guidance](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines):
keep frequent tasks visible and defer secondary information. Native disclosures
are exercised with Enter and Space, consistent with the
[W3C disclosure interaction pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/).

Select an item, then expand **Receive stock** in the inspector without opening
the product editor. Presets such as **+12** only prepare a receiving amount;
they never submit a mutation. Enter a meaningful reason, review the direction,
amount and balance preview, then **Confirm stock update**. The existing audited
adjustment API, expected revision, frozen operation ID on uncertain retries and explicit conflict
review are unchanged. Verified receipts and separately refreshed balances update
on the same page, including duplicate views of the same stable keys.

The product editor's **Move ingredients from Details** recognizes one explicit
`Ingredients:` heading followed by bulleted entries. It preserves supplied names
and ordering, size/care notes and existing identifiers. It refuses ambiguous or
empty blocks and will not overwrite a nonempty Ingredients field. Review the
draft and save the product; moving or copying text alone does not save. Generated
ingredient text is a plain rendering of the supplied list, not an inferred
formula, INCI conversion, allergen assertion or compliance certification.

**Print internal labels** opens the protected product-label view. Each Code 128
image encodes the exact stored SKU, not a price, ingredient list, physical unit
serial number or retail GTIN. Identical units of a variant use the same internal
code; quantities still change through the inventory workflow. The existing SKU
search can be used with a keyboard-style scanner.

New variant rows offer explicit blank-only identifier suggestions. Manual and
saved values are never overwritten; the server remains the global uniqueness
authority. Existing SKU whitespace and case are preserved because changing them
would change the barcode identity. Internal barcodes accept 1-128 printable ASCII
characters; unsupported stored identities are explained, not silently changed.

Barcode rendering uses pinned server-only `bwip-js` 4.11.4 (MIT). Tests independently
decode the actual SVG using `sharp` and development-only `@zxing/library` 0.23.0.
No barcode provider, retail registration, external image service or new schema
is involved. Barcode images and label pages remain behind the normal inventory
host/member/MFA boundary and are not public product assets.

Printing occurs only after an explicit browser action. Review paper size and
scaling, retain white quiet zones, disable browser headers/footers and test the
physical print with your scanner. Long SKUs may need wider paper. Neither image
generation nor an automated decoding test certifies your printer, scanner or
retail packaging. Retail GTIN fields and UPC/EAN issuance remain outside this
internal-only scope.

### Migration 005 pre-release repair - 2026-11-15

Release review found that 005's initial audit constraint omitted the photo
actions introduced by 003. The owner explicitly approved correcting the
unreleased SQL and only its matching production checksum, rather than deleting
or rewriting business records. A fresh private backup and archive listing were
verified first. The constraint and checksum were repaired atomically under the
normal migration lock, with exact old-checksum and action-list guards.

- Previous SHA-256: `ab7eb8f64f65f45947c14f88059ae17207776994d4857ee206d1ce3aadf2dcc9`.
- Corrected SHA-256: `1b28027ef43c463cc322cda9ac2ed1de970739c9eb8fba5565e9a40800756755`.

Both `attach_product_photo` and `remove_product_photo` are retained alongside
the store action. Existing business/audit rows were verified unchanged, a private
repair receipt was saved, and the normal migration runner then reported no
pending changes or checksum drift. This specific approved repair is not
permission to rewrite other applied migrations; normal checksum protection
remains unchanged.

### Apex/www hosting and rollback

The owner approved this website routing on 2026-11-14. Porkbun remains the
authoritative DNS provider; no nameserver, email or inventory-host change was
made.

| Type | Host | Target | TTL |
|---|---|---|---|
| ALIAS | Apex / empty host | `the-true-hive-app.onrender.com` | 600 seconds |
| CNAME | `www` | `the-true-hive-app.onrender.com` | 600 seconds |

Render's custom-domain setup registers the apex and redirects its paired `www`
hostname to it. Both HTTPS endpoints were checked with certificate validation
enabled. HTTP upgrades to HTTPS; the `www` redirect preserves the requested path
and query. `SITE_URL` was already `https://thetruehive.com` and was verified from
the served canonical metadata, so no private runtime-setting rewrite was needed.
`SITE_INDEXABLE=false` remains intentional. The separately approved catalog-source
change above does not approve search indexing or sales.

The complete eight-record pre-cutover DNS view and nine-record post-cutover
view were saved privately. Only the existing apex ALIAS answer was edited and
one explicit `www` CNAME added; all seven other original records matched after
the change, including MX/SPF, preview, wildcard and certificate challenges.
The separate Pages preview was also checked over HTTPS.

For a website-routing rollback, use the private before/after record snapshots:
restore only the apex ALIAS's previous `uixie.porkbun.com` answer and remove only
the newly added `www` CNAME if the old parking/forwarding behavior is intended.
Do not bulk-restore an old zone over subsequent mail, preview or inventory work.
Keep the Render endpoint available for diagnosis, and allow DNS-cache expiry.
An application rollback is a separate reviewed Git revert/redeployment, never
a database restore.

Follow Render's current [custom-domain](https://render.com/docs/custom-domains)
and [DNS-provider](https://render.com/docs/configure-other-dns) instructions
for future changes. Review workspace domain quota/pricing before adding the
separately gated inventory hostname; an extra hostname can be separately billed.

### Database activation and existing infrastructure

Before switching to database mode:

1. Confirm the target Neon organization is Free before project creation; never silently upgrade another organization.
2. Run migrations with the direct schema-owner connection and verify empty tables. Do not seed prototype products or physical stock.
3. Create a separate SQL runtime login without elevated role membership. Grant only database connection, schema usage and required catalog/availability/readiness reads; deny stock writes, audit reads and table creation. Revoke public creation/temporary-table privileges in this dedicated database. Prove denials in rolled-back transactions, not just through a read-only session setting.
4. Supply the pooled runtime connection privately on Render, not the migration owner connection. Set `CATALOG_SOURCE=database` only when real approved catalog data is ready, then confirm startup/readiness and outage behavior.
5. Resolve quota monitoring, backups and a restore rehearsal before real inventory/orders. Real content/contact/pickup and sales approval remain separate from the already-approved apex/www showcase hosting.

### Private inventory preparation - 2026-11-14

The separately authorized private workspace is live at
**https://inventory.thetruehive.com/**. The existing service uses
`INVENTORY_ENABLED=true` and exact `INVENTORY_ORIGIN=https://inventory.thetruehive.com`.
That inventory-only rollout retained `CATALOG_SOURCE=showcase`. The subsequent
public-catalog activation above changes it to `database`, while
`CHECKOUT_MODE=disabled` and `SITE_INDEXABLE=false` remain unchanged.

Only the `inventory` CNAME was added, targeting the existing Render hostname
with TTL 600. Private before/after snapshots verified all nine prior DNS records
were unchanged. The live workspace billing view showed **2 of 2 included custom
domains used** after registration; no extra domain charge, new service or plan
upgrade was needed.

Read-only checks confirmed the current private database privileges, matching
public/private database targets, enabled Firebase TOTP, existing authorized
Google administrator membership/enrollment and Firebase authorized hostname.
A fresh Git-excluded mode-600 pre-activation database archive was created and
fully listed successfully; this is not a new full restore rehearsal.

PR #8 repaired the shared-host liveness path. Render verified its exact merged
revision `b262efa5d9446e91f06b08fdfba837c7ca2b2c34` Live. Real HTTPS checks
confirmed the initialized login client, secure host-only CSRF cookie,
noindex/no-store headers, anonymous/forged-session denial, sibling/default-host
isolation and rejected cross-origin session creation. Public showcase mode and
disabled checkout were checked independently.

The owner still signs in normally with the previously enrolled Google account
and authenticator. A new-host authenticated workspace/sign-out/access-removal
rehearsal was not performed by automation. Do not equate these setup checks with
completed operating-stock, payment, pickup or recovery rehearsals.

For an inventory incident, disable only `INVENTORY_ENABLED` on the existing
service and deploy a checked revision. Leave public site routing and existing
credentials intact. Liveness remains available even when private administration
is disabled; do not roll back business data to undo a website/configuration change.

### Product-entry guidance and image storage

The product editor starts with the product name. New-product keys and URL slugs
are suggested from that name until the operator edits each identifier. Existing
keys/variants/SKUs remain permanent and existing slugs are not silently renamed.
Native `(i)` disclosures explain each field with examples, including variant
formats and USD cents; help supports keyboard entry, Escape and outside dismissal.
Empty product and variant fields include example placeholders, never prefilled
merchandise values. Adding another variant preserves those hints.
An explicitly rejected duplicate product key/slug/SKU preserves the draft and
allows correction. Revision conflicts and uncertain outcomes retain their
existing review/frozen-intent safeguards.

Creation and editing include a live, read-only collection-card preview using the
storefront card component. It follows unsaved text, category, illustration,
record type and URL values; saved photos use the private admin image endpoint.
Concept records retain illustration-only previews. Previewing never saves,
publishes, changes stock or enables checkout. The preview is collapsible, sits
beside desktop fields and is reachable by a jump link on narrow screens.

The owner subsequently approved metered photos and reuse of the existing
website storage **project**, with a new private True Hive bucket and dedicated
bucket-scoped account. Firebase Auth stays in its separate project/current plan.
The personal site's bucket/key and travel GPS/color-processing behavior are not
copied. See `19-product-photos.md` alongside this file for the product-photo
architecture/runbook: limits, server-only settings, migration 003, draft privacy,
retries and operator checks. This new operator document is source-owned, not
silently added to the existing curated preview's document registry. Original
illustration choices remain the fallback.

**TLS/authentication choice:** remote connections require certificate verification. The owner approved the current Node driver's **opportunistic channel binding** (`enableChannelBinding: true`), as documented by [node-postgres](https://node-postgres.com/features/ssl). Configure the Node-specific URL with `sslmode=verify-full&channel_binding=prefer`; the adapter removes those supported hints before passing its verified TLS options to the driver. A generic Neon URL containing `channel_binding=require` is deliberately rejected: this driver does not strictly enforce that requirement. Do not silently drop it, claim strict binding, set `rejectUnauthorized: false` or disable remote TLS.

**Free-tier limits:** Neon's [current pricing](https://neon.com/pricing) lists 100 CU-hours and 1 GB storage per project, suspension after five inactive minutes, and a six-hour history window with a size limit. These are quotas, not business recovery guarantees; scheduled snapshots and longer history differ on paid plans. Avoid unnecessary polling and reassess before live orders. Render's [native Node deployment](https://render.com/docs/deploy-node-express-app), [CI-gated deploys](https://render.com/docs/deploys) and Neon's [connection pooling](https://neon.com/docs/connect/connection-pooling) provide infrastructure capabilities, not inventory correctness.

**Agent helpers:** installing CLI credentials does not approve skills/plugins/MCP. Review the complete pinned candidate tree, obtain staging approval, verify staged hashes, then obtain installation approval. Avoid the global plugin/init route; keep any approved MCP project-scoped, private, least-privilege and read-only initially. A remote MCP service cannot be immutably pinned like local skill files.

Project MCP/skills load when Copilot CLI runs inside the trusted repository, not from its parent directory. Connect the configured remote server through the CLI's MCP controls; copying configuration is not proof of an authenticated connection. Any instruction inside the core skill to fetch/install another skill remains subject to a separate full review and approval.

## Release and recovery

Run the smallest relevant tests during development, and all required gates for a release. Inspect the actual built artifact; a green unit test is not a deployed health check.

After a deploy, check real HTTPS, routes, assets and one deliberate readiness/database-mode probe. Restore a known-good **application** commit/artifact if necessary; never overwrite current inventory with an old website build. Back up real data before migrations and rehearse restoring into a separate recovery instance.

Outstanding activation decisions are in the [partner workbook](10-partner-workbook.md): real content/contacts, pickup, quota/recovery ownership, private identity/MFA provisioning, provider configuration and live-sales policies. The next phase's identity/test-payment and stock-accounting choices are recorded below.

## Inventory phase: private setup and activation

The [approved next-phase specification](15-inventory-admin-and-commerce.md) selects isolated Firebase, app-enforced TOTP MFA, PostgreSQL admin membership and Stripe card-only test checkout. These are implementation choices, **not proof that the provider project, MFA, privileged roles, hostname or sandbox are configured**.

Inventory-only catalog preparation is now enabled under the separate owner approval above. Keep `CHECKOUT_MODE=disabled` and the storefront's deliberate source/indexing settings until their release gates pass. Preserve approved apex/www routing and existing mail/preview DNS. The inventory hostname shares the existing Render service; no second paid service is required or approved.

### Private runtime and operator configuration

| Setting | Boundary |
|---|---|
| `INVENTORY_ORIGIN` | Exact inventory origin; HTTPS in production, explicit HTTP loopback only in development |
| `ADMIN_DATABASE_URL` | Pooled private inventory/session/order role; never schema-owner or public-read credentials |
| `ADMIN_CSRF_SECRET` | Canonical base64 of at least 32 random bytes for signed/session-bound CSRF; no public variable or default |
| `FIREBASE_PROJECT_ID` | Isolated True Hive project, not copied personal-site configuration |
| `FIREBASE_WEB_API_KEY` | Firebase browser configuration; not an admin authorization credential |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Private server credential matching the isolated project; no browser bundle/ADC fallback |
| `INVENTORY_ADMIN_UID` | Operator-only private identity used during provisioning; never commit or print it |
| `MIGRATION_DATABASE_URL` | Direct schema-owner connection for migration/provisioning, never a runtime fallback |
| `CHECKOUT_MODE` | `disabled` or `stripe-test`; no live-charge mode |
| `CHECKOUT_LOCATION_KEY` | Explicit real active pickup location, not a fictional fixture/default |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Private test API/signature credentials; restricted `rk_test_` or standard `sk_test_` API keys only, never live/organization keys or objects |

Firebase's [TOTP guide](https://firebase.google.com/docs/auth/web/totp-mfa) requires Identity Platform. **Do not enable a billed upgrade automatically.** The owner requires app-enforced MFA before deployment; upstream Google-account 2FA or a browser checkbox does not satisfy it. Configure Google sign-in/authorized inventory domain, verified-email/TOTP enrollment and recovery only after the provider/billing decision. Privately provision the intended admin; ordinary sign-in does not grant membership.

Admin sessions last eight hours, with revocation checked on every private request. Signed CSRF tokens last one hour; GET/HEAD page loads, including the exact `/inventory` root, supply the shell without invalidating another tab's still-valid token. After long idle periods, reload and review current revisions before submitting. Source preflight and the bundled server share the same project-checked Firebase app in the native process.

### Least-privilege role matrix

Provision roles deliberately with the direct owner connection after the forward migration. The inventory runtime role must not own the schema/tables or have superuser, database-creation, role-creation or inherited elevated privileges.

| Records/operation | Public read role | Private inventory role | Direct owner/operator |
|---|---|---|---|
| Catalog/variant/location/count reads | Existing public query access | Read | Manage |
| Product/variant/location/count writes | Denied | Required insert/update only | Manage |
| Movement/admin-operation/payment-event history | Denied | Read/insert; no update/delete/truncate | Append-only guards still apply |
| Orders/order snapshots | Denied | Required read/insert/order update; no snapshot rewriting | Recovery/reconciliation |
| Store purchase setting | Read only | Read/update existing singleton; no insert/delete/truncate/delegation | Forward migration and explicit role grants |
| Admin membership | Denied | Read only; no grant/revoke | Private grant/revoke |
| Local admin sessions | Denied | Read/insert/revoke | Recovery |
| Schema creation, role management, migrations | Denied | Denied | Deliberate operator action |

Revoke public schema creation and temporary-table privileges in the dedicated database. Verify actual denials in transactions/with the target role: product writes from public credentials, membership writes/schema creation from runtime credentials, and history/snapshot edits. Forbidden INSERT/UPDATE checks also detect column-only grants; table-level ACL checks alone are insufficient. Enabled-admin startup must reject elevated or incomplete runtime credentials; configuration names alone do not establish privilege.

The operator access command requires `MIGRATION_DATABASE_URL` and private `INVENTORY_ADMIN_UID`, rejects pooled/invalid owner connections, and never falls back to `DATABASE_URL`/`ADMIN_DATABASE_URL`. Session creation and membership grant/revoke share a per-UID transaction lock; creation rechecks active membership after acquiring it. Revocation invalidates local sessions, including a concurrent creation that committed first, and later re-granting never resurrects them. Do not put private identifiers in command arguments, source, logs or public workbook answers.

After privately configuring the direct owner connection and intended identity:

```sh
npm run admin:access -- --help
npm run admin:access -- grant
npm run admin:access -- revoke
```

Run grant/revoke only as deliberate operator actions against the intended database. The command prints no identity or connection values; a help call performs no database/provider work. Real PostgreSQL cases cover grant, session revocation, rollback and runtime-role denial.

### Stock and sandbox rehearsals

Add actual records only through the authorized admin after opening-count/recovery approval. New administrative levels start at a disclosed zero balance; counted/received units use the audited increase workflow. Product publication is separate from test-checkout enablement.

Public-read and inventory-write connections must target the same database/Neon branch, using separate least-privilege credentials. Validate that association before enabling database catalog/checkout. Use an isolated staging/test database or branch for Stripe test purchases; a simulated payment must not commit operational physical stock.

Use `on_hand - held - committed - unavailable` for sellability. The safe rehearsal is: create real draft -> validate/publish -> establish a location/count -> reserve for hosted test checkout -> verify paid commitment -> Record pickup -> inspect physical/committed counts and audit. Repeat last-unit competition, stale-edit conflict, lost-response retry, invalid signature, duplicate/out-of-order event, missing expiry event and pickup rollback.

Reconciliation must re-fetch provider state. Expire overdue open sessions and confirm expired/unpaid state before releasing; payment-complete races settle via the same order transition. Unknown creation/session outcomes stay quarantined, not auto-released by a clock. Financial refunds never infer restock. A manual reconciliation CLI is not proof of a scheduled job: approve ownership/scheduling without silently adding a billed service.

Run `npm run checkout:reconcile` with privately configured test credentials; `RECONCILE_CHECKOUT_LIMIT` defaults to 25 and is bounded to 100. It reports counts, not private order IDs. Retry an uncertain create using the same intent/key; never replace it with a new order. A rate-limited browser retry retains the frozen serialized intent, because rejection before provider work cannot disprove an earlier hold. Verified signed events can recover an existing session association after a lost response, without creating a fresh payment or extending its expiry.

Each bounded batch locks the least-recently-updated pending orders, skips orders claimed by another batch, and advances their update timestamps before provider work. Open or repeatedly uncertain sessions therefore rotate behind other pending work instead of permanently blocking later reconciliation. This scheduling touch changes neither order revisions/snapshots nor physical stock, commitments, holds or requested expiry.

Configure the test webhook on the **storefront/staging origin** at `/api/webhooks/stripe`, not the admin-only inventory host. The pinned SDK/event version is `2026-10-28.endive`, with the `allowed_payment_method_types` card filter. Match that endpoint version and rehearse signatures/expiry/paid/pickup before activation. Unsupported test totals are rejected before holds. Test details belong only in the isolated sandbox.

Native startup validates checkout configuration, private role/schema access and Firebase TOTP readiness before listening. Astro trusts forwarded hosts only for the exact configured storefront/inventory origins; the middleware still verifies effective host/session/CSRF independently. The adapter accepts an 8 MiB photo plus 64 KiB of multipart overhead, while JSON and webhook readers retain their smaller stream limits.

CI's disposable integration role has `CREATEROLE` solely to create/drop isolated permission-test roles. Production runtime roles must never inherit that privilege. The Playwright lane runs the isolated admin DOM cases with zero skips after Chromium is installed; Node-only contract checks do not substitute for that browser gate.

### Inventory hostname gate

Only after MFA/access-removal, least-privilege, sandbox and backup/restore rehearsals pass should the operator add **`inventory.thetruehive.com`** to the existing Render service and create its specific DNS record using Render's verified instructions. Verify TLS and direct anonymous/non-admin/API denial. Do not repoint root/www, change email, add wildcard DNS or advertise an admin link in the public storefront.

Apply noindex/nofollow and no-store to inventory responses and exclude private routes from public navigation/sitemaps. Allow search crawlers to observe noindex on the non-sensitive login/error shell; robots.txt alone can leave bare URLs indexed. None of these signals replaces authentication or guarantees the hostname is invisible.
