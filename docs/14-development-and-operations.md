# Development, deployment, and inventory operations

Status: **first application foundation**, not an approved live store. No Shopify, Docker, payment, email setup or public admin endpoint.

## Two independent sites

| Surface | Source | Build | Hosting |
|---|---|---|---|
| Ten-design review and planning hub | `prototypes/` and registered documents | `dist/` | Existing GitHub Pages / `preview.thetruehive.com` |
| Apiary Market application | `src/` and `migrations/` | `dist-site/` | Native Node on Render with Neon PostgreSQL; eventual `thetruehive.com` |

Production imports only original illustration assets from the prototype collection, not its HTML, scripts, demo prices or browser cart. Application public output excludes plans, database code and review files.

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
| `CATALOG_SOURCE` | Explicit `showcase` or `database`; no automatic fallback |
| `DATABASE_URL` | Private pooled connection using a least-privilege read-only role for the current public APIs |
| `MIGRATION_DATABASE_URL` | Private direct schema-owner connection for the migration CLI, not a frontend setting; a blank value falls back to `DATABASE_URL` |
| `DATABASE_TLS` | `verify-full` by default; `disable` is restricted to local development targets |
| `CONTACT_PHONE` | Actual approved public number; empty produces no fake call link |
| `FACEBOOK_URL`, `INSTAGRAM_URL` | Approved HTTPS platform profiles; empty remains an honest placeholder |
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

Only apply the Blueprint after this application's PR is merged and main checks pass. The draft uses showcase mode, noindex and no checkout. Use PostgreSQL 16 to match the native integration baseline; a small fixed Neon compute fits this empty-schema pilot.

**Hosting status - 2026-10-31:** the application foundation is live at **https://the-true-hive-app.onrender.com/** in deliberate showcase mode. The service is connected to `Cody-Sims/the-true-hive` on `main`, with **After CI Checks Pass** enabled and no reported auto-deploy blocker. Confirm each release's live revision and deploy trigger in Render; configuration alone is not evidence that an automatic deployment completed. Showcase readiness intentionally reports `inventoryConnected: false` and `checkoutEnabled: false`; it does not prove database connectivity or approve live sales. The main-domain DNS and email remain unchanged.

Before switching to database mode:

1. Confirm the target Neon organization is Free before project creation; never silently upgrade another organization.
2. Run migrations with the direct schema-owner connection and verify empty tables. Do not seed prototype products or physical stock.
3. Create a separate SQL runtime login without elevated role membership. Grant only database connection, schema usage and required catalog/availability/readiness reads; deny stock writes, audit reads and table creation. Revoke public creation/temporary-table privileges in this dedicated database. Prove denials in rolled-back transactions, not just through a read-only session setting.
4. Supply the pooled runtime connection privately on Render, not the migration owner connection. Set `CATALOG_SOURCE=database` only when real approved catalog data is ready, then confirm startup/readiness and outage behavior.
5. Resolve quota monitoring, backups and a restore rehearsal before real inventory/orders. Approve real content/contact/pickup before adding `thetruehive.com`/`www` to the host and changing DNS.

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

Keep `INVENTORY_ENABLED=false`, `CHECKOUT_MODE=disabled`, the storefront's deliberate source/indexing settings and all root/www/mail DNS unchanged until the relevant activation gate passes. The inventory hostname shares the existing Render service; no second paid service is required or approved.

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
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Private test-mode API/signature credentials; live keys/objects rejected |

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

Native startup validates checkout configuration, private role/schema access and Firebase TOTP readiness before listening. Astro trusts forwarded hosts only for the exact configured storefront/inventory origins; the middleware still verifies effective host/session/CSRF independently. The adapter accepts the largest bounded webhook body, while admin/checkout readers retain their smaller stream limits.

CI's disposable integration role has `CREATEROLE` solely to create/drop isolated permission-test roles. Production runtime roles must never inherit that privilege. The Playwright lane runs the isolated admin DOM cases with zero skips after Chromium is installed; Node-only contract checks do not substitute for that browser gate.

### Inventory hostname gate

Only after MFA/access-removal, least-privilege, sandbox and backup/restore rehearsals pass should the operator add **`inventory.thetruehive.com`** to the existing Render service and create its specific DNS record using Render's verified instructions. Verify TLS and direct anonymous/non-admin/API denial. Do not repoint root/www, change email, add wildcard DNS or advertise an admin link in the public storefront.

Apply noindex/nofollow and no-store to inventory responses and exclude private routes from public navigation/sitemaps. Allow search crawlers to observe noindex on the non-sensitive login/error shell; robots.txt alone can leave bare URLs indexed. None of these signals replaces authentication or guarantees the hostname is invisible.
