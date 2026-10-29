# Phase 0: discovery, evidence, and design selection

Source: [project specification](../00-project-brief.md).  
Status: research and prototype artifacts supplied; **owner approvals and customer review remain open**.

## Outcome and gate

Agree what the first release actually says and does, select an art direction, and approve a small production architecture. Written plans/prototypes are inputs to this gate, not evidence that the business decisions have already been made.

Sequence: **P0.1 -> P0.2 -> P0.3 -> P0.4**. Tasks can overlap in conversation, but changes to shared approval/decision documents are serialized.

## P0.1 - Confirm the business boundaries

**Purpose:** prevent an attractive page from promising services, coverage, or stock the business cannot provide.  
**Dependencies:** none. **Scope:** S.  
**Files:** `docs/00-project-brief.md`, `docs/05-decision-register.md`.

**Acceptance:** confirm the product/local-sales and pickup-first priorities, existing soap/apiary baseline, allocated next-harvest boundary, planned-service limits, private/public address choice and initial no-live-checkout scope. The partner workbook assigns unresolved decisions an owner/gate; research is separate from assumptions.

**Verification:** owner walkthrough of those two documents against the [market evidence](../01-market-and-design-research.md); record approval/date in the decision register. This is a business inspection, not a command that can establish capability.

## P0.2 - Assemble approved business content

**Purpose:** provide real content/contact details before production design is finalized.  
**Dependencies:** P0.1. **Scope:** S.  
**Files:** future `docs/approvals/business-content.md`, approved original assets under `src/assets/` when the application exists. Do not copy private account information into public documentation.

**Acceptance:** correct contacts/profile URLs, domain, real soap formulas/labels/photos/prices, approved story/service wording, image rights and mock-vs-real status. No public retail honey/pickup promise is invented. The [content checklist](../02-experience-and-content.md#content-approval-checklist) has no unexplained blockers.

**Verification:** open each real contact/social destination, rehearse phone/email on a mobile device, and inspect image ownership/permission. The owner approves facts and claims.

## P0.3 - Select a prototype through task-based review

**Purpose:** choose an experience based on local journeys, not just color preference.  
**Dependencies:** P0.1 and enough P0.2 content to make evaluation realistic. **Scope:** M.  
**Files:** `docs/designs/01-meadow-and-amber.md`, `02-fieldwork.md`, `03-hive-and-hearth.md`; future `docs/approvals/design-selection.md`.

**Acceptance:** owners inspect all ten directions, shortlist 2-3, and test consistent product/pickup/cart-honesty and secondary service tasks on a rotated subset. Record confusion and choose one direction. Do not fatigue each participant with ten complete flows; a blend has explicit scope, not an unlimited eleventh design.

**Verification:** from the project root, `open prototypes/index.html`; use the [evaluation rubric](../designs/01-meadow-and-amber.md#shared-evaluation-rubric). Review at 375 px and desktop, keyboard-only, and 200% zoom. Record this as formative research, not a conversion experiment.

## P0.4 - Approve delivery constraints

**Purpose:** authorize the first build and establish who maintains it.  
**Dependencies:** P0.1-P0.3. **Scope:** S.  
**Files:** `docs/03-architecture.md`, `docs/04-data-and-integrations.md`, `docs/05-decision-register.md`.

**Acceptance:** approve framework/content/hosting ownership, performance/accessibility, production exclusions for the private hub, phase 1-2 scope and the integrated future-store target. Business readiness B0-B2 and partner questions remain separate gates. Exact production dependencies are selected at bootstrap.

**Verification:** inspect each decision's status and named owner. Re-estimate phase 1-2 using the approved design/content; do not carry a placeholder estimate forward as a promise.

## Parallel ownership

Owner content gathering and researcher source refresh may happen concurrently because gathering does not mutate production files. Assign a single editor to the approval/decision documents. No two people edit the same prototype or shared style file concurrently.

## Exit checklist

- [ ] First-release scope, real business facts, service limitations and locality approved.
- [ ] A design and its mobile behavior selected.
- [ ] Required contact/social destinations supplied.
- [ ] Asset permissions and factual claims approved.
- [ ] Framework, ownership, budget envelope and maintenance responsibilities accepted.

**Rollback:** revise the plan or concept before implementing. There is no live site or customer data to migrate.
