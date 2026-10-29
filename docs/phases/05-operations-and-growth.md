# Phase 5: measured growth and justified operations

Entry gate: a stable earlier release and evidence of an actual bottleneck. Commerce-dependent work also requires phase 4. This is an option set, **not an instruction to implement every idea**.

## Outcome and sequence

Improve the local customer experience and owner operation using observed needs, while keeping the site small and maintainable.

Sequence: **P5.1 -> approved subset of (P5.2, P5.3, P5.4)**. P5.3 produces a new specification/gate, not automatic permission for a custom admin build.

## P5.1 - Identify the next real constraint

**Purpose:** choose work based on business evidence.  
**Dependencies:** P2.6, P3.4 or P4.7 depending on the operation being measured. **Scope:** S.  
**Files:** decision register and future scoped improvement brief; aggregate/nonpersonal observations only.

**Acceptance:** document a specific problem, baseline, affected role, desired outcome, cost of doing nothing, and simplest alternative. Examples: unanswered pollination inquiries, manual market-sale stock reconciliation, or frequent content edits.

**Verification:** inspect actual workflow with the owner and review nonpersonal aggregate evidence. No traffic/conversion claim without its measurement method and limitations.

## P5.2 - Improve the managed inventory workflow

**Purpose:** fix concrete stock/production pain without duplicating authority.  
**Dependencies:** P5.1 and P4.7 for inventory. **Scope:** M per approved workflow; split larger changes.  
**Files/systems:** platform configuration, supported app if justified, inventory runbook; bounded adapter code only if genuinely required.

**Acceptance:** approved workflow for counts, receipts, locations, market/POS sales, damage and returns remains auditable. Batch/lot, shelf-life, raw-material recipes or gift-set stock has an explicit selected solution if needed. No independent competing stock ledger.

**Verification:** owner performs the affected workflow using a realistic variant/location example and reconciles it to physical stock. Run any existing targeted adapter tests; inspect platform history/permissions.

## P5.3 - Assess a custom admin only for demonstrated gaps

**Purpose:** avoid turning "inventory management" into unnecessary custom software.  
**Dependencies:** P5.1 and documented failure of suitable managed configuration/apps. **Scope:** S for assessment.  
**Files:** a new approved admin specification/architecture decision before implementation; update existing ownership/contracts.

**Acceptance:** named staff roles, authorization matrix, audit trail, data ownership, security/privacy needs, support budget and measurable gap. Compare a managed app or process change. If custom work wins, write a separate task plan covering managed identity/MFA, server authorization, concurrency, observability and rollback. Never expose an unauthenticated `/admin`.

**Verification:** owner and maintainer approve the gap analysis and operating cost. A mock admin screen alone is not proof of secure inventory administration. No implementation proceeds on vague requirements.

## P5.4 - Improve content and customer journeys

**Purpose:** address observed customer confusion or acquisition opportunities.  
**Dependencies:** P5.1. **Scope:** S-M per experiment.  
**Files:** only the selected page/components/content and its journey tests; do not combine unrelated redesigns.

**Acceptance:** one hypothesis, bounded change, approved claims, accessibility/performance budget and measurement window. Possible work: clearer service questions, useful seasonal information, better real product images, or an owner-editable content workflow. Do not add a blog/newsletter/feed simply because competitors have one.

For shipping or a new product/wholesale channel, also pass the business plan's B5 gate: real eligibility/labels, packaging, breakage/returns, contribution, inventory allocation and owner capacity. Pickup-first confirmation is not permission to enable shipping automatically.

**Verification:** run the affected existing browser selectors; repeat the specific user task and compare against the baseline. Record inconclusive outcomes honestly when traffic is small; use interviews rather than pretending to have significant A/B results.

## Parallel ownership

P5.2 and P5.4 can be parallel only after assigning disjoint platform/code/doc ownership for the specific approved slices. Both often affect product availability or shared content; do not assume independence from these labels alone. One coordinator integrates and edits the shared decision register.

## Ongoing operating cadence

| Cadence | Review |
|---|---|
| During active selling | Fulfillment exceptions, low/incorrect stock, unanswered inquiries |
| Monthly, adjusted to business volume | Contact links, content accuracy, customer friction, accessibility/performance regressions |
| Regular supported upgrade cycle | Dependencies, hosting access, API support windows, provider/app permissions and costs |
| Seasonally | Service capacity, pollination lead times, actual product range, imagery and local information |

**Rollback:** undo the bounded presentation/configuration change without destroying authoritative business records. Any stock-affecting migration has a separate reconciliation and rollback plan.
