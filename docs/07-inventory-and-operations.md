# Inventory, pickup, and owner operations

Status: production requirements and operating design; the browser lab is fictional and read-only.

## What must be true

The future store is part of the website, but **the website is not the stock ledger**. Use one authoritative commerce/inventory system for actual variants, locations, sellability, orders, stock adjustments and audit history. Start with managed administration, not a custom `/admin`.

The owner currently reports two hives, small-scale soap sales and a buyer for next year's honey. That supports a soap-led local plan, **not retail honey quantities or a pollination fleet**. Keep the buyer/forecast context private until approved for publication.

## Keep these records separate

| Record | Example | Is it sellable stock? |
|---|---|---|
| Product content | Real soap formula/label, product photographs | No |
| Variant/SKU | A specific soap format or future jar size | Identity, not quantity |
| Production forecast | Planned soap batch or hoped-for 2027 harvest | **No** |
| Buyer agreement | Owner-reported next-harvest arrangement | A commercial commitment; not received stock |
| Received physical lot | Counted, traced, quality-released finished units | Potentially, subject to allocation and fulfillment |
| Location inventory level | Available/committed/unavailable units at a supported location | The authoritative stock state |
| Customer cart | Desired variant IDs/quantities | **Not a homemade reservation** |
| Order/allocation | Platform-supported commitment and fulfillment workflow | Affects sellability according to provider rules |

Do not manually write a future harvest into Shopify's native `committed` state. Shopify manages committed inventory through order-related actions; a forecast/agreement needs an appropriate planning/allocation workflow before actual received stock is exposed to retail.

## System-of-record flow

```text
Approved product/variant records ----------------------> public catalog

Production/harvest forecast -> private planning only
Physical batch received -> quality/label release -> authoritative location stock
                                     |
              approved market/wholesale/retail allocations
                                     |
            fulfillment-scoped sellability -> product/cart
                                     |
               platform revalidation + hosted checkout
                                     |
        paid/accepted order -> prepare -> notify ready -> pickup
                                     |
             count / damage / cancellation / return workflow
```

No separate public JSON file maintains real stock. A headless adapter may read/cache safe projections, but the platform remains authoritative at mutation and checkout.

## Inventory requirements and acceptance

| ID | Requirement | Observable acceptance |
|---|---|---|
| I01 | Stable product/variant identity; useful unique merchant SKUs | A SKU/slug edit does not orphan orders or change the application key; duplicates are reviewed rather than assumed impossible |
| I02 | Variant/location-specific stock | Jar formats/soap variations and storage/market locations retain separate levels |
| I03 | Forecasts and wholesale allocation distinct from physical retail units | The reported allocated future honey cannot appear as retail stock/preorder by default |
| I04 | Pickup availability scoped to the selected location | Stock from two locations is not combined into one pickup promise; transfers require supported configuration and disclosed timing |
| I05 | Unknown, sold-out and not-offered are distinct | An API outage/missing record does not show zero, in-stock, or shipping eligibility |
| I06 | Provider owns price/totals and final stock checks | A manipulated browser price or stale cart does not control payment amount/sellability |
| I07 | No custom cart-based decrements/reservations | Adding/removing a cart line does not alter physical/platform stock through local arithmetic |
| I08 | Deny unapproved overselling | Competing orders for the last unit are resolved by the authoritative platform, with explicit customer recovery |
| I09 | In-person sales reconcile with online availability | A market/POS sale reduces the proper real location's sellable stock, or a documented reconciliation precedes further offers |
| I10 | Adjustments have reason, actor and history | Damage/count/receipt/transfer actions are auditable and not duplicated by event retries |
| I11 | Refund is not automatically sellable restock | Actual receipt, product suitability and correct location determine restocking |
| I12 | Batch/lot and quality needs are addressed | A complaint can be traced to actual materials/finished units; an appropriate supported process/app is selected if basic stock lacks it |
| I13 | Managed roles/MFA and least privilege | Staff cannot perform unauthorized adjustments/export/access; private credentials never reach the browser |
| I14 | Failure/reconciliation plan is operational | Outages, duplicate/out-of-order/missing events and deployment rollback do not destroy or invent stock/orders |

These are business/engineering invariants. They do not claim every feature is supplied by a basic platform plan.

## Pickup first: define the customer promise

Before taking an order, approve a legitimate pickup arrangement and whether any address is public. Do not equate "based in Madisonville" with "walk into this home/apiary."

The production journey must explain:

1. Eligible products and the actual pickup location.
2. Processing time and collection windows; exact details before commitment.
3. Any pickup fee, minimum, restrictions or accessibility arrangements.
4. Receipt versus **ready for pickup**: payment does not mean preparation is finished.
5. Ready notification, collection instructions and verification of collection.
6. No-show, cancellation/refund, damaged/returned goods and stock treatment.

If only part of an order is available, use the platform's supported rules. Do not promise split pickup/shipping, transfers or custom scheduling without checking plan/capability and customer communication.

Shopify's current [pickup guidance](https://help.shopify.com/en/manual/fulfillment/setup/delivery-methods/pickup-in-store) says pickup is configured per location and discusses supported transfers/processing times. It does not establish that the business already has an approved location, eligibility or a given platform plan.

## Owner workflow rehearsals

| Workflow | Required rehearsal |
|---|---|
| Receive a soap batch | Match formula/batch and quality release, count finished units, assign the proper stock location |
| Record local sale | Use agreed POS/recording path; reconcile physical stock and retail availability |
| Handle honey allocation | Keep forecast/agreement private; receive/trace real lots and use approved allocation/order mechanics before any retail offer |
| Prepare pickup | Verify real stock/order, pack, send ready notice only when ready, confirm collection |
| Correct a count | Record actor/reason; do not hide discrepancies through unlogged replacement numbers |
| Damage/quality hold | Remove affected units from sellability without pretending they were sold |
| Cancel/refund | Apply provider workflow and physically appropriate restock; avoid double increments |
| Recall/complaint | Identify batch, supplier lots and affected units/customers through the approved private process |
| New staff | Apply least privilege/MFA; rehearse access removal and recovery |

Recipe/BOM consumption, cure/production lead time, lot expiry and bundle-component availability are separate maker requirements. Start with an adequate supported workflow and qualify any app; do not assume a simple quantity counter solves them.

## Native versus headless implementation

**Native Shopify site/theme:** prefer platform catalog, stock/admin, pickup, checkout and notification workflows when they meet the requirement. No synchronized database or webhook receiver is required merely to display the native storefront.

**Headless site:** use server-only privileged integrations, safe public models and a documented cache/freshness policy. Keep normal content available during inventory problems, but do not claim known stock or successful cart/checkout acceptance when validation fails. Revalidate through the provider at purchase time.

If a local projection/side effect genuinely needs webhooks, verify raw-body HMAC before trust, validate the expected merchant/topic/version, atomically persist/deduplicate delivery, acknowledge durable receipt and reconcile missed/out-of-order data. Prefer re-fetching authoritative state to arithmetic based on events.

Private tokens, admin credentials, customer records and webhook secrets never belong in the static site. Public Storefront tokens are a distinct intentionally public credential type; scopes still matter.

## Primary-source evidence

| Source | Supporting observation | Limit |
|---|---|---|
| [Shopify inventory model](https://shopify.dev/docs/apps/build/inventory-management-apps/manage-quantities-states) | "Inventory levels connect one inventory item to one location"; variants have associated inventory items | Pin and inspect the chosen API version; this is not a custom reservation recipe |
| [Managed quantity adjustments](https://help.shopify.com/en/manual/inventory-and-locations/adjusting-inventory/adjusting-inventory-quantities) | Existing admin supports count/quantity adjustments and history | Does not prove every batch/manufacturing requirement is covered |
| [Pickup configuration](https://help.shopify.com/en/manual/fulfillment/setup/delivery-methods/pickup-in-store) | Location-specific pickup, processing time and transfer considerations | Confirm current plan/checkout compatibility and actual business setup |
| [Webhook verification](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries) | HMAC uses raw body; duplicate deliveries require idempotent handling | Only needed for a real consumer; not permission to build unneeded sync infrastructure |
| [Webhook limitations](https://shopify.dev/docs/apps/build/webhooks) | Ordering/delivery cannot be treated as a perfect stock ledger | Reconciliation is required when maintaining derived local state |

Official rolling pages consulted on 2026-10-28. Recheck capabilities, support windows and API versions at implementation.

## What the prototype proves and does not prove

The [inventory lab](../prototypes/inventory.html?design=hearth) and all ten shop themes use the same local fixture snapshot. They demonstrate variant choice, channel/location scope, explicit sold-out/unknown states, bounded cart quantities and subtotal recalculation. The sample cart stores only IDs/quantities and never reserves stock.

**They do not prove:** real concurrent stock correctness, payment idempotency, secure admin authorization, physical batch traceability, real pickup eligibility or provider availability. Those require the actual platform and the operational [phase-4 gate](phases/04-commerce-and-inventory.md).

## Release and recovery gate

Before enabling payments: count opening real stock, resolve honey allocation and product/label requirements, configure pickup and staff roles, run an end-to-end test order/refund/collection, test last-unit competition and in-person reconciliation, rehearse outage/rollback, and train the owner.

Restore storefront code without rolling back authoritative orders/stock. Disable broken purchasing explicitly rather than returning fake success. Keep support/fulfillment operational during technical recovery.
