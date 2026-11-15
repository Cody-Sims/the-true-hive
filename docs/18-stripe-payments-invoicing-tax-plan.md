# Stripe: Payments, Invoicing and Tax

Date: 2026-11-14  
Status: **sandbox planner baseline confirmed; extensions are proposals with owner gates**  
Scope: thetruehive.com, single-merchant physical goods, local pickup first.

The owner subsequently approved ingredient and quantity-display work, an
inventory-priced shopping cart, and preparation against the existing named
Stripe sandbox. The approved contact form opens a visitor-owned email draft
without a provider or server submission. This is not authorization for live
charges, invoicing, Tax activation or test purchases against operational stock.
The [isolated sandbox checklist](14-development-and-operations.md#isolated-stripe-sandbox-activation-checklist)
records the remaining environment, credentials, webhook and rehearsal steps.

## What was actually verified

The authenticated Stripe MCP account-discovery tool returned one matching
**The True Hive sandbox**, with live mode false. The actual
`stripe_implementation_planner` tool was called with the existing architecture,
the requested three products and the no-live/no-fees/no-stock-mutation boundaries.
Its decision tree confirmed an out-of-the-box **hosted web Checkout** integration.
That existing, already-approved checkout planning configuration was accepted.

This was acceptance of a sandbox planning guide, not payment activation. No
invoice, customer, charge, tax registration, webhook, API key, bank detail or
account setting was created or changed. Private account/context/guide identifiers
are intentionally omitted from this public-repository document.

The returned guide covered the hosted payment baseline. The Invoicing and Tax
work below supplements it with official documentation and explicit open decisions;
it must not be described as a completed three-product implementation.

## Recommended architecture

Retain the existing Astro/TypeScript/native Node application and PostgreSQL stock
authority. Do not replace it with a marketplace, subscription platform, external
store or a new paid service. Stripe handles the payment UI and provider records;
our server verifies independent provider state and owns order/stock transitions.

- Keep hosted Checkout Sessions for one-time purchases.
- Keep the explicitly approved USD, card-only **test** scope until separately
  reviewed. The planner's generic Link/dynamic-method/adaptive-pricing conversion
  suggestions do not override those constraints.
- Keep physical on-hand, checkout holds, paid commitments and pickup separate.
- Fulfillment/accounting stays server-side, signature-verified, associated to the
  intended immutable order and idempotent. Return/success pages are not proof.
- Use an isolated Stripe sandbox and isolated inventory data for rehearsals.
  Never let a simulated payment commit real operational stock.

## Existing integration versus the plan

| Area | Existing implementation | Next action |
|---|---|---|
| Payment surface | Hosted card-only test Checkout Sessions | Retain; finish real sandbox credential/webhook and browser rehearsal |
| Pricing authority | Immutable server snapshots, bounded USD totals | Preserve; no browser price authority |
| Stock lifecycle | Hold -> verified paid commitment -> physical pickup | Preserve; refunds never automatically restock |
| Provider uncertainty | Same-key creation retry, fresh verification, quarantine and bounded reconciliation | Rehearse actual lost-response/expiry/duplicate cases and assign operator ownership |
| Webhooks | Signed completed/expired handlers with event/order association | Configure intended test endpoint/version and verify delivery before activation |
| Runtime key | Restricted and standard test-key syntax now accepted locally | Rehearse actual least-privilege sandbox credentials; real permissions remain unverified |
| Invoicing | No invoice generation/sending workflow | Owner selects the use case before implementation |
| Tax | No automatic-tax setting or tax-aware order totals | Confirm registrations/classifications/fees and design snapshots before enabling |
| Customer/address data | No new public customer-profile/marketing collection in the showcase | Add only necessary fields with reviewed privacy/retention/failure behavior |

Pinned integration: Stripe Node 23.1.0 and API `2026-10-28.endive`. The installed
skill's static “latest SDK” table is not an instruction to downgrade or
automatically upgrade the existing lockfile.

## Phase S1: finish the current test payment path

Technical work that does not require inventing business policy:

1. Accept valid restricted test credentials (`rk_test_`) alongside existing
   standard test credentials (`sk_test_`), with the same disabled/test-only gates.
   Never accept live or organization keys through this configuration.
2. Derive a minimum-permission runtime key from the actual Checkout operations:
   creation, retrieval, line-item inspection and expiry. Confirm any additional
   permissions required for expanded objects in the sandbox; do not grant
   unrelated refunds, payouts, transfers, billing or account administration.
3. Keep MCP OAuth independent from the application's runtime key. Planning/docs/
   account discovery does not require exposing a runtime key to MCP.
4. Recover/verify the already-started named test-key flow privately. Do not create
   duplicate keys because a masked key was not captured.
5. Configure a test webhook on the approved storefront/staging origin with the
   pinned event version and only the events the handler acts on.
6. Rehearse successful payment, confirmed expiry, last-unit competition, duplicate
   callbacks, uncertain create/association, reconciliation and atomic pickup.

**Still gated:** usable private credentials, isolated data, endpoint delivery,
owner participation, reconciliation monitoring and operational recovery.
Configuration-key acceptance is not evidence that a real key has sufficient
permissions or that a payment/webhook works.

## Phase S2: choose the invoicing use case

These are different products/workflows, not interchangeable labels:

| Choice | Purpose | Consequences requiring approval |
|---|---|---|
| Existing payment receipt | Evidence after a successful payment | Branding/email settings and privacy must be reviewed; a receipt is not a new payment request |
| Post-Checkout paid invoice | Generate a detailed paid invoice/PDF for an already-completed one-time purchase | Stripe documents separate pricing; `invoice_creation` and automatic receipt/email behavior need explicit approval |
| Standalone invoice | Request payment, for example a separately agreed B2B/wholesale workflow | Needs private creation/review controls, customer data, payment terms, reservation policy, failures/expiry and sending approval |

**Owner decision:** which of these is needed, for whom, and whether invoice
delivery is manual or automated. No invoice emails or paid feature activation
follow merely from selecting “Invoicing” as a desired product.

After that decision:

- Post-payment invoice artifacts must not cause a second stock commitment.
  Existing verified Checkout settlement remains the authority for that order.
- Standalone invoices need their own explicit order/provider association and
  immutable line/amount snapshots; do not accept arbitrary Dashboard invoices
  as merchandise orders.
- Decide whether/when unpaid invoices reserve scarce stock and for how long.
  The current one-hour Checkout hold is not an implicit 30-day credit policy.
- Verify the version-specific invoice/payment object graph and process the
  relevant signed event idempotently. `invoice.paid` can also mean manually
  marked paid-out-of-band; it is not, alone, proof of processor-collected funds.
  Cash/out-of-band, zero-value and partial-payment handling need owner policy.
- A failed, voided or uncollectible invoice is not automatic authority to return
  physical goods to stock.

## Phase S3: add tax-aware totals only after prerequisites

**Owner/advisor decisions:** actual registrations, product classifications,
inclusive/exclusive pricing, relevant jurisdictions, customer-address needs and
any Tax fees. Do not infer tax obligations from “Madisonville” or guess a tax
code from a product name.

Stripe's setup requires appropriate tax settings and active registrations for
collection. A Stripe registration record describes an existing tax registration;
creating one is not itself registration with the tax authority. Sandbox settings
and registrations are separate from live mode. No registration is created or
expired automatically by this plan.

Technical design after those decisions:

1. Preserve existing settings rather than overwriting a head-office address or
   preset classification. Obtain exact tax-code candidates from Stripe's
   canonical list and let the owner confirm their applicability.
2. Store approved product tax classifications and price tax behavior.
3. Extend the immutable order/provider comparison to distinguish merchandise
   subtotal, discounts if ever approved, tax and final payable total.
   The current merchandise-only total equality check must not simply be
   weakened to accept a larger provider amount.
4. Map line identity/quantity/price/currency and approved tax behavior independently.
   Tax money is not an inventory unit and must not change physical accounting.
5. Add only necessary customer location data with explicit privacy, retention,
   access and failed-calculation behavior. Do not publish private addresses.
6. Test taxable, correctly exempt/zero-tax, missing-registration, missing/invalid
   location, retries and amount mismatch. Inspect the reason for zero tax;
   never choose a wrong code just to make a positive amount appear.
7. Enable automatic tax only through a separately approved release after actual
   calculations and provider/order reconciliation work.

## Phase S4: reviewed operational release

Require passing application/provider rehearsals, correct permissions, backup/
restore and reconciliation ownership, real catalog/count/pickup approval,
reviewed customer policies and the relevant hostname/TLS and feature approvals.
Live payments, real invoices, email, tax collection and paid resources remain
separate decisions. A sandbox guide or local green test does not approve them.

## Sources and evidence limits

- Actual authenticated Stripe MCP planner, 2026-11-14: hosted web Checkout
  baseline accepted for the intended sandbox; no financial operation.
- [Hosted Checkout](https://docs.stripe.com/payments/accept-a-payment?payment-ui=checkout&ui=stripe-hosted)
  is the selected terminal path's integration guide.
- [Receipts and paid invoices](https://docs.stripe.com/receipts) distinguishes
  receipts/post-payment invoices, pricing and email behavior.
- [Invoicing integration](https://docs.stripe.com/invoicing/integration) describes
  signed paid/payment-failure events and the paid-out-of-band distinction.
- [Stripe Tax setup](https://docs.stripe.com/tax/set-up),
  [sandbox testing](https://docs.stripe.com/tax/testing) and
  [tax codes/price behavior](https://docs.stripe.com/tax/products-prices-tax-codes-tax-behavior)
  supply the prerequisites and testing scope.
- [API-key guidance](https://docs.stripe.com/keys) recommends least-privilege
  restricted keys. The local compatibility regression verifies syntax/gates,
  not real provider permissions.

No exact fee, legal obligation, classification, customer record, account balance,
real stock or registration readiness was inferred. The documentation-search
tool was used for reference research, not as evidence of account Tax settings.

## Local implementation checkpoint

Restricted-test-key compatibility is implemented and its regression was observed
red before the validator change, then green with all nine existing/new checkout
configuration cases. Disabled mode, database/origin/inventory gates and rejection
of live, organization, too-short and overlong credentials remain covered.

No actual application key was read, generated, rotated, stored or deployed in
this phase. No webhook delivery, real sandbox purchase, invoice, Tax setting or
registration is claimed complete. Invoicing use-case, tax/classification/fee and
operating decisions remain in `REQUIRED_PERMISSIONS.md`.
