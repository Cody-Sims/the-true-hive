# Phase 4: commerce and authoritative inventory

Entry gate: the owner approves taking online payments, has real products and fulfillment capacity, and funds ongoing operations. This is **not part of the landing-page release**.

## Outcome and subphases

Build on the approved custom Astro/Node/PostgreSQL foundation to launch our storefront, processor-supported payment, pickup fulfillment and an authenticated owner administration workflow. **Usable secure inventory administration is a prerequisite to selling**, not a later enhancement. No Shopify or Docker; shipping remains a later launch.

| Subphase | Tasks | Gate |
|---|---|---|
| 4A - Decide | P4.1 | Custom order/admin/payment contracts, roles and operating costs agreed |
| 4B - Prepare | P4.2-P4.3 | Real catalog, opening stock and fulfillment/policies ready |
| 4C - Implement | P4.4-P4.6 | Customer journey and failure behavior proven |
| 4D - Pilot | P4.7 | Owner handles an end-to-end test order and stock reconciliation |

Tasks are serialized where they share stock/order/authentication contracts. The first foundation implements read APIs and private count transactions only; this phase adds the actual commerce and authorized owner workflows.

## P4.1 - Approve the commerce path

**Purpose:** buy standard commerce capabilities rather than accidentally rebuilding them.  
**Dependencies:** P3.4, or an explicit approved decision to proceed directly after phase 2. **Scope:** S.  
**Files:** architecture/data/decision documents and future `docs/commerce-runbook.md`.

**Acceptance:** custom ownership and initial Render-app/Neon-Free tiers are selected. Specify order/reservation/cancellation states, admin authorization, inventory roles, pickup, market/wholesale allocation and the chosen payment processor. Reassess database quotas, backups/recovery and any separately approved upgrade before real orders. Do not implement our own card-data collection or mistake a public count endpoint for administration.

**Verification:** owner/maintainer approves the contracts and role matrix; verify the processor's current docs and sandbox flow. Existing native stock-correction tests are not proof of complete orders/payment behavior.

## P4.2 - Establish products and opening stock

**Purpose:** make the platform the single authority for sellable variants and quantities.  
**Dependencies:** P4.1 and approved real product/label information. **Scope:** M.  
**Files/systems:** our PostgreSQL catalog, variant/location records, approved import and owner UI; fixtures only in tests. No real customer records, credentials or private exports in Git.

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
**Files/systems:** our collection/product routes and public DTOs, server catalog/inventory modules, runtime configuration and the approved owner workflow.

**Acceptance:** authoritative products/variants/price/currency; no SDK types scattered through UI; selected-location pickup semantics, not an aggregate stock promise; explicit outages, not empty/zero defaults. Crawlable collection/product links, visible real offer data, valid canonical/schema/merchant information and preserved service URLs meet the [SEO gate](../06-storefront-seo-and-acquisition.md).

**Verification:** run the relevant native application/DB cases and built-site browser selectors; inspect real published products, draft exclusion and selected-location stock/outage states. Existing commands are in the operations guide; add focused cases for new commerce behavior.

## P4.5 - Implement cart handoff to hosted checkout

**Purpose:** make purchase behavior real, accessible and authoritative.  
**Dependencies:** P4.4. **Scope:** M.  
**Files/systems:** our cart/order/reservation modules, processor integration and their tests. No custom card-entry or card-storage backend.

**Acceptance:** our server validates variants/quantities and computes authoritative merchandise prices from PostgreSQL. Define reservation expiry/release and reconcile processor payment outcomes idempotently. Handle changed stock/totals; a browser cart alone never reserves stock. Sensitive payment details stay with the selected processor.

**Verification:** run a sandbox purchase and real transactional/order integration cases for changed price, last-unit competition, payment timeout/retry, cancellation/release and mobile/keyboard behavior.

## P4.6 - Prove reliability and access controls

**Purpose:** preserve correct commerce behavior during failures and retries.  
**Dependencies:** P4.5. **Scope:** M.  
**Files/systems:** authenticated owner roles/MFA, least-privilege database access, payment callback verification/idempotency and reconciliation tests.

**Acceptance:** authorize every owner mutation and derive audit actor identity from verified authentication. Keep secrets server-side. Verify the selected processor's documented callback scheme, atomically claim event identity and reconcile missing/out-of-order outcomes. Do not update stock through naive webhook arithmetic.

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

The first foundation has no authenticated admin, live payment/order flow, manufacturing software, subscriptions or loyalty. Custom storefront/inventory ownership is approved and the SQL/read/transaction foundation is included; secure administration and payment remain separate implementation gates.
