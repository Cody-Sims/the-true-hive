# Inventory, pickup, and owner operations

Status: production requirements and operating design; the browser lab is fictional and read-only.

## What must be true

The store's browser UI is not the stock ledger. **Our PostgreSQL database is the selected authority**, with native Node repositories for public reads and private inventory transactions. The owner rejected Shopify. Render hosts the app and Neon manages PostgreSQL infrastructure; stock rules remain ours. No Docker.

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

Do not write a future harvest into physical on-hand stock or committed units. Forecasts/agreements need an explicit planning/allocation record; actual received, quality-released batches enter physical inventory separately. Order reservations are a later transaction design, not a count fabricated from a cart.

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

No public JSON file or browser cart maintains real stock. Our server maps constrained PostgreSQL data into location-scoped availability; the internal correction operation commits count/audit together. Checkout/order reservations are not yet implemented.

## Inventory requirements and acceptance

| ID | Requirement | Observable acceptance |
|---|---|---|
| I01 | Stable product/variant identity; useful unique merchant SKUs | A SKU/slug edit does not orphan orders or change the application key; duplicates are reviewed rather than assumed impossible |
| I02 | Variant/location-specific stock | Jar formats/soap variations and storage/market locations retain separate levels |
| I03 | Forecasts and wholesale allocation distinct from physical retail units | The reported allocated future honey cannot appear as retail stock/preorder by default |
| I04 | Pickup availability scoped to the selected location | Stock from two locations is not combined into one pickup promise; transfers require supported configuration and disclosed timing |
| I05 | Unknown, sold-out and not-offered are distinct | An API outage/missing record does not show zero, in-stock, or shipping eligibility |
| I06 | Our server/database own merchandise prices and stock checks; the processor verifies payment | A manipulated browser price or stale cart does not control the payable order |
| I07 | No custom cart-based decrements/reservations | Adding/removing a cart line does not alter physical/platform stock through local arithmetic |
| I08 | Deny unapproved overselling | Competing orders for the last unit are resolved by the authoritative platform, with explicit customer recovery |
| I09 | In-person sales reconcile with online availability | A market/POS sale reduces the proper real location's sellable stock, or a documented reconciliation precedes further offers |
| I10 | Adjustments have reason, actor and history | Damage/count/receipt/transfer actions are auditable and not duplicated by event retries |
| I11 | Refund is not automatically sellable restock | Actual receipt, product suitability and correct location determine restocking |
| I12 | Batch/lot and quality needs are addressed | A complaint can be traced to actual materials/finished units; an appropriate supported process/app is selected if basic stock lacks it |
| I13 | Authenticated custom owner roles/MFA and least privilege | Staff cannot perform unauthorized adjustments/export/access; private credentials never reach the browser |
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

Our future pickup workflow must implement location eligibility, preparation/ready notification and truthful timing. The current availability endpoint does not combine locations or expose a public address; it is not a reservation or fulfillment promise.

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

## Implemented foundation and later administration

The first slice provides product/variant/location tables, count constraints, checksum-verified migrations, read APIs, readiness, and an internal `adjustStock` operation. Native PostgreSQL cases cover last-unit competition, matching retries, conflicting operation reuse and rollback on history failure.

There is **no public editing API, admin login, payment or real customer order yet**. The eventual admin must authenticate/authorize the operator and use private write credentials. Public read credentials should be least-privilege. Keep useful content during outages, but never substitute mock prices/stock when the database catalog fails.

If a local projection/side effect genuinely needs webhooks, verify raw-body HMAC before trust, validate the expected merchant/topic/version, atomically persist/deduplicate delivery, acknowledge durable receipt and reconcile missed/out-of-order data. Prefer re-fetching authoritative state to arithmetic based on events.

Database, admin and payment secrets never belong in frontend bundles or public repository files. Neon Free is the initial empty-schema/pilot tier, not approval of its short history window for real orders. Confirm quotas, backup ownership and a rehearsed recovery process before storing operational inventory or enabling checkout; any paid upgrade needs separate approval.

## Primary-source evidence

| Source | Supporting observation | Limit |
|---|---|---|
| [PostgreSQL locking](https://www.postgresql.org/docs/16/explicit-locking.html) | Transaction/row locking supports serializing conflicting stock changes | Real native integration cases supplement the documented behavior |
| [node-postgres transactions](https://node-postgres.com/features/transactions) | A transaction uses one checked-out client | Never perform a multi-statement transaction through unrelated pool queries |
| [Neon connection pooling](https://neon.com/docs/connect/connection-pooling) | Pooled runtime and direct operator connections | Pooling does not implement stock/admin logic |
| [Neon plans](https://neon.com/pricing) | Free quotas and short recovery history; paid tiers differ | A free project is not a rehearsed business-data recovery plan |

Official rolling pages consulted on 2026-10-28. Recheck capabilities, support windows and API versions at implementation.

## What the prototype proves and does not prove

The [inventory lab](../prototypes/inventory.html?design=hearth) and all ten shop themes use the same local fixture snapshot. They demonstrate variant choice, channel/location scope, explicit sold-out/unknown states, bounded cart quantities and subtotal recalculation. The sample cart stores only IDs/quantities and never reserves stock.

The prototypes do not prove real inventory correctness. The new application adds separately tested native PostgreSQL transactions; these still do **not** prove payment idempotency, secure admin authorization, lot traceability, real pickup eligibility or hosted production readiness. Those remain [phase-4 gates](phases/04-commerce-and-inventory.md).

## Release and recovery gate

Before enabling payments: count opening real stock, resolve honey allocation and product/label requirements, configure pickup and staff roles, run an end-to-end test order/refund/collection, test last-unit competition and in-person reconciliation, rehearse outage/rollback, and train the owner.

Restore storefront code without rolling back authoritative orders/stock. Disable broken purchasing explicitly rather than returning fake success. Keep support/fulfillment operational during technical recovery.
