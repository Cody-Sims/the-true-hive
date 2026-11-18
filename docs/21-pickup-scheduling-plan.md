# Specification: pickup scheduling after checkout

Status: **implementation scope approved / production policies not approved**

Version: 3

Date: 2026-11-18

Agreement: the owner explicitly requested implementation of both the Workbench
editor and pickup scheduling, pickup management inside inventory, and cohesive
remaining inventory pages on 2026-11-18. The Workbench uses the subsequently
requested whole-page scrolling, not its earlier independently scrolling form.
This approves technical integration, not guessed operating hours, private
directions, refund rules, live payments or new paid providers.

The subsequent owner-requested inventory UI revision combines stock-location
records and pickup-detail/hour management in the Locations workspace, makes the
remaining tabs cohesive and uses a mobile hamburger. It changes navigation and
presentation, not inventory authority or an automatic merge of stored records.

## Objective

Let a customer choose an approved collection location and available appointment
after checkout, and let an authorized operator set different hours for each
location. Reduce back-and-forth without promising walk-in access or changing
payment, inventory or physical-handoff authority.

[Customer prototype](../prototypes/pickup/index.html?view=customer) /
[Operator prototype](../prototypes/pickup/index.html?view=operator).
Changes connect within the same tab; reloading resets the fictional data.
Those review pages remain fictional. The native implementation must use real
authenticated services, not the prototype's fixtures or fixed December offset.

## Users and Use Cases

- Customer: finish checkout, see verified payment status, select a location,
  date and time, review the details, confirm, and later change an appointment.
- Operator: publish weekly hours per location, close a date or override its
  hours, review affected bookings, and find paid orders still needing a time.
- Authorized inventory administrator: record an actual physical handoff using
  the existing pickup operation, not a calendar checkbox.

## Requirements

Approved inventory integration:

| ID | Behavior | Observable acceptance |
|---|---|---|
| W1 | Use the Workbench for native Add/Edit product pages, with one document scrollbar. | Form and customer preview move together; section shortcuts scroll the document; existing product keys, SKUs and quantities remain authoritative. |
| W2 | Keep a mobile preview modal and a card-to-product-detail preview based on the current form. | Current title, image, formats, USD prices, details and ingredients are visible; preview never adds to a cart, uploads or publishes. |
| W3 | Restore bounded, account/product-scoped editable drafts on the inventory origin. | Never persist credentials, buyer data, quantities, stock/history, photo bytes or filenames; stale revisions and unverified saves cannot silently overwrite a record or restart a mutation. |
| W4 | Expose distinct archive/restore/delete actions with server enforcement. | Archive remains reversible; permanent deletion rejects balances, movements, order/photo references or a resulting invalid published product, and records an idempotent audit receipt. |
| W5 | Preserve existing save/publication/physical-stock confirmation boundaries. | Saving never publishes implicitly, restoring an archived product returns it to draft, and preview/draft changes never change stock. |
| I1 | Make products, locations, store settings, orders, history, labels/photos and login visually cohesive. | Shared navigation, page headers, cards, controls and responsive layout; no lost actions, unsafe unknown-as-zero states or authorization bypass. |
| I2 | Make pickup management part of the private inventory workspace. | A navigation entry exposes site hours, date exceptions, impact review, appointments, paid-unscheduled/help queues and operator-assisted arrangements. |

Functional:

| ID | Behavior | Observable acceptance |
|---|---|---|
| R1 | Offer booking only for a server-verified eligible paid order. A redirect is not payment evidence. | Pending, forged, expired, wrong-order and already-collected contexts cannot create or change a booking. |
| R2 | Choose an approved pickup site, date and available time, then confirm explicit details. | Changing location/date clears the old time; confirmation shows the site, full date, start/end and named timezone. |
| R3 | Commit capacity atomically, make retries safe, and reschedule without losing the old appointment first. | Two buyers competing for the last place produce one success; a failed change preserves the original booking; repeat confirmation cannot duplicate it. |
| R4 | Manage weekly windows and date-specific closures/overrides separately for each site. | Saving one site's Tuesday hours does not alter another site; a closed date offers no new appointments; custom hours replace that date's weekly window. |
| R5 | Make notice, booking horizon, slot length and capacity explicit settings. | Server-issued availability respects validated limits and the site's timezone, including DST tests. Capacity counts appointments/orders in the proposed initial model, not stock units. |
| R6 | Review the impact of availability changes on existing appointments. | An operator sees affected bookings before applying; they are retained and flagged for resolution, never silently cancelled, hidden or displaced. |
| R7 | Provide confirmed, awaiting-time and needs-review views, plus recovery when no suitable time remains. | The operator can find paid unscheduled orders and exceptions; an empty calendar does not imply cancellation or refund. Help does not claim delivery until actually submitted. |
| R8 | Disclose only approved public location information before booking. | Exact private directions require scoped order access; the public location/slot API and prototype contain no private address or route. |
| R9 | Keep scheduling separate from order/payment and stock accounting. | Booking, changing hours and rescheduling leave totals, stock location, held/committed/physical quantities and payment state unchanged. Physical collection uses the existing authorized operation. |

Non-functional:

- N1: Keyboard-operable controls, visible focus, associated error messages,
  announced confirmation, adequate contrast and no horizontal overflow at
  360px. One page scroll on phones, without a nested calendar/form scroll.
- N2: Public slot responses expose only currently eligible, bounded availability,
  not customer identities, booking records or exact business stock quantities.
- N3: Every production mutation has authorization, bounded validation,
  idempotency, revision checks and an auditable actor/result. Conflict/outage
  responses never fabricate success.
- N4: Customer booking data and access credentials are not stored in localStorage.
  Logs exclude capability tokens, personal contacts and private directions.

## Non-Goals

No live payments, automatic refunds, shipping, delivery, tours, calendar-provider
integration, SMS/email delivery, invented addresses/hours or new admin hostname.
No prototype fixtures become operational records. Sites and hours start empty;
customer scheduling starts disabled until an authorized operator configures and
enables it. Cancellation/refund and automated cross-device recovery policies are
not inferred from approval of the design.

## Existing-System Constraints

The following is the pre-integration baseline; new scheduling contracts must
preserve its order and stock authority.

- `src/domain/admin.ts:62-82` defines order states and `AdminOrder.locationKey`;
  there are no appointment DTOs. `src/server/commerce/orders.ts:217-356`
  reserves stock at `orders.location_key`. That is **inventory authority**, not
  a customer-selectable meeting place. A new pickup-site choice must not rewrite
  it or manufacture a stock transfer.
- Payment settlement is separate (`orders.ts:443-523`). Actual handoff uses
  `recordOrderPickup` (`orders.ts:747` onward) with inventory locks and movements.
  A calendar confirmation must not call that operation.
- Before integration, `src/pages/checkout/return.astro` was a generic test-checkout
  return. The native page now reads scoped payment/appointment context; the
  redirect itself still grants no paid-order authority.
- `src/server/commerce/config.ts:7-23` permits only disabled or Stripe-test
  checkout. Existing purchase admission, host separation, MFA and test-only
  restrictions remain in force. The operator implementation belongs in the
  existing private inventory application.

## Interfaces and Data Contracts

Implementation contract:

- `pickup_sites`: opaque key, approved public label/area, active flag, IANA
  timezone, private directions and revision. Explicitly map allowed
  stock-authority locations to sites; selection never moves stock.
- Availability policy is stored on `pickup_sites`: weekly local-time windows,
  dated overrides or closure, notice/horizon/duration/capacity and revision.
  Validate ordered, non-overlapping windows; reject unsupported overnight
  ranges explicitly rather than guessing.
- `pickup_bookings`: booking/order/site keys, UTC start/end, timezone and
  public-label/cutoff/travel snapshot, revision and separate booking status
  (`scheduled`, `needs_review`). `completed` is derived from the order's actual
  physical pickup, never a calendar mutation. Immutable operations record the
  actor/change history. Enforce one current booking per order; needs-review
  appointments retain capacity until explicitly resolved.
- `GET /api/pickup/context` returns the latest ten browser-owned orders and a
  memory-only CSRF token. Private directions are returned only for a paid,
  scheduled appointment whose end has not passed and whose site remains
  approved for the order. The 30-day order-access limit still applies.
- Scoped `GET /api/pickup/availability?orderId=...&siteKey=...&from=YYYY-MM-DD&days=1`
  accepts at most seven days; returns opaque slot IDs, canonical UTC intervals,
  timezone/offset labels and settings/order/booking/site revisions. Public site
  projections never contain private directions or stock-location keys/counts.
- Scoped `POST /api/pickup/booking` accepts `orderId`, `siteKey`, `date`, `slotId`,
  `expectedOrderRevision`, `expectedBookingRevision` (nullable),
  `expectedSiteRevision`, `expectedSettingsRevision` and UUID `operationId`
  idempotency key. Resolve canonical times/site on the server, lock the order
  and relevant capacity deterministically, validate eligibility, then commit
  the replacement and old-slot release in one transaction.
- Responses: durable booking receipt on success; distinguish invalid input,
  unauthorized context, stale/full slot, revised booking and temporarily
  unavailable service. A conflict refreshes choices without discarding the
  current appointment.
- `POST /api/pickup/help` accepts UUID `operationId`, `orderId` and expected
  order/booking revisions, storing a durable operator-queue flag. It works for
  eligible paid orders even when self-service is disabled or no time is suitable;
  it does not send an email or promise a response time.
- Private `/inventory/locations` combines stock records and mapped pickup-hour
  controls. `/inventory/pickups` focuses on appointments/help and self-service
  enablement. Both reuse `/api/admin/pickup` and existing
  authentication, MFA, membership checks, CSRF, audit and revisions. Mutating
  availability must serialize against booking writers, not merely hide a slot
  in the browser.
- Private endpoints add `sites` (POST), `sites/[key]` (GET/PUT), `settings`
  (POST), `availability` (GET), `booking` (POST) and `access` (POST, immutable
  browser-access revocation). Site updates require the current revision and,
  for affected appointments, exact `impactAck` from a 409 impact review.
  Settings require a revision and explicit enabled value. Admin actors come
  only from the verified MFA session, never JSON.

Buyer access is established by a bounded, same-origin pre-checkout request
before stock can be reserved. A host-only HttpOnly nonce is then bound, as a
hash, only when an order is first created. Losing a checkout response must not
lose the already-established browser access or change the frozen checkout
intent. Existing legacy orders are not claimable merely by supplying their ID.
The existing return URL may list only the latest ten orders bound to that
browser; no access token is placed in a URL or browser storage.

Technical access is limited to 30 days from order creation, with a maximum
28-calendar-day booking window. This is a credential-expiry limit, not a data
deletion or refund policy. Operators can arrange eligible paid orders inside
inventory if the buyer loses same-browser access. No email account or provider
is introduced.

All sites share one operator resource initially. Different-site appointments
include configured travel buffers; increasing buffers/capacity restrictions or
changing hours requires impact review. Confirmation of an hours change must
acknowledge the exact, transactionally recomputed affected set/revisions.
Canonical UTC intervals, not a browser's display text, determine occupancy.

Site timezone, notice, booking window, slot length/capacity, rescheduling cutoff,
travel buffer and allowed fulfillment-stock locations require explicit operator
configuration. Zero notice/buffer/cutoff is allowed only as an explicit setting.
Private arrival instructions stay separate from the public site label/area.

## Security and Privacy

Use server-verified paid-order authority, not a query-string order ID, guessed
reference, browser price, success flag or unsigned checkout redirect.
Same-browser access uses a narrowly scoped, expiring HttpOnly secure
session bound to the checkout/order. Establish it before creating any stock hold,
validate strict same-origin JSON mutations, and keep only hashes server-side.
Cross-device recovery and management-link delivery remain owner decisions.
Never put order access tokens in analytics, referrers, ordinary logs or public
prototype URLs. Apply CSRF and same-origin checks, rate limits and enumeration
resistance. Recheck access after revocation and on every mutation.

Private directions should be released only to the authorized buyer at the
approved point. Do not copy private conversation material into public planning.
Owner approval is required for retention periods, contact collection, notifications
and actual site-access instructions; noindex is not a privacy control.

## Error and Edge Cases

- Payment webhook delayed: show verification pending, with no booking authority.
- Paid but no suitable slot: retain the paid order and show a verified help path;
  neither promise an automatic refund nor silently choose a location/time.
- Last slot taken, stale tab, duplicate submission or concurrent reschedule:
  server revalidates; return a conflict/previous receipt as appropriate.
- Closure or reduced capacity affects appointments: preview impact and retain
  original details/capacity while arranging a replacement.
- Different device timezone, DST gap/fold, midnight, leap day and notice/horizon
  boundaries: server derives canonical UTC intervals from the site's IANA zone;
  never use the prototype's fixed December offset in production.
- Network failure after commit: retry the same idempotency key or fetch the
  authoritative receipt; do not show success based on a button click.
- Customer abandons scheduling: keep a paid-unscheduled queue and recovery route.
  A missed appointment never automatically refunds or decrements physical stock.

## Acceptance Criteria

- [ ] R1-R9 and N1-N4 have approved production tests and owners before launch.
- [ ] Real DB concurrency tests prove the last-slot and atomic-reschedule rules.
- [ ] Authorization tests cover cross-order access, forged redirects, token
  expiry/revocation, CSRF, operator removal and directions disclosure.
- [ ] Timezone tests cover DST and exact notice/horizon boundaries.
- [ ] Browser tests cover booking, rescheduling, unavailable/pending states,
  per-site hours, date exceptions, impact review, keyboard/focus and phone layout.
- [ ] Stock/order snapshots before and after scheduling operations are identical;
  the existing physical pickup test remains authoritative.
- [ ] Operators rehearse outage, paid-unscheduled and changed-hours recovery
  with isolated test data before any customer launch.

The public prototype demonstrates R2-R4, R6-R7 and illustrative R1/R5/R8/R9
boundaries using in-memory examples. It does **not** prove production security,
database concurrency, notification delivery, real availability or DST behavior.

## Open Questions

Owner configuration and decisions required before operational customer launch:

1. Which sites are approved, what may be shown publicly, and when are private
   directions released? Complete the arrival/access walkthrough privately.
2. Which operating timezone, weekly hours, lead time, horizon, slot length, capacity and
   travel buffers are workable? How are simultaneous bookings at different
   sites prevented when one operator serves both?
3. What is the paid-but-no-suitable-time policy? Who resolves it, by when, and
   under what explicitly approved cancellation/refund policy?
4. What changes may customers make, until when, and how are closures, no-shows,
   operator cancellations and urgent requests handled?
5. How are confirmations, reminders, cross-device recovery and help delivered?
   Approve contact channels, retention and any provider costs separately.

Prototype examples only: America/New_York, December 7-20, 2026, 30-minute slots,
one order per slot, 12 hours' notice and 14 days ahead. They are **not opening
hours or business commitments**. Cross-site operator conflicts are not solved
by independent per-site capacity; the production model must reserve the shared
operator/travel interval or enforce non-overlapping service windows.

## Alternatives Considered

- Manual contact only: lowest implementation cost, but retains back-and-forth
  and makes availability hard to discover.
- Select/reserve a slot before payment: reduces the no-slot-after-payment risk,
  but differs from the requested post-checkout flow and needs expiring holds.
  Retain for the owner's policy decision rather than silently changing the brief.
- External booking provider: potentially useful, but adds access, privacy,
  costs and payment/order synchronization decisions. Not selected or enabled.
- Reuse inventory locations as meetup locations: rejected; it conflates
  stock authority with the place a customer collects an already-paid order.

## Rollout and Rollback

Implementation may proceed under the explicit scope agreement above. Real
operating values remain required configuration, not consent by omission.
Delivery sequence:

| ID / size | Owner and exclusive boundary | Depends on | Completion evidence |
|---|---|---|---|
| P1 / S | Integration owner: record scope agreement and safe unconfigured defaults | None | This version; no fixtures/hours seeded, existing live-payment restrictions retained |
| W0 / M | Inventory UI: shared layout, navigation, headers, panels and safe catalog actions | P1 | Authenticated responsive/a11y checks across inventory; DB tests for guarded restore/delete and audit replay |
| W1 / M | Product UI: real Workbench, current-data previews and bounded editable drafts | W0 | Native editor browser tests for shared scrolling, preview, restore/clear/conflicts, saving and publication |
| P2 / M | Backend: domain contracts, additive migration and scoped paid-order access | P1 | `npm run test:db` plus new cross-order, payment, expiry, CSRF and recovery authorization tests on an isolated DB |
| P3 / M | Availability service: per-site IANA rules, exceptions and shared-operator/travel intervals | P2 | Deterministic DST, notice/horizon, closure and cross-site occupancy tests; bounded slot responses without private data |
| P4 / M | Booking service: atomic confirm/reschedule, retries, audit and hours-impact transaction | P3 | `npm run test:db`; simultaneous last-slot, booking-versus-closure, retry and failed-reschedule tests; unchanged order/stock snapshots |
| P5 / M | Customer UI: scoped checkout return and pickup management routes | P4 contracts | `npm run test:e2e -- --grep pickup`; pending, full, conflict, receipt and reschedule flows |
| P6 / M | Operator UI: private hours, closures, impact review and appointment queue | P4 contracts | Same browser selector plus MFA/revocation/revision tests; no silent booking loss |
| P7 / M | Release coordinator: manifests, documentation and staged integration | W1, P5, P6 | `npm run format:check`, `npm run check`, `npm test`, `npm run test:db`, `npm run build:site`, `npm run check:site-artifact`, full `npm run test:e2e`; protected CI and isolated hosted rehearsal |

P5 and P6 may proceed in parallel only after P4 contracts stabilize, with disjoint
UI files and separate validation ports/databases. One integration owner serializes
shared manifests, database migrations, generated artifacts and final gates.

Roll out disabled by default, migrate additively, rehearse only in the existing
approved test boundary, then seek a separate operational launch decision.
If disabled later, stop new self-service bookings without deleting appointments
or disabling paid-order recovery/physical handoff. Preserve the operator queue
and use the approved manual contact procedure. Revert UI/service flags first;
do not drop booking history or alter stock to roll back scheduling.
