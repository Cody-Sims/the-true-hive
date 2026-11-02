# Change log

## Unreleased

### Added

- Secure inventory-phase specification and operator runbook, with isolated Firebase/app-enforced MFA, Stripe card-only test checkout and separate held/paid/physical stock approved for implementation.
- Private owner-only admin-access provisioning with transactional membership/session revocation and no runtime-credential fallback.
- Forward-compatible held stock and revision constraints; count corrections preserve checkout allocations and return retry-safe audit receipts.
- Disabled-by-default private product/location/count/history/order workspace and APIs, with shared PostgreSQL shop data.
- Card-only Stripe test checkout, signed/idempotent payment and expiry processing, same-intent recovery and atomic physical pickup accounting; no live charges.

### Fixed

- Idle inventory database disconnects no longer escape the pool and terminate the shared storefront service; diagnostics omit connection details.
- Bounded reconciliation rotates open and uncertain orders so later missed payment/expiry work is not permanently starved, without releasing unverified holds.
- Native admin/order suites retain isolated-database safeguards without requiring a machine-specific PostgreSQL port.
- Rate-limited checkout retries keep the same frozen intent instead of permitting a second unresolved hold.
- The exact inventory root and private HEAD requests receive the CSRF shell required by their layouts.

### Security

- Local review now serves only the curated static artifact, preventing private environment, agent configuration and server files from being fetched through the preview.
- Inventory host/session/MFA/member/CSRF controls, locally revocable sessions and private runtime permission preflight; no personal-site admin-claim or owner-email fallback.
- Session creation serializes with membership revocation, and runtime permission checks reject protected column-only write grants.

## October 29, 2026

- Selected Apiary Market for the actual application, preserving all ten prototype URLs.
- Added the Astro/TypeScript native Node application, custom PostgreSQL schema and private audited inventory transactions, with no Shopify or Docker.
- Added native database, built-browser/accessibility and application-artifact CI gates, plus a CI-gated native Render configuration. Live payment, authenticated administration and mail remain deferred.
- Selected the native Render app and Neon Free PostgreSQL in Oregon, with private runtime/operator credentials and no paid database provisioning.
- Added database/schema preflight before server startup and routine liveness monitoring so free database compute can suspend; remote TLS remains certificate-verified with explicitly optional channel binding.
- Published the owner-approved preview through GitHub Pages and the gated main-branch workflow.
- Added only the `preview.thetruehive.com` CNAME; left the main domain, existing mail DNS and other zone records unchanged.
- Documented email as deferred, with phone/social contact planned and `contact@thetruehive.com` recorded as a future address, not an activated inbox.
- Added an explicit local SVG favicon to prevent project previews requesting a nonexistent host-root icon.

## Unreleased - October 28, 2026

### Added

- Seven additional original directions, bringing the review to ten coordinated homepage/store concepts.
- Shared collection, product/variant, demo cart, read-only checkout and inventory-lab views.
- In-browser project library rendering the real Markdown plans, requirements, sources, phases and design briefs.
- Local-to-growth business plan and a copyable/printable partner discussion workbook.
- Dedicated SEO/acquisition and inventory/fulfillment plans.
- Business-readiness evidence separating verified federal guidance from unverified Tennessee/local confirmation gates.
- Owner-approved public GitHub Pages review, an explicit publication allowlist, and gated CI/CD with preserved browser-dependency notices.

### Changed

- Product/local-sales priority and pickup-first fulfillment now drive the plan; shipping is a later gate.
- Future commerce targets an integrated primary-domain experience, not merely an unrelated external-shop link.
- Existing soap sales and owner-reported apiary/honey-allocation constraints shape the business roadmap; no retail honey/yield promise is invented.
- The original three concept URLs remain, with full shop/planning routes added.
- Interactive review uses a local HTTP server and a pinned local Markdown renderer; it does not depend on remote feeds, fonts or a CDN.

### Boundaries

- Samples are not real prices, stock, reservations, payments, orders or secured administration.
- The owner approved the current planning snapshot for public review; confidential future details are not authorized. The review is not production business/commerce hosting, and noindex is not authentication.
