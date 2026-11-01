# Specification: secure inventory administration and connected checkout

Status: **next-phase outcome and implementation choices approved on 2026-10-31**. Implementation is in progress, not a claim of deployed administration or live sales.

The owner approved an **isolated True Hive Firebase project**, **app-enforced MFA before deployment**, and **Stripe Checkout in card-only test mode**. Physical on-hand, checkout holds and paid commitments remain separate; an authorized **Record pickup** action records physical departure. No Firebase billing upgrade, live payment, new paid service, production-domain cutover or email setup is authorized.

## Objective

Give an authorized administrator a usable inventory workspace at **`inventory.thetruehive.com`**, connected to the same PostgreSQL catalog and stock that the shop reads. Product management, counted-stock corrections, checkout holds, verified payments and pickup must remain attributable, transactional and retry-safe.

## Users and use cases

| User | Use case | Outcome |
|---|---|---|
| Authorized admin | Create/edit a product and its variants | Real records start unpublished; validation precedes publication |
| Authorized admin | Establish a location and adjust a variant's count | A specific location's stock and audit history change together |
| Authorized admin | Review paid orders and record pickup | Physical stock and the paid commitment decrease together, once |
| Shopper in the approved test environment | Select a real published variant and quantity | Server prices/stock govern hosted test checkout |
| Maintainer | Provision/revoke admin access or reconcile checkout | Private operator tooling; no public role-management endpoint |
| Anonymous or ordinary signed-in user | Requests private pages/API | No inventory records or mutation capability |

## Requirements

| ID | Required behavior |
|---|---|
| IM1 | Authorize every private page/read/write server-side. Firebase identity alone is not admin permission. |
| IM2 | Use a separate True Hive Firebase project, Google sign-in and Firebase TOTP MFA. Reject first-factor-only sessions. |
| IM3 | Keep private admin membership in PostgreSQL. Provision/revoke through an operator-only CLI with direct owner credentials; never inherit personal-site owner-email fallbacks or claims. |
| IM4 | Use revocation-checked Firebase session cookies plus locally revocable session records. Sign-out invalidates the local session, not merely the visible UI. |
| IM5 | Create/update products and stable variants/SKUs; publish only validated real records; archive rather than destructively delete. Do not import prototypes. |
| IM6 | Establish genuine locations explicitly. New stock records start at a disclosed zero administrative balance; counted/received units enter through an audited adjustment. |
| IM7 | Show physical on-hand, held, committed, unavailable and sellable quantities separately. Unknown records/outages are not zero. |
| IM8 | Apply positive integer increase/reduce operations with an authenticated actor, reason, expected revision and UUID idempotency key. No absolute-count overwrite or unlogged override. |
| IM9 | Shop reads the existing safe public projection. Drafts, SKUs, precise counts, admin identities and audit notes remain private. |
| IM10 | Card-only Stripe **test** checkout acquires an atomic location-scoped hold before requesting a hosted session. Browser prices, carts and redirects never commit stock. |
| IM11 | Verify raw webhook signatures and test-mode/provider/account/object association. Retrieve authoritative session state and settle exactly once, including distinct duplicate events for the same order. |
| IM12 | Confirmed payment moves held units to committed units. Record pickup reduces committed and physical on-hand together, atomically across all order lines. |
| IM13 | Expiry releases only a provider-confirmed expired/unpaid session. A local timestamp, open session, browser cancellation or uncertain API timeout is not release proof. |
| IM14 | Persist unresolved provider/create/payment states for reconciliation. Reconciliation uses the same idempotent settlement/release functions as webhooks. |
| IM15 | Refunds never automatically restock. Returns, damage, manufacturing/lots and delayed payment methods remain separate approved workflows. |

### Non-functional

One modular Astro/native Node application and existing Render service serve both hosts; no second paid service, Docker, Shopify, monorepo or Firestore stock store. Preserve the ten-design Pages review, native CI checks, TLS policy and explicit showcase/database source selection.

The Firebase browser SDK is pinned to 12.19.0 for the existing Node 24.2 baseline. Exact overrides retain that release's app/app-compat dependencies; their broad peer ranges otherwise select newer packages requiring Node 24.12. Firebase Admin and Stripe remain separately pinned; this is not approval to copy the personal site's lockfile or credentials.

Bound request bodies, keys, pagination, quantities and provider timeouts. Use parameterized SQL and one checked-out client per transaction. Lock order/idempotency identities and inventory pairs in a consistent order. Private responses are no-store and non-indexable.

Use the Apiary Market paper/forest/tomato/ochre palette with compact operational forms. Labels, focus/error summaries, status announcements, mobile reflow and keyboard actions cover the admin journey. Do not use optimistic stock success or persist private drafts/tokens/counts in local storage.

## Non-goals

Live charges; customer accounts; email activation; shipping; public role registration; a role editor; automatic financial-refund restocking; manufacturing/BOM/lot software; arbitrary image uploads; bulk imports; real product/stock seeding; paid provider upgrades; or immediate hostname/DNS activation.

## Existing-system constraints and gaps

The foundation already has catalog/variant/location/count tables, append-only stock movements, protected public reads and an internal idempotent `adjustStock`. It does **not** yet have admin authentication, product writes, session/member records, checkout holds, order snapshots, verified payment events or pickup settlement.

The existing cody-sims.com application demonstrates Firebase browser Google sign-in and server Admin SDK verification. Reuse that **pattern**, not its private configuration, credentials, user population, claims or owner-email authorization. The isolated project is an explicit owner decision.

The existing public formula is `on_hand - committed - unavailable`. This phase adds `held` and preserves the meaning of physical on-hand:

```text
sellable = on_hand - held - committed - unavailable

checkout:      held += quantity
paid:          held -= quantity; committed += quantity
expired:       held -= quantity
picked up:     committed -= quantity; on_hand -= quantity
count change:  on_hand += signed delta, never below held + committed + unavailable
```

Checkout holds reduce sellability before payment. Payment makes that allocation durable; it does not subtract the same units a second time.

## Interfaces and data contracts

### Host and authentication boundary

The inventory hostname's root redirects to `/inventory/products`; private UI lives under `/inventory/` and JSON under `/api/admin/`. Both prefixes return no private content on the storefront/preview/default Render hostname. The inventory host does not expose the public shop as an alternate route around the gate.

`INVENTORY_ENABLED=false` is the default. `INVENTORY_ORIGIN` identifies the exact allowed origin; production requires HTTPS. Explicit HTTP loopback origins are development-only. Do not trust arbitrary forwarded-host headers or caller-supplied actor fields.

The auth middleware supplies trusted `Astro.locals.admin` (`uid`, stable hashed `actorId`) and `Astro.locals.csrfToken`. Admin APIs never take actor identity from JSON. Session/login/enrollment/logout exceptions are narrow and documented:

| Route | Contract |
|---|---|
| `GET /inventory/login` | Public sign-in shell on the inventory origin only; no business records |
| `POST /api/admin/session` | Fresh verified MFA ID token, pre-auth CSRF/origin check; mint secure host-only HttpOnly session and persist its hash |
| `POST /api/admin/enrollment` | Fresh first-factor verified identity **and active admin membership**; authorize enrolling that user's TOTP only, not inventory access |
| `POST /api/admin/logout` | CSRF/origin check; revoke local session and clear cookies |
| All other `/inventory/*` and `/api/admin/*` | Verified, unrevoked MFA session, active local session and active admin membership |

Google-account 2FA is not proof of app-enforced MFA. The server checks verified Firebase second-factor evidence, not a browser flag. Use in-memory Firebase browser persistence and clear browser Firebase auth after the server-cookie exchange.

### Private management API

Use the types in `src/domain/admin.ts`. JSON success envelopes name their resource; errors use `{ error: { code, message, fields? } }` without internal exceptions.

| Route | Request/result |
|---|---|
| `GET /api/admin/products` | Bounded limit/offset and search; `{ products, total, locations }` |
| `GET /api/admin/products/:key` | `{ product }`, including private variant/location balances and revision |
| `POST /api/admin/products` | UUID `operationId`, `product` fields and `variants`; atomic unpublished product creation and zero stock records |
| `PUT /api/admin/products/:key` | UUID operation, `expectedRevision`, action `save/publish/archive`, product/variant fields; preserve stable referenced keys |
| `GET/POST /api/admin/locations` | List or create a genuine location; new locations are inactive/non-pickup unless deliberately selected |
| `PUT /api/admin/locations/:key` | Validated name/public label/eligibility and expected revision |
| `POST /api/admin/adjustments` | UUID operation, variant/location keys, signed integer delta, reason and expected stock revision; actor is server-derived |
| `GET /api/admin/history` | Bounded movement history, optionally scoped by variant/location |
| `GET /api/admin/orders` | Bounded private order summaries, no customer/payment credentials |
| `GET /api/admin/orders/:id` | Immutable merchandise/quantity/price snapshots and payment/inventory state |
| `POST /api/admin/orders/:id/pickup` | UUID operation and expected order revision; only paid orders; atomic ledger/count/commitment/order transition |

Product fields are bounded existing keys/slug/title/summary/details/category/image choice. A draft still needs the existing minimum title/summary/category; it may lack a price. Publication requires an active real product, at least one active positive-price USD variant and valid content. Publication does not enable checkout. Archive unpublishes without removing stock, held orders or history. No destructive delete endpoint.

Stock receipts distinguish the original adjustment's before/after result from refreshed current balances. Identical retries return the recorded operation; changed payload/actor under the same ID is a conflict. Stale revisions require a new reviewed intent, not a force-save.

### Checkout and order contract

`CHECKOUT_MODE=disabled` is the default; the only new enabled value is `stripe-test`. Reject live secret keys/configuration and live webhook objects. `CHECKOUT_LOCATION_KEY` explicitly selects one active, pickup-enabled real location. Checkout requires database catalog mode and supplied positive prices.

| Route/operator | Contract |
|---|---|
| `POST /api/checkout` | UUID `operationId`, `lines: [{ variantKey, quantity }]`; at most 20 distinct lines, positive integers up to 100 per line; server location/prices; `{ checkoutUrl }` |
| `POST /api/webhooks/stripe` | Bounded raw bytes and signature; accepted test-mode checkout events only; acknowledge durable processing, otherwise retryable failure |
| `/checkout/return`, `/checkout/cancel` | Generic honest test-flow outcomes; no browser-triggered stock mutation or private order disclosure |
| Operator reconciliation CLI | Bounded unresolved orders; re-fetch/expire sessions safely and apply the same settlement functions; never infer release from time alone |

The provider session uses the order ID as the create idempotency key and immutable database line/price snapshots. Persist the reservation before external calls; attach the resulting provider session separately. A failed/uncertain provider request never creates a fresh order or blindly releases stock. Retry the same intent/key; quarantine states that cannot be safely recovered.

Signed events alone do not bypass order association: re-fetch the expected session and match test mode, metadata, session/order identity, currency, authoritative total and quantities. Require `payment_status=paid` for paid commitment; no zero-cost/no-payment-required flow. Card-only checkout is explicit; unexpected delayed-method outcomes require reconciliation rather than guessed fulfillment.

No public order/customer status endpoint is included. Admin order views expose only the fields required for this test workflow.

### Forward schema and parallel ownership

Add one forward migration after `001_inventory.sql`; never alter applied migration history.

| Record/change | Required columns/constraints |
|---|---|
| `products` | `revision` positive integer, `archived` boolean; archived implies unpublished |
| `inventory_locations` | Positive integer `revision` |
| `inventory_levels` | Nonnegative integer `held`, positive integer `revision`; `held + committed + unavailable <= on_hand` using bigint arithmetic |
| `inventory_movements` | Nullable before/after revision metadata for historical compatibility; existing append-only enforcement retained |
| `admin_memberships` | `uid` primary key bounded to 128 characters, active flag, created/updated timestamps; owner-only writes |
| `admin_sessions` | SHA-256 `session_hash` primary key, membership UID FK, expiry/revocation/creation timestamps; no raw session token |
| `admin_operations` | UUID operation key, trusted actor, action/resource, canonical request hash, bounded before/after/result JSON and timestamp; append-only |
| `orders` | UUID order/idempotency key, canonical request hash, location, state, USD total, unique nullable checkout-session ID, nullable payment-intent ID/expiry, revision and lifecycle timestamps/reconciliation reason |
| `order_lines` | Order/variant composite key, positive quantity/price and immutable title/label snapshots |
| `payment_events` | Unique provider event ID, type, order association, timestamp/result; no full raw customer/provider payload |

Order states: `creating`, `open`, `paid`, `expired`, `picked_up`, `reconciliation_required`. Paid/picked-up transitions are monotonic; a late conflicting payment after an already released order is quarantined, never a fresh allocation without stock validation.

Private service entry points are explicit: `listAdminProducts`, `getAdminProduct`, `createAdminProduct`, `updateAdminProduct`, `listAdminLocations`, `createAdminLocation`, `updateAdminLocation`, `adjustAdminStock`, `listAdminHistory` in `src/server/admin/catalog.ts`; order listing/pickup/reconciliation/checkout services in `src/server/commerce/`. Services receive a `Pool` and trusted actor for mutations. Middleware/auth/runtime boundaries are owned separately; endpoints adapt validated HTTP to these services.

Frozen implementation signatures (HTTP inputs remain untrusted and are validated by the services):

```ts
// src/server/admin/catalog.ts
listAdminProducts(pool, query?) => Promise<{ products: AdminProduct[], total: number, locations: AdminLocation[] }>
getAdminProduct(pool, key) => Promise<AdminProduct | null>
createAdminProduct(pool, input, actorId) => Promise<{ product: AdminProduct, replayed: boolean }>
updateAdminProduct(pool, key, input, actorId) => Promise<{ product: AdminProduct, replayed: boolean }>
listAdminLocations(pool) => Promise<AdminLocation[]>
createAdminLocation(pool, input, actorId) => Promise<{ location: AdminLocation, replayed: boolean }>
updateAdminLocation(pool, key, input, actorId) => Promise<{ location: AdminLocation, replayed: boolean }>
adjustAdminStock(pool, input, actorId) => Promise<{ adjustment, level: AdminInventoryLevel }>
listAdminHistory(pool, query?) => Promise<AdminMovement[]>

// src/server/commerce/orders.ts; DTOs in src/domain/commerce.ts
reserveCheckout(pool, input, locationKey) => Promise<CheckoutReservation>
attachCheckoutSession(pool, orderId, sessionId, expiresAt) => Promise<CheckoutReservation>
getCheckoutReservation(pool, orderId) => Promise<CheckoutReservation | null>
applyCheckoutPayment(pool, input: CheckoutPayment) => Promise<CheckoutSettlement>
releaseExpiredCheckout(pool, input: CheckoutExpiry) => Promise<CheckoutSettlement>
markCheckoutReconciliation(pool, orderId, reason) => Promise<void>
listPendingCheckoutReservations(pool, limit) => Promise<CheckoutReservation[]>
listAdminOrders(pool, query?) => Promise<{ orders: AdminOrder[], total: number }>
getAdminOrder(pool, orderId) => Promise<AdminOrder | null>
recordOrderPickup(pool, orderId, input, actorId) => Promise<{ order: AdminOrder, replayed: boolean }>
```

`reserveCheckout` persists a deterministic one-hour requested checkout expiry with its immutable order before external calls; the adapter must not extend or replace an uncertain session on retries. Cases where the stored expiry can no longer be created safely are quarantined for operator reconciliation, not silently released. Reconciliation may actively expire an open session, then re-fetch it; only confirmed `expired` and unpaid state releases stock.

## Security and privacy

Host routing is not identity verification. Check the exact configured origin/host, verified Firebase issuer/project/session/MFA, local session revocation and current membership independently. Use `__Host-` production cookies with Secure, HttpOnly, SameSite and no Domain attribute. This constrains ambient browser delivery; it does not authenticate a manually replayed cookie.

Use signed session-bound CSRF tokens and exact Origin checks for every admin mutation, including login/enrollment/logout. SameSite is defense-in-depth, not the sole defense. Bound unauthenticated auth/checkout attempts and request bodies. Extend CSP only on the inventory host for the exact selected Firebase endpoints/handler; preserve the storefront policy.

All inventory-host responses carry noindex/nofollow and no-store; private HTML also has restrictive robots metadata. Do not place admin links in public navigation or sitemaps. Allow crawlers to read noindex on the non-sensitive login/error shell instead of blocking the same paths with robots.txt; robots directives are advisory and cannot guarantee a hostname never appears in search. Authentication prevents private content disclosure.

Keep pooled public-read, private inventory-write and direct owner/migration credentials distinct. Runtime credentials may read membership and manage sessions, but never grant/revoke membership, create tables or alter history. Provider secrets, admin UIDs, TOTP secrets, private stock and customer records are not public docs/assets/fixtures. Do not copy configuration from the personal site.

## Errors and edge cases

| Case | Expected behavior |
|---|---|
| Anonymous, ordinary user, wrong project, revoked session, removed membership or no MFA | Denied; no private read or mutation |
| Missing/disabled provider/admin configuration | Explicit unavailable/disabled state, never a test bypass or anonymous fallback |
| Wrong host, absent/incorrect Origin or CSRF | Denied before mutation |
| Invalid data or duplicate slug/SKU | Safe field errors; no partial product/stock/audit write |
| Stale revision or operation reused for another intent | Conflict with authoritative refresh; no overwrite |
| Competing last-unit checkouts/count reductions | At most one allocation succeeds; no negative/over-allocated balance |
| Duplicate event IDs or distinct success events for one order | One paid commitment, no second stock change |
| Lost provider/create response, missed expiry event, open/unpaid session | Keep hold and reconcile; do not falsely report release |
| Paid callback after confirmed release or mismatched amount/mode/object | Persist reconciliation-needed state; never silently oversell or mark paid |
| Repeated pickup or pickup audit failure | One physical decrement; rollback all lines on failure |
| Financial refund | No automatic restock |

## Acceptance criteria

1. Required source/format/unit/native-DB/build/artifact/browser and preserved Pages gates pass after integration.
2. Access tests cover anonymous, non-admin, first-factor-only, wrong-project, revoked/inactive session/member, wrong-host and CSRF cases.
3. Real PostgreSQL tests prove product/stock/order/audit atomicity, stable keys, revision conflicts, last-unit contention, retries and multi-line rollback.
4. Offline provider contract tests prove signature rejection, test-only/object/price association, paid/expiry transitions and reconciliation. A live provider sandbox rehearsal remains required before activation.
5. Keyboard/mobile admin cases cover draft creation/editing, location counts, adjustments, conflict/retry, logout and pickup. No fake production-auth bypass may be shipped to make browser tests green.
6. Shop catalog uses the same committed data and omits private fields; test checkout is visibly labeled and fails closed when disabled/unconfigured.
7. Owner rehearses MFA enrollment/sign-in, access removal, stock opening/reconciliation, test purchase/expiry/pickup and recovery before enabling the hostname or operational use.

## Open questions and activation blockers

- **Owner:** create/configure the isolated Firebase project, approve Identity Platform/billing implications before TOTP enablement, and privately provision the intended admin UID. App-enforced MFA is not negotiable via a browser flag.
- **Owner/operator:** supply private provider/runtime credentials and configure a Stripe test endpoint with the SDK-compatible event version; no live keys.
- **Owner:** supply actual products/prices, locations, opening counts and pickup eligibility. Product/label/compliance and live-sales policies remain unresolved.
- **Operator:** provision least-privilege roles, prove denials, approve backup/restore ownership and rehearse restoration before real operational records.
- **Operator:** schedule and rehearse reconciliation without silently adding a billed cron/service. An executable manual tool is not proof of automatic scheduling.
- **Owner/operator:** add and verify only the inventory hostname after the access/recovery gates; keep root/www and email unchanged.

## Alternatives considered

- Reuse the personal Firebase project: lower setup effort but shared users/credentials/quotas and authorization blast radius; owner chose isolation.
- Firestore inventory or Shopify: not selected; PostgreSQL remains stock/order authority.
- A second Render service: additional billing/deployment/pool complexity without an approved need; retain one app with explicit host separation.
- Email/password-only or upstream Google 2FA as the admin gate: does not meet the approved app-enforced MFA requirement.
- Decrement physical on-hand at payment and also commit stock: double-counts the same units; use the approved hold/commit/pickup model.
- Naive webhook arithmetic or timer-only release: unsafe under retries, uncertainty and event ordering.

## Rollout and rollback

Implement and validate disabled-by-default code first. Apply the forward migration to an isolated test database; production migration and role changes are deliberate operator actions. Configure identity/MFA and test payments privately, rehearse the sandbox and restore, then add inventory-domain TLS/DNS. Do not activate live charges or change the storefront from showcase automatically.

On incident, disable new checkout/admin mutations explicitly while retaining orders, holds, physical counts, commitments and history. Reconcile existing provider sessions before releasing holds. Roll back code without rolling back authoritative records; forward-fix schema if needed.

## Research evidence

Official rolling documentation reviewed on **2026-10-31**; external provider behavior is not a substitute for application integration tests.

| Source | Supported mechanism / limit |
|---|---|
| [Firebase session cookies](https://firebase.google.com/docs/auth/admin/manage-cookies) and [session revocation](https://firebase.google.com/docs/auth/admin/manage-sessions) | Verified server sessions and revocation checks; application membership is separate |
| [Firebase TOTP MFA](https://firebase.google.com/docs/auth/web/totp-mfa) | Requires Identity Platform; verified email, enrollment and second-factor resolver; no billing enablement is implied |
| [Firebase project boundaries](https://firebase.google.com/docs/projects/learn-more) | Project resources/users/configuration share an administrative boundary; isolated project chosen |
| [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) and [cookie mechanics](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie) | Signed/session-bound CSRF, origin checks and host-only cookie defense-in-depth |
| [Stripe limited inventory](https://docs.stripe.com/payments/checkout/managing-limited-inventory) | Checkout session expiry and expiry events; not guaranteed database release |
| [Stripe fulfillment](https://docs.stripe.com/checkout/fulfillment) and [webhooks](https://docs.stripe.com/webhooks) | Provider state/signatures, idempotent fulfillment, duplicate/out-of-order deliveries and retry limits |
| [Stripe event types](https://docs.stripe.com/api/events/types) | Completed/expired/async payment events; refund events describe money, not returned units |
| [PostgreSQL locking](https://www.postgresql.org/docs/16/explicit-locking.html) | Transaction/row-lock mechanism independently supports stock serialization; not Stripe behavior |
| [Render custom domains](https://render.com/docs/custom-domains) | Multiple domains/TLS per service; app owns routing/auth and quota review |
| [Google robots guidance](https://developers.google.com/search/docs/crawling-indexing/robots/intro) and [noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing) | Robots.txt is not authorization or reliable exclusion from search; blocked crawlers cannot observe noindex |
