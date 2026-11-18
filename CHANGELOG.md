# Change log

## Unreleased

### Added

- Improve Workbench with a viewport-fit customer/review rail, mobile preview modal, section shortcuts and device-local draft autosave/restore, with clear/reset and storage/cross-tab warnings; photos and real inventory are never persisted.
- Two guided-editor scrolling prototypes: a shared page that moves form and product together, and a compact non-scrolling card beside a form-only scroll area; retain full-page modal preview and previous comparisons.
- Refined direction 02 with anchored mobile step navigation, retained editing context, a mobile preview modal and clickable collection-card-to-product-page preview; preserve the original comparisons and live editor.
- Three interactive Add / Edit product redesign studies with explicit variant archive/restore/delete actions; prioritize the current review and consolidate older concepts into a linked archive without changing the live editor.
- Five fresh product-page-only studies with compact purchase, ingredient-map, format-comparison, paper-label and gallery-focused layouts; leave live home, store and product pages unchanged.
- Five separately published storefront prototypes with distinct home/store/product layouts, accessible ingredient panels, individual variant imagery and local-only demo carts; preserve the original ten-design studio and the live design.
- Four separate single-variant soap styling references and a synchronized image/format gallery; retain owner-photo priority and explicit AI-reference disclosure.
- Original, responsive AI soap-styling references for the two current products, clearly disclosed and automatically superseded by uploaded owner photography.
- Private inventory-home balances and inline audited Add/Reduce controls, with received-unit presets that require explicit review and submission.
- Faithful ingredient import from explicit Details blocks and generated ingredient text, preserving size notes and existing identities.
- Internal Code 128 SKU labels, protected image rendering and explicit printing, plus blank-only suggestions for new variant identifiers; no retail registration or fees.
- Audited inventory-admin purchase switch, closed by default, that preserves catalog/cart access and existing order processing without bypassing test-only payment configuration.
- Owner-confirmed Madisonville pickup address with arrangement-only visiting guidance and explicit notice that tax calculation is not enabled.
- Ordered ingredient editing and escaped product ingredients, with an additive migration that preserves existing products and legacy edits.
- Inventory-priced persistent shopping cart with bounded variant quantities, current-price review and an explicitly gated Stripe test-checkout handoff.
- Location-scoped customer stock notices showing exact counts only at 1-5 available and sold-out at zero, without exposing normal inventory counts.
- Free contact/service inquiry drafts with safe email-link encoding, accessible validation and a no-JavaScript email fallback; visitors send messages themselves.
- Live storefront-card previews and example field placeholders while creating or editing products, including private saved photos, without saving sample data or publishing draft changes.
- Private, bounded product-photo upload/replace/remove workflow with metadata-stripped WebP, audited retry-safe references and publication-gated first-party image delivery; configuration and rollout gates remain explicit.
- Owner-approved website refresh with URL-based collection search/filter/reset, practical accessibility guidance and original brand-sharing artwork.
- Secure inventory-phase specification and operator runbook, with isolated Firebase/app-enforced MFA, Stripe card-only test checkout and separate held/paid/physical stock approved for implementation.
- Private owner-only admin-access provisioning with transactional membership/session revocation and no runtime-credential fallback.
- Forward-compatible held stock and revision constraints; count corrections preserve checkout allocations and return retry-safe audit receipts.
- Disabled-by-default private product/location/count/history/order workspace and APIs, with shared PostgreSQL shop data.
- Card-only Stripe test checkout, signed/idempotent payment and expiry processing, same-intent recovery and atomic physical pickup accounting; no live charges.

### Changed

- Replace Guided in the existing three-direction editor comparison with the improved scrolling/modal prototype while preserving gallery URLs, Add/Edit modes and unsaved-draft protection.
- Share public catalog-notice presentation and retire the legacy inline stock-control branch/client while preserving current storefront states, receiving, corrections and retry protections.
- Give the storefront an image-led product display with concise cards, visible per-format prices, direct format links and native product-page variant choices while preserving actual stock and checkout authority.
- Simplify the global header to Store, Services and About us; keep cart/pickup navigation within the store and trim the footer to contact and policy links without repeated shopper contact prompts.
- Consolidate repeated public page introductions and action links into reusable components, and document the component catalog and evidence-led cleanup plan.
- Use shared inventory navigation, page-heading and select components across Products, editors, locations, orders, history and store settings, with consistent mobile navigation, account disclosure and native dropdown styling.
- Group Products into compact category shelves with visible stock status, location-specific availability filters and a focused desktop/mobile stock-update inspector; preserve product creation, labels, location controls and audited adjustments.
- Replace repeated staging/coming-soon/paused-store prose with product-focused shopping pages, compact canonical starting prices, clearer buying controls and useful cart/checkout recovery links.
- Retain one contextual unavailable-checkout state and explicit test-store/no-real-payment/pickup labels when test mode is configured; document the owner's temporary current-deployment sandbox authorization and rollback boundaries.
- Move contact channels and email drafts to a dedicated Contact page; keep pickup details as a compact collection/cart notice instead of large homepage sections.
- Compact private product/location stock rows while keeping primary counts visible; disclose secondary counts and identifiers on demand and surface new-product/location actions.
- Make non-shopping pages customer-facing with the confirmed business phone, current About/privacy/accessibility information, hidden unconfigured channels and improved shared accessibility; keep shopping and deferred forms separate.
- Connect the public store to published inventory-managed products instead of the demo collection, preserving disabled checkout and indexing.
- Guide product creation with name-first fields, editable identifier suggestions and keyboard-accessible `(i)` help for keys, URLs, variants, stock codes and prices; preserve existing record identifiers.
- Enable the separately authorized MFA-gated inventory hostname for private catalog preparation, while public showcase mode and disabled checkout remain unchanged.
- Host the approved showcase at `https://thetruehive.com` with managed HTTPS and a path-preserving `www` redirect, retaining existing mail and preview DNS.
- Give the public homepage, collection, product, story and service pages one consistent Apiary Market visual identity without third-party fonts, tracking or invented business claims.
- Explain search URLs/history in the draft privacy guidance and accept restricted Stripe test keys without changing any payment-activation gate.

### Fixed

- Retire the superseded inventory-list component and only its dedicated fixtures/tests; preserve current shelves, stock updates and published design history.
- Accept Stripe's current `/g/pay/` hosted Checkout URL for the exact verified test session, retaining the existing `/c/pay/` route and strict host, identity and query checks.
- Make product names and stock rows select their focused inventory panel, with keyboard selection, a clear active-row indicator and the prototype's image-led details and Receive action.
- Preserve existing photo-audit actions when upgrading store settings, restrict public low-stock counts to the configured pickup location, and restore the latest saved cart after checkout recovery without overwriting another tab's changes.
- Keep product drafts editable after an explicitly rejected duplicate key/slug/SKU instead of trapping creation in a revision-conflict workflow.
- Keep process-only liveness available on the inventory hostname so shared-service health probes can succeed without opening private inventory or database readiness routes.
- Skip navigation transfers keyboard focus to the main content, genuine missing pages offer recovery routes, and search/error pages no longer advertise normal-page canonical/share URLs.
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
