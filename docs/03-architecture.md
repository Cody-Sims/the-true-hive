# Architecture: simple now, deliberate expansion later

Decision status: **Astro + TypeScript, native Node and custom PostgreSQL approved on 2026-10-29**. Apiary Market is selected. The ten-concept review studio remains separate. No Docker or Shopify.

## Recommendation

Use one modular **Astro + strict TypeScript application with the Node adapter and PostgreSQL**. The frontend is HTML-first; catalog/readiness APIs and inventory transaction modules run on the server. The owner explicitly chose a custom storefront and inventory. Do not build ten production sites or introduce separate services prematurely.

The clarified target is a **product-led website with an integrated future store**, pickup first, shipping later. An initial marketing release and eventual commerce release are separate deployment gates. Extensibility means stable content/URLs and explicit provider boundaries, not speculative services or untested stock arithmetic.

**Render hosts the native Node app; Neon provides managed PostgreSQL**, both in Oregon. The selected starting tiers are the $7/month Render app in a Hobby workspace and Neon Free. We own the stock/order rules. Keep `preview.thetruehive.com` for the original review; the actual site targets `thetruehive.com` after hosting/content readiness. Payment processing, recovery requirements and authenticated owner administration remain later gates. See the [approved foundation](13-production-foundation.md) and [actual operations guide](14-development-and-operations.md).

## Framework comparison and superseded alternatives

| Option | Current fit | Expansion path | Principal tradeoff |
|---|---|---|---|
| **Astro + TypeScript + Node** | Selected HTML-first site and server foundation | Our PostgreSQL catalog/inventory and future payment integration | Own the backend correctness and operational responsibility |
| **Next.js App Router + TypeScript** | Valid, particularly for a React-experienced maintainer | Server-rendered custom workflows and headless commerce | More server/client, rendering and caching concepts for a brochure site |
| **Shopify** | Rejected by the owner | Historical alternative only | Not the selected storefront or inventory authority |
| **Custom admin now** | Deferred | Add only after authentication/roles are specified | A private count function is not an authenticated admin |

**Evidence:** Astro components "render to static HTML with no client-side runtime" ([official docs](https://docs.astro.build/en/concepts/islands/)). Next.js layouts/pages are Server Components by default ([official docs](https://nextjs.org/docs/app/getting-started/server-and-client-components)); its [static-export documentation](https://nextjs.org/docs/app/guides/static-exports) describes limitations on runtime server features. Shopify explicitly states, "A headless storefront costs more to build and run than a theme" ([official guidance](https://shopify.dev/docs/storefronts/headless/overview)).

These establish capabilities and tradeoffs, not a benchmark proving one framework is always fastest or cheapest.

### Version policy

The foundation pins **Astro 7.4.4, Node adapter 11.1.9, TypeScript 6.0.3 and pg 8.23.1**, verified against package metadata. TypeScript 7 was not selected because the diagnostics package declares support for 5/6. Node 24 runs the application/native tests; CI uses supported native PostgreSQL 16. Recheck supported patches regularly, preserve the lockfile and do not use unbounded dependency versions.

The prototype has its own existing package/lockfile: **markdown-it 15.0.3**, verified against the package registry and installed package, renders the planning UI locally. Its bundled browser build is served from this project, not a CDN. Native Node tests cover the prototype's pure behavior. This does not constitute selecting a production framework.

Do not treat a release number in a research snapshot as an instruction to install it months later.

## Production structure

The following earlier section-component tree is a **proposed organization**, not a claim every component already exists. The actual foundation uses `src/layouts/SiteLayout.astro`, reusable product/contact/service components, `src/pages/api`, `src/server`, and SQL migrations. Production builds to **`dist-site/`**; the preserved Pages review builds to **`dist/`**.

```text
src/
  pages/
    index.astro
    privacy.astro
    accessibility.astro
  layouts/
    SiteLayout.astro
  components/
    SiteHeader.astro
    HomeHero.astro
    ServiceOverview.astro
    ProductShowcase.astro
    LocalStory.astro
    SocialLinks.astro
    ContactSection.astro
    SiteFooter.astro
  content/
    business.ts
    services.ts
    showcase.ts
  catalog/
    types.ts
    to-product-card.ts
  assets/
  styles/
    tokens.css
    global.css
tests/
  e2e/
```

Use ordinary typed files initially. Add Astro content collections or a CMS only when validation/querying or frequent nontechnical editing warrants it. Astro itself notes that collections may not be the best fit for a very small amount of content ([content guidance](https://docs.astro.build/en/guides/content-collections/)).

### Dependency direction

```text
business/services/showcase content --> page composition --> small UI components
local catalog OR future provider --> explicit mapping --> public card/detail models
future privileged integration --> server-only code --> minimal safe public output
```

Components receive business-facing product/variant DTOs. Internal SQL rows, stock counts, SKUs and audit details do not pass into public components. Stable application keys remain independent of mutable slugs/SKUs and any future payment-provider identifiers.

`to-product-card.ts` should only exist when it performs a real mapping; do not add a one-line abstraction merely to complete the diagram.

### Add only when the related phase is approved

```text
src/server/commerce/       # private client, mapping, optional cart logic
src/server/leads/          # only for an approved site-owned inquiry endpoint
src/pages/api/             # only on a server-capable deployment
tests/unit/               # when pure business mapping/validation exists
```

A static deployment cannot receive form/webhook POST requests. Choose a hosted form provider or explicitly add a supported runtime adapter and endpoint. Astro documents that on-demand rendering requires an adapter ([rendering guide](https://docs.astro.build/en/guides/on-demand-rendering/)).

If Next.js is chosen instead, preserve the same boundaries under `src/app`, `src/components`, and `src/server`; use server-only modules for privileged integrations and small client leaves for actual interaction. Server Actions are public entry points requiring validation and authorization, not a secret-storage mechanism ([security guidance](https://nextjs.org/docs/app/guides/data-security)).

## Readability and engineering rules

| Concern | Rule |
|---|---|
| Composition | One named component per meaningful section; split complex behavior, not every wrapper |
| Content | Approved business facts in one place; no repeated phone numbers or social URLs scattered across templates |
| Styling | Named semantic tokens, explicit component styles, responsive layouts; no utility framework required by default |
| Types | Strict mode, narrow unions for public states, no `any` escapes to make integrations compile |
| Errors | Explicit actionable states; no broad catch returning fabricated products, zero inventory, or fake success |
| Dependencies | Add only for demonstrated requirements; avoid a component library for a handful of static sections |
| Tests | Test public journeys and real mapping/validation; do not mirror production logic inside assertions |
| Ownership | One source of truth per field, named owner for every integration |
| Documentation | Update contracts and phase decisions when behavior changes; do not maintain speculative diagrams as reality |

Do not introduce a global state store, generic provider plugin architecture, separate API service, event bus, Kubernetes, or a shared-package monorepo for this scope.

## Commerce and admin expansion

**Authority:** our PostgreSQL database owns the real product/variant/location records and physical stock. Count adjustments use one checked-out client, row locks, idempotent operation IDs and atomic append-only history. Render manages application hosting and Neon manages PostgreSQL infrastructure; neither owns our merchandising or stock rules.

The approved first build has read-only APIs and an internal correction function, **no public stock-write endpoint or admin login**. Owner authentication/authorization, orders, payment reservations, lot/batch requirements and returns need their own approved slices.

Choose among:

| Path | When appropriate | Consequence |
|---|---|---|
| Our native Node site + PostgreSQL | Selected | One application, owned inventory, read APIs now; authenticated admin/payment later |
| Payment processor | Not selected yet | Use an appropriate hosted/tokenized payment flow without collecting card data in our app |
| Temporary external shop link | Explicitly approved transition or outage fallback only | Not the intended completed experience; disclose the transition and preserve useful redirects/navigation |

No payment integration is enabled. When selected, the processor handles sensitive payment details; our server owns stock/order state and must verify callbacks and handle retries transactionally. A cart is not a stock reservation.

Custom inventory is now an accepted requirement, not an exception to revisit. Secure owner administration remains deferred until roles/authentication are agreed. The SQL foundation does not claim to solve manufacturing, recipes, lot traceability or recall operations.

Local pickup is a real fulfillment workflow, not a static availability badge. Choose an approved pickup location and readiness process; stock from different locations must not be added into an invented pickup promise. Current honey forecasts/wholesale commitments are not retail physical inventory. See [inventory and operations](07-inventory-and-operations.md).

## Review-studio structure and boundaries

The current review artifacts use small native browser modules:

| Module | Responsibility |
|---|---|
| `designs.mjs` / gallery modules | Ten direction identities, discovery/filtering and links |
| `catalog.mjs` | Explicitly fictional products, prices, locations and inventory scenarios |
| `commerce-model.mjs` | Pure quantity, stock-scope, saved-cart and subtotal invariants |
| `commerce-views.mjs` | Coordinated collection/product/cart/checkout/inventory presentation |
| `commerce.mjs` | Browser events, validated URL context and sample cart persistence |
| `documents.mjs` | Whitelist of published planning documents; arbitrary paths are not fetched |
| `plan-renderer.mjs` / `plan.mjs` | Safe Markdown rendering, actual-source loading, navigation and workbook copy |

Original homepages remain independent compositions with shared base styling. The shop shares real behavior across designs rather than duplicating ten subtly different cart engines.

Prototype browser storage contains only versioned sample variant IDs/quantities. It is not authoritative inventory and stores no customer/payment details. The inventory lab is read-only fictional data, not a secured admin.

The hub renders existing Markdown with raw HTML disabled and does not auto-load external Markdown images. Unknown document IDs, failed fetches and invalid saved carts surface explicit errors. Plans remain one source of truth.

## Deployment, security, and operations

Initial hosting decision: choose a maintained static host after checking current price, preview controls, custom domain/TLS, rollback, access logs, and support. Do not pick a provider because the architecture assumes its proprietary features.

Maintain preview and production environments, but only one production business application. The owner has explicitly approved the current planning/design snapshot for a **public static review**; see [sharing and CI/CD](12-sharing-and-deployment.md). Private future review content needs real access control. **Noindex is not authentication.** Publish only the curated review artifact, not the repository root; the eventual customer-facing production build excludes review plans and demo fixtures.

Agree the canonical route map before commerce. Native collection/product routes are the baseline to compare; do not promise arbitrary paths a platform cannot implement. Add a useful 404, sitemap, compatible security headers and a content update/rollback runbook.

No public environment variable or static artifact may contain Admin API credentials, private Storefront credentials, email-provider secrets or webhook secrets. Public Storefront tokens are a separate intentionally public credential type; keep access scopes minimal and private tokens private.

Use MFA and least privilege for domain, hosting, social and future commerce accounts. Domain/commerce account ownership belongs to the business, not an individual contractor.

## Planned quality commands

**Current commands:** `npm run dev`, `npm run check`, `npm run format:check`, `npm run build:site`, `npm run start`, `npm run test:site`, `npm run test:db`, `npm run test:e2e`, and `npm run check:site-artifact`. Review commands remain `npm run preview`, `npm run test:prototypes`, `npm run build:pages` and the link/export checks. `npm test` combines prototype and application unit cases; the DB/browser gates remain separately required.

The following older phase contracts describe intent; the operations guide lists the implemented exact commands. Never substitute prototype tests for real PostgreSQL/browser validation.

| Command | Introduced | Purpose |
|---|---|---|
| `npm ci` | Phase 1 | Reproduce dependencies from the committed lockfile |
| `npm run check` | Phase 1 | Astro/TypeScript diagnostics and agreed static checks |
| `npm run build` | Phase 1 | Produce the actual deployable site |
| `npm run test:e2e -- tests/e2e/<name>.spec.ts` | Phase 1-2 | Targeted browser journeys using the selected existing runner |
| `npm run test:unit -- <file>` | First real mapping/validation in phase 3-4 | Focused pure-function/contract behavior |

Choose and introduce only the tools actually needed at that phase. A small Playwright suite can cover landing navigation, mobile reflow and axe integration; manual keyboard, screen-reader, zoom and real-device reviews still matter. Run the smallest relevant selector during development and the complete agreed release gate when promoting a release.

## Migration and rollback principles

Preserve application keys, meaningful slugs, approved content and owned media. Do not pretend prototype HTML can become production unchanged; reimplement the selected design in production components.

Before commerce: preview, promote, and restore an earlier static deployment if needed. After commerce: storefront rollback must preserve orders and authoritative stock; use backward-compatible integration changes and reconcile provider state. Never "roll back" inventory by restoring an old web build.
