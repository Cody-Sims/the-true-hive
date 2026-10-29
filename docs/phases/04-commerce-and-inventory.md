# Phase 4: commerce and authoritative inventory

Entry gate: the owner approves taking online payments, has real products and fulfillment capacity, and funds ongoing operations. This is **not part of the landing-page release**.

## Outcome and subphases

Launch a real storefront within the coherent primary-domain website, hosted checkout, pickup-first fulfillment, reliable stock and owner-operable managed admin. **Basic inventory administration is a prerequisite to selling**, not a later enhancement. Shipping is a later separately approved launch.

| Subphase | Tasks | Gate |
|---|---|---|
| 4A - Decide | P4.1 | Native theme vs headless justified; costs/owner workflow accepted |
| 4B - Prepare | P4.2-P4.3 | Real catalog, opening stock and fulfillment/policies ready |
| 4C - Implement | P4.4-P4.6 | Customer journey and failure behavior proven |
| 4D - Pilot | P4.7 | Owner handles an end-to-end test order and stock reconciliation |

Tasks are serialized by default because they share commerce configuration and contracts. A native-shop branch deliberately avoids much of the headless code below.

## P4.1 - Approve the commerce path

**Purpose:** buy standard commerce capabilities rather than accidentally rebuilding them.  
**Dependencies:** P3.4, or an explicit approved decision to proceed directly after phase 2. **Scope:** S.  
**Files:** architecture/data/decision documents and future `docs/commerce-runbook.md`.

**Acceptance:** test a native Shopify website/theme/admin against the selected experience. Choose a unified native site or justified same-domain headless frontend, not merely an unrelated shop link. Record primary-domain routes, migration/redirects, recurring costs, staff access, markets/POS and supported API version if applicable. Payment remains hosted.

**Verification:** inspect the documented requirement that justifies any headless exception; have the owner try the platform's product/stock workflow. Recheck current official platform pricing/capabilities rather than using this plan as a quote.

## P4.2 - Establish products and opening stock

**Purpose:** make the platform the single authority for sellable variants and quantities.  
**Dependencies:** P4.1 and approved real product/label information. **Scope:** M.  
**Files/systems:** managed commerce catalog, SKU/import mapping, location setup; sanitized fixtures only in tests. No customer/order exports or secrets in Git.

**Acceptance:** approved real variants have stable mappings/SKUs, price/currency, released physical stock/location, tracked-stock and deny-oversell policies. Exclude all samples. Future harvest is not inventory; reconcile the reported honey buyer allocation before any retail offer. Record local sales consistently and resolve batch/bundle/expiry needs.

**Verification:** compare a physical opening count to each enabled location/variant; adjust damage with a reason; simulate an in-person sale and inspect online sellability. Owner reviews duplicate SKUs and mappings.

## P4.3 - Configure fulfillment and customer policies

**Purpose:** ensure the business can fulfill what checkout permits.  
**Dependencies:** P4.2. **Scope:** M.  
**Files/systems:** shipping/pickup/payment/tax configuration, approved policy pages, operational runbook.

**Acceptance:** actual pickup location/eligibility, ready-time notification, instructions, collection/no-show process, fees, taxes, receipts, refunds and privacy/terms are approved. Do not expose a home/apiary inadvertently. Shipping is disabled until a separate reviewed pilot; no food/cosmetic claim or exemption is assumed.

**Verification:** inspect allowed/disallowed delivery addresses, pickup eligibility and order totals in test mode; rehearse a fulfillment/return. Confirm applicable obligations instead of assuming a Tennessee exemption.

## P4.4 - Connect the real storefront catalog

**Purpose:** replace showcase/inquiry presentation with real commerce only where approved.  
**Dependencies:** P4.3. **Scope:** M.  
**Files/systems:** native website/theme collection/product/service routes and navigation; **or**, for headless, `src/server/commerce/`, public mapping, collection/product routes, cart components and server-capable deployment configuration.

**Acceptance:** authoritative products/variants/price/currency; no SDK types scattered through UI; selected-location pickup semantics, not an aggregate stock promise; explicit outages, not empty/zero defaults. Crawlable collection/product links, visible real offer data, valid canonical/schema/merchant information and preserved service URLs meet the [SEO gate](../06-storefront-seo-and-acquisition.md).

**Verification:** native path: inspect configured product/variant pages and main-site/shop navigation. Headless path: `npm run test:unit -- tests/unit/commerce-mapping.test.ts` and `npm run test:e2e -- tests/e2e/commerce-catalog.spec.ts`, including provider failure/stale/unavailable states.

## P4.5 - Implement cart handoff to hosted checkout

**Purpose:** make purchase behavior real, accessible and authoritative.  
**Dependencies:** P4.4. **Scope:** M.  
**Files/systems:** native theme/cart configuration; **or** headless cart UI, server/provider calls and cart tests. No custom card-entry/payment backend.

**Acceptance:** variant/quantity selection, removal, errors and total changes are understandable. Server/provider validates inputs and calculates prices. Handle out-of-stock changes and warnings; cart addition is not a homemade stock reservation. Customer continues to the real hosted checkout.

**Verification:** native test-mode purchase walkthrough; headless `npm run test:e2e -- tests/e2e/cart.spec.ts`. Exercise changed price, insufficient stock, unavailable variant, invalid quantity, provider timeout and keyboard/mobile use.

## P4.6 - Prove reliability and access controls

**Purpose:** preserve correct commerce behavior during failures and retries.  
**Dependencies:** P4.5. **Scope:** M.  
**Files/systems:** managed account roles/MFA, cache/failure configuration; only if required, webhook receiver/durable processing/reconciliation and related tests.

**Acceptance:** least-privilege owner/staff access and no private credentials in public output. Native shop path does not add a sync database/webhooks unnecessarily. If a webhook consumer is needed, verify raw-body HMAC, atomically deduplicate, handle out-of-order/missing events and reconcile. Backward-compatible API/version upgrades are documented.

**Verification:** inspect role permissions and public bundles; for custom integrations run targeted contract/webhook tests, including duplicate concurrent deliveries and invalid signatures. Rehearse outage behavior without creating fictional stock or successful orders.

## P4.7 - Run an operational pilot before opening sales

**Purpose:** prove the business operation, not merely a working Buy button.  
**Dependencies:** P4.6. **Scope:** S.  
**Files/systems:** release checklist, commerce platform, operations/runbook; only fixes found by the pilot.

**Acceptance:** test selection -> hosted payment -> owner receipt/stock -> preparation -> ready notification -> pickup confirmation, plus no-show/cancel/refund and physically appropriate restock. Test two buyers for the last unit, location incompatibility, offline/POS reconciliation and wholesale allocation. Owner can operate and recover without a developer.

**Verification:** run existing commerce browser/contract selectors in one invocation where applicable; perform the test-mode operational scenarios in the chosen platform. Turn on real payments only after owner sign-off; monitor initial orders and stock closely.

## Rollout and rollback

Start with a small approved real catalog. Keep services accessible. If selling fails, disable affected purchases or link to a healthy authoritative shop; do not revert to fake successful checkout.

Preserve orders, payments, stock and audit records through storefront rollback. Refunds/cancellations require platform operations, not a code revert. Back up approved configuration/mappings and keep a documented stock reconciliation procedure.

## Not included by default

Custom admin, custom authentication, payment processing, a separate inventory engine, manufacturing software, multi-channel event infrastructure, subscriptions or loyalty. Phase 5 may justify a bounded addition; it does not automatically authorize these systems.
