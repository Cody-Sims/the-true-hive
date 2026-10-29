# Architecture: simple now, deliberate expansion later

Decision status: **recommended, subject to owner/maintainer approval in phase 0**. No production framework has been installed. The ten-concept review studio is separate from the future public build.

## Recommendation

For a pre-commerce marketing release, **Astro + strict TypeScript**, prerendered pages, ordinary design-token CSS and small typed content files remain a good fit. Use a single production application and repository; do not make ten production sites.

The clarified target is a **product-led website with an integrated future store**, pickup first, shipping later. An initial marketing release and eventual commerce release are separate deployment gates. Extensibility means stable content/URLs and explicit provider boundaries, not speculative databases or a homemade stock engine.

At the commerce gate, first evaluate a **native Shopify website/theme with services/story pages and managed administration on the primary domain**. If the selected custom experience requires headless, a server-capable Astro or Next.js frontend can own the coherent site and use Shopify for commerce/hosted checkout. A separate unrelated outbound shop is **not the target**. A prior static Astro release may require migration or integration; that cost must be accepted rather than hidden.

## Framework decision

| Option | Current fit | Expansion path | Principal tradeoff |
|---|---|---|---|
| **Astro + TypeScript** | Strong for an initial static product/story/services site | Supported runtime adapter and focused headless routes, or an explicit migration to a native store/site | Headless and migration are real work; static hosting cannot run commerce endpoints |
| **Next.js App Router + TypeScript** | Valid, particularly for a React-experienced maintainer | Server-rendered custom workflows and headless commerce | More server/client, rendering and caching concepts for a brochure site |
| **Shopify native theme** | Strong candidate if real local commerce is the next funded milestone | One branded primary-domain site, product/collection routes, managed checkout/stock/admin | Platform/theme constraints; subscription/operations before selling if adopted too early |
| **Custom full-stack/admin** | Poor current fit | Maximum bespoke control | Owns auth, stock integrity and operations without a demonstrated benefit |

**Evidence:** Astro components "render to static HTML with no client-side runtime" ([official docs](https://docs.astro.build/en/concepts/islands/)). Next.js layouts/pages are Server Components by default ([official docs](https://nextjs.org/docs/app/getting-started/server-and-client-components)); its [static-export documentation](https://nextjs.org/docs/app/guides/static-exports) describes limitations on runtime server features. Shopify explicitly states, "A headless storefront costs more to build and run than a theme" ([official guidance](https://shopify.dev/docs/storefronts/headless/overview)).

These establish capabilities and tradeoffs, not a benchmark proving one framework is always fastest or cheapest.

### Version policy

No production framework/runtime/API version is selected. These are rolling official documentation sources consulted on 2026-10-28. **Exact production framework, TypeScript, runtime, adapter and API versions remain unpinned until implementation.** At bootstrap, select compatible supported stable releases, review support/security notices and commit the lockfile/runtime choice.

The prototype has its own existing package/lockfile: **markdown-it 15.0.3**, verified against the package registry and installed package, renders the planning UI locally. Its bundled browser build is served from this project, not a CDN. Native Node tests cover the prototype's pure behavior. This does not constitute selecting a production framework.

Do not treat a release number in a research snapshot as an instruction to install it months later.

## Production structure

The following is a **proposed future tree**, not the current prototype implementation:

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

Components receive simple business-facing props. Do not import Shopify SDK/GraphQL types into product cards, or put raw provider IDs into public routes. Application-owned product keys survive changes to slugs, SKUs and providers.

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

**Default:** Shopify owns real products/variants, prices, orders, stock, checkout, and owner inventory adjustments. The True Hive owns its business/service story and customer-facing presentation.

First try the owner workflow in Shopify Admin: add a product variant, receive stock, adjust for damage/counts, sell in person, inspect online availability, and handle a return. "We need inventory management" does not by itself mean "we need to build inventory software."

Choose among:

| Path | When appropriate | Consequence |
|---|---|---|
| Native Shopify website/theme | Standard commerce and owner editing fit the design | Same primary-domain brand, collection/product/cart navigation, service/story pages; migrate useful URLs if needed |
| Astro/Next.js headless site + Shopify | A documented custom experience earns its cost | One primary-domain frontend; own cart UX, caching, integration errors, accessibility, API upgrades and monitoring |
| Temporary external shop link | Explicitly approved transition or outage fallback only | Not the intended completed experience; disclose the transition and preserve useful redirects/navigation |

Use Shopify-hosted checkout; never handle card data in custom site code. Shopify's cart supplies a URL that "redirects customers through Shopify's web checkout" ([cart documentation](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/manage)).

Custom admin is a phase-5 exception. Validate role, audit, lot/batch, manufacturing, reporting, or workflow gaps before approving it. Prefer configuration or an existing supported app when it meets the requirement.

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

**Current prototype commands:** `npm ci --ignore-scripts`, `npm run preview`, and `npm test` are implemented. The preview serves the project root on loopback so the hub can read source documents.

The following are **future production script contracts**, not claims that Astro/check/build/browser-runner scripts already exist here. Phase 1 defines them without confusing prototype tests with the production gate.

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
