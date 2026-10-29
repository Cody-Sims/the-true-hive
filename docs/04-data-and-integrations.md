# Data and integration boundaries

This document defines future contracts and invariants. It does **not** request a database, API service, or generic integration framework for the landing page.

The review studio separately contains a fictional catalog/inventory snapshot and a browser-only cart. Its sample prices/stock are not business records. The future real store belongs in the coherent website experience; see [architecture](03-architecture.md).

## Ownership by stage

| Data | Landing page | Local catalog / inquiries | Commerce |
|---|---|---|---|
| Name, locality, story, service scope | Approved typed content | Same, or approved CMS | Same |
| Contact/social URLs | Approved typed content | Same | Same |
| Showcase copy/images | Labeled local concepts | Replace only with approved real records | Provider-owned merchandising or explicitly separate editorial copy |
| Real price/variant sellability | Not shown | Optional owner-approved informational price | Shopify authority; no independently edited duplicate |
| Stock quantity | No live quantity claim | "Ask about availability" unless an authoritative process exists | Shopify variant/location inventory, scoped to approved fulfillment |
| Inquiries | Direct phone/email | Selected hosted form/CRM or bounded endpoint | Same; not an order/booking |
| Orders/payment | None | None | Hosted checkout/commerce provider |
| Credentials | None needed in browser | Provider secrets remain server-side | Private integration credentials remain server-side |

## Stable identifiers and public models

Use an application-owned stable product key, a readable mutable slug, and a variant key when real variations exist. A SKU is an operational identifier, not the primary database key or page URL. Product changes and stock-location changes do not create new product identities.

Keep service offerings separate from stock-counted goods: a pollination inquiry is not "three items in a cart."

### Showcase record now

```ts
type ShowcaseItem = {
  key: string;
  slug: string;
  title: string;
  category: "honey" | "soap" | "candle" | "other";
  description: string;
  image: { src: string; alt: string };
  mode: "showcase";
  disclosure: string;
};
```

No `price`, stock quantity, provider ID, or `addToCart` action is needed. A real production schema validates required content and approved URLs; TypeScript alone does not validate external input.

### Explicit public states later

| Mode | Customer sees | Permitted action |
|---|---|---|
| `showcase` | Clearly labeled concept; no commerce assertion | Explore the story / contact information |
| `inquiry` | Real product details, optional approved indicative price, honest availability message | Ask about local availability |
| `purchasable` | Real provider variant, currency/price, current sellability | Add the selected variant to a real cart |
| Provider unavailable | Service/catalog content plus an explicit temporary availability problem | Retry or approved direct inquiry; not fake stock/cart success |

Do not use a single `isAvailable: boolean` to represent demo content, physical stock, online sellability, pickup eligibility and an API outage.

Future money uses an explicit ISO currency and integer minor units, with correct currency formatting. Never calculate final tax, shipping, discounts or payable totals from client-supplied values.

## Service inquiry contract: phase 3 only

Start with direct contact in phase 2. Add a form only if the business can receive, triage and respond to it reliably.

| Field | Requirement |
|---|---|
| `serviceType` | `removal`, `pollination`, `products`, or `other` |
| `name` | Required, bounded plain text |
| `replyEmail` / `replyPhone` | At least one valid reply method; do not require both without a reason |
| `locality` | Town/postcode for coverage assessment; exact property address not required initially |
| `message` | Required, bounded plain text |
| Removal context | Location on property and safe access description; optional initial details |
| Pollination context | Crop, acreage, bloom window; date ranges can be approximate |
| `consentAcknowledged` | Clear notice for handling this inquiry; not bundled marketing consent |

Proposed limits: name <= 100 characters, message <= 2,000, phone <= 40; email validation follows the selected provider/library rather than a homemade restrictive pattern. Adjust limits against real customer examples before launch. File uploads, exact hive coordinates and marketing signup are excluded initially.

If a custom endpoint is actually selected, define a bounded `POST /api/inquiries` contract and keep it versioned with the form. Success means the provider accepted durable receipt, **not** merely that a click handler ran:

| Result | HTTP / UI meaning |
|---|---|
| Accepted | `202` after durable acceptance; explain that this is an inquiry, not a booking |
| Invalid fields | `400` with safe field-level messages; preserve entered text |
| Abuse limit | `429`, a documented retry window and direct-contact fallback |
| Provider failure | `503`; no success message or silent data loss |
| Receipt uncertain | Explain uncertainty; use request idempotency if retries might duplicate the inquiry |

A hosted form may use its own documented contract instead. Choose **one** receiving path, not two overlapping delivery systems.

Apply server-side schema validation, size bounds, abuse protection, and origin/CSRF controls appropriate to the selected endpoint. Do not log full inquiry bodies. Decide who can access inquiries and the deletion/retention interval before collection; a proposed 90-day triage retention is an assumption requiring owner approval, not a legal rule.

## Future commerce and inventory invariants

| Concern | Required invariant |
|---|---|
| Variant stock | Jar size, fragrance, or other sellable variation has its own variant/inventory item where appropriate |
| Location | One variant can exist at several locations; a location change does not change the SKU |
| Physical vs online | Total on-hand stock is not automatically online sellable or pickup-eligible |
| Checkout authority | Provider revalidates price, requested quantity, shipping and sellability at checkout |
| Overselling | Explicit tracked-stock and deny-oversell policy unless the owner approves a real preorder workflow |
| In-person sales | Record through the same authoritative stock system or an approved reconciliation process |
| Adjustments | Actor, reason and platform audit history accompany damage, count corrections and other adjustments |
| Returns | Restock only when physically received and suitable; a refund is not automatically sellable stock |
| Freshness | Define channel/location scope and observation time; failures produce `unknown`, not zero or "in stock" |
| Services | Removal/pollination capacity is separate from retail stock |
| Pickup location | Never sum stock from different pickup locations into one promise without a supported, disclosed transfer workflow |
| Harvest forecast | Future honey production and a buyer agreement are not physical stock or automatically native platform committed quantities |
| Wholesale allocation | Prevent competing retail offers using the selected platform's supported order/reservation/location workflow; do not double-sell the reported allocated harvest |

Shopify documents that inventory levels connect an inventory item and location ([inventory model](https://shopify.dev/docs/apps/build/inventory-management-apps/manage-quantities-states)) and that inventory is tracked separately by location ([location guidance](https://help.shopify.com/en/manual/inventory-and-locations/setup/multi-managed-inventory)). Its admin already supports adjustments and history ([owner workflow](https://help.shopify.com/en/manual/inventory-and-locations/adjusting-inventory/adjusting-inventory-quantities)).

For precise availability, read the selected API version's definitions. "Available for sale" is not necessarily a positive physical quantity at a pickup location. Do not infer a pickup promise from a generic product availability flag.

### Owner workflows to validate before sales

Create a real product/variant, assign a useful SKU, receive opening stock, count it at each location, record an in-person sale, handle damage, fulfill an order, handle a cancellation/refund, and reconcile a return. Train the owner on these workflows before opening checkout.

Do not assume native quantity tracking solves batch/lot traceability, shelf-life, raw-material usage, recipes, gift-set component stock, or production planning. Discover those needs, check supported apps/configuration, and write a separate requirement before building anything custom.

The owner reports current soap sales, two hives and an allocated next-year honey harvest. Import **only counted, quality-released real units**. Keep the forecast/agreement in a planning/production record; do not create sellable honey stock or take retail preorders from that forecast. Exact agreement and allocation mechanics require owner/platform confirmation.

## Integration boundary

For a native Shopify website/theme, the platform may provide the integrated site, catalog/cart/checkout/admin without a custom commerce adapter. If an initial static marketing site exists, migration/integration and redirects are explicit work. A separate unrelated shop link alone is not the target architecture.

If a headless approach is later approved:

```text
Shopify responses -> server integration/mapping -> safe public models -> UI
customer cart request -> server/provider validation -> authoritative cart/checkout URL
```

No Admin credential in browser code. Use minimum scopes. Intentionally public Storefront credentials are different from private tokens. Keep provider IDs inside integration/cart contracts, not throughout presentation or public content records.

## Prototype-only contracts

| Review behavior | Boundary |
|---|---|
| Catalog | Local fictional records; sample product/category/variant IDs and integer USD minor-unit prices |
| Inventory snapshot | Scenario + status + variant/location records; normal, last-jar, sold-out and unavailable |
| Demo cart | `{ version: 1, lines: [{ variantId, quantity }] }`; no stored price, customer identity or payment |
| Add/update | Validate whole quantities and current sample scope; explicit error, never silent clamping |
| Inventory outage/missing record | Unknown, not zero; additions/review blocked; removal still possible |
| Location ambiguity | Require a pickup location when multiple are enabled; do not aggregate into an unfulfillable pickup promise |
| Browser persistence | Shared sample cart across directions; invalid state is surfaced with an explicit reset action |
| Checkout concept | Read-only handoff explanation; no form collecting personal/payment data and no order confirmation |
| Inventory lab | Same fixture source as shopper views; no auth/write endpoint or real administrator access |
| Planning viewer | Whitelisted Markdown paths, safe rendering and source links; no silent answer storage |

These are interaction examples, **not an implementation of production inventory concurrency, stock reservations, owner authorization or provider reliability**. Those require the real platform and the phase-4 operational gate.

Bounded cached catalog reads may be sufficient. Do not mirror inventory into a new database unless a measured requirement needs it.

## Webhooks: only if there is a consumer

No receiver, event bus, queue or synchronization database belongs in phases 1-2.

If later maintaining a projection or side effect:

1. Verify Shopify's HMAC against the **raw** body before trusting/parsing the payload.
2. Validate merchant/topic/version and payload shape; reject unexpected data.
3. Atomically claim a persisted delivery identity so simultaneous duplicates cannot both act.
4. Acknowledge only after durable receipt; process longer work asynchronously if needed.
5. Re-fetch authoritative state or use explicit version checks; delivery order is not guaranteed.
6. Reconcile periodically if maintaining local data; do not rely on every delivery arriving.

Use the selected platform's documented delivery/event identifiers deliberately, not an in-memory set. See [verification](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries) and [delivery limitations](https://shopify.dev/docs/apps/build/webhooks).

## Migration checklist

Before replacing mock content with real catalog data, assign stable keys, get approved product copy/photos, resolve variant/SKU ownership, remove demo fields, and choose one authority per field. Exclude all samples from the live commerce catalog.

Before enabling checkout, verify opening stock, tax/fulfillment/policy configuration, shipping suitability, required product labeling and relevant Tennessee/local obligations with qualified sources. This plan is not a conclusion that any particular exemption or license applies.
