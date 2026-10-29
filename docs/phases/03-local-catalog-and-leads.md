# Phase 3: real local catalog and dependable inquiries

Source: [experience](../02-experience-and-content.md) and [data contracts](../04-data-and-integrations.md).  
Entry gate: phase 2 is live and the owner has a demonstrated need for richer catalog/service information or structured inquiries.

## Outcome and order

Replace selected concepts with real approved product information, deepen service content where useful, and make local inquiry handling reliable. **No online checkout and no invented inventory precision.**

Sequence: **P3.1 and P3.2 may run in parallel -> P3.3 -> P3.4**. Approve real product facts and service text before the parallel wave.

## P3.1 - Publish approved real catalog records

**Purpose:** help local customers understand actual goods without simulating a store.  
**Dependencies:** P2.6 and approved product details/images. **Scope:** M.  
**Files owned:** `src/content/products.ts`, `src/catalog/` types/mapping, product detail routes under `src/pages/goods/`, product components, catalog-only unit/browser tests.  
**No-edit boundary:** service content/routes, shared header/footer and global configuration without coordinator approval.

**Acceptance:** start with real approved soap records, stable keys/slugs, actual ingredients/formats/claims/photos and inquiry mode. Unknown stock says to ask; optional prices are approved and current. Concept data is removed only for real products. No retail honey offer/preorder without approved unallocated received stock; future harvest is not inventory.

**Verification:** introduce the targeted unit runner only if real mapping/validation now exists; run `npm run test:unit -- tests/unit/catalog.test.ts` and `npm run test:e2e -- tests/e2e/catalog.spec.ts`. Inspect that concept and real-product states cannot be confused and product URLs are useful/unique.

## P3.2 - Publish useful service detail pages

**Purpose:** answer distinct homeowner and farmer questions, not create thin SEO doorway pages.  
**Dependencies:** P2.6 and owner-approved scope/process. **Scope:** M.  
**Files owned:** `src/pages/services/removal.astro`, `pollination.astro`, service-detail components/assets, service-detail-only tests.  
**No-edit boundary:** product/catalog code, global navigation, deployment/runner configuration.

**Acceptance:** practical assessment/process/limitations, actual coverage, privacy-conscious inquiry guidance, no universal pollination rates, no unqualified structural-removal or yield guarantees. Preserve/redirect relevant existing anchors if navigation changes.

**Verification:** `npm run test:e2e -- tests/e2e/service-details.spec.ts`; owner checks content; a homeowner and grower each find the appropriate next step.

## P3.3 - Add one reliable inquiry workflow

**Purpose:** structure inquiries only when the owner can operate the receiving process.  
**Dependencies:** P3.1/P3.2, receiving owner, retention policy, and a provider/runtime decision. **Scope:** M.  
**Files:** contact form/section, selected hosted-provider configuration **or** `src/pages/api/inquiries.ts` and `src/server/leads/`; form tests and operations runbook. Do not implement both paths.

**Acceptance:** minimal bounded fields, one valid reply method, no initial uploads, clear privacy notice, server-side/provider validation and abuse controls. Show receipt only after durable provider acceptance. Preserve input and surface rejection/provider failure; inquiries are not bookings. Direct phone/email remains available.

**Verification:** `npm run test:e2e -- tests/e2e/inquiry.spec.ts`; if site-owned logic exists, run its targeted unit tests in the same relevant runner invocation. Exercise invalid data, spam limit, provider error, duplicate/uncertain receipt, keyboard use and actual delivery to the owner's inbox/workflow.

## P3.4 - Make publishing and triage sustainable

**Purpose:** ensure the catalog/inbox does not go stale after launch.  
**Dependencies:** P3.3. **Scope:** S.  
**Files:** content/operations documentation, decision-register updates, necessary shared-navigation/measurement changes.

**Acceptance:** owner rehearses product update, temporary unavailability wording, inquiry triage and retention/deletion. Decide whether repo publishing still works; a CMS is a separate approved slice only if a real bottleneck exists. Establish a modest review cadence and baseline inquiry quality; never put customer data in analytics.

**Verification:** owner completes an update in preview and a test inquiry from arrival through reply/deletion; run the catalog/service/inquiry browser selectors together after integration. Review unanswered inquiries and content ownership.

## Parallel boundaries and risks

Only P3.1/P3.2 are parallel. Freeze URL/nav requirements first; the coordinator updates shared navigation after both finish. Any dependency/tooling change needs one package/lockfile owner and serial integration.

The largest risks are implying live stock with manual content and collecting inquiries without operating the inbox. If real availability cannot be maintained, keep inquiry wording. If the form cannot deliver reliably, disable submission with a visible explanation and retain real contact links rather than reporting false success.

**Rollback:** revert catalog presentation to accurate prior content. Disable a broken form explicitly; preserve already received records and follow the approved retention policy.
