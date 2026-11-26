# Reusable components and repository cleanup

Status: both scoped implementation waves are complete and locally verified.
Scope requested by the owner on November 15, 2026.
Baseline: `main` at `a1f36e0050f18fc4ae0be7bb3a0831e6bc0833a0`.
Follow-up baseline: `main` at `da79fa5d73345d21f3eb6466470c1d6215dfc4d1`.

## Objective and boundaries

Make repeated website UI easier to maintain without changing its content,
appearance, accessibility, routes, inventory authority or checkout behavior.
Remove code only after reference, reachability and runtime-entrypoint evidence
agree that it is obsolete.

The public storefront and private inventory share an application, not an
authorization boundary. Reuse presentation without moving private stock, SKUs,
audit data or privileged actions into public components.

## Component catalog

Paths below are relative to `src/components/`, except the two layouts.
Existing components should be reused before introducing another abstraction.

| Component | State | Responsibility and consumers | Preserve |
|---|---|---|---|
| `layouts/SiteLayout.astro` | Existing | Shared public navigation, footer, metadata and script registration across public pages | Canonical/noindex rules, CSP nonce, skip target, cart hooks and active navigation |
| `admin/InventoryNavbar.astro` | Existing | One private navbar through `layouts/AdminLayout.astro`, including nested editor routes | Identical responsive shell, active section, account dismissal and signed sign-out |
| `admin/AdminPageHeader.astro` | Existing | Inventory page title and `page-actions` slot | One H1, keyboard-reachable actions and hidden print chrome |
| `PageIntro.astro` | Implemented in this wave | Eyebrow, heading and description on privacy, accessibility and checkout recovery pages | Slot-rendered heading markup, plain-text description, IDs, labels, classes and direct-child CSS relationships |
| `ActionLink.astro` | Implemented in this wave | Styled navigation/recovery anchors on the same informational and checkout pages | Real anchors, existing destinations/classes, optional decorative arrow; recovery links remain arrow-free |
| `admin/AdminSelect.astro` | Existing | Inventory filters, product fields and adjustment direction | Native keyboard/touch picker, names/values, required/disabled/invalid states and high-contrast fallback |
| `NoticePanel.astro` | Implemented in the second wave | Shared catalog empty/unavailable/filter-error presentation on home and collection pages | Pages retain HTTP status, failure precedence and filtering; wrapper preserves heading level, status role, error IDs and scoped classes |
| `ProductCard.astro` | Existing | Product identity and collection presentation on home and goods pages | Concept/publication boundaries, separate image/title links and valid purchase eligibility |
| `ProductArt.astro` | Existing | Product photo or illustration in cards, detail and inventory preview | First-party media boundary, alt text, dimensions and eager/lazy loading choice |
| `ProductPrices.astro` + `StockNotice.astro` | Existing | Full/compact price and projected availability presentation | Canonical price wording, unavailable states and stock text, not color alone |
| `PickupLocation.astro` | Existing | Pickup notice on collection and cart | Semantic address, arrangement-only guidance, no invented shipping or opening hours |
| `ServiceCards.astro` | Existing | Home summary and detailed services | Fragment IDs, disclosure behavior, safety wording and telephone/exploration destinations |
| `ContactSection.astro` + `InquiryForm.astro` | Existing composition | Public contact channels and visitor-sent inquiry drafts | Validation/status hooks and no-JavaScript email fallback; no new submission backend |
| `ProductIngredients.astro` | Existing | Ordered public ingredient display | Escaped text and omission when no approved ingredient data exists |
| `ProductProfile.astro` | Added by the Golden public rollout | Catalog-backed ingredient/format counts and starting prices in public soap cards/details | No fabricated sensory scores; absent data remains unlisted, and private editor previews do not gain this panel |
| `FaqSection.astro` | Added by the Golden public rollout | Shared native disclosure questions on home and services | Factual pickup/service/image guidance, keyboard controls and no claims of laboratory-tested soap ratings |
| `admin/FormFeedback.astro` | Existing | Mutation status, retry, receipt and authoritative-record presentation | Frozen operation identity, separate original receipt/current record, explicit conflict review |
| `admin/CountForm.astro` | Cleaned in the second wave | Default correction and compact workspace receiving; obsolete inline mode removed | Server receipts, revision checks, audited reasons and allocation-safe reductions |
| `admin/Pagination.astro` | Existing | Bounded product/order paging | Encoded query values, preserved inventory filters and result-count semantics |

`SiteLayout` already centralizes the public header/footer; a second public
navbar implementation would duplicate it. Extract further shell subcomponents
only when independent reuse or maintenance warrants it. Do not force the public
and inventory shells into one component full of authentication flags.

The Golden public rollout uses `client/site-header.ts` for appearance and mobile
menu enhancement and `styles/golden.css` for the public-only theme namespace.
`domain/catalog-presentation.ts` prioritizes genuinely stocked products without
changing catalog records or treating missing stock as available. The server
retains price, publication and stock authority; editor and archived study
surfaces remain separate.

## First implementation wave

Execution order: passing baseline, then `UI-01` and `GC-01` in parallel;
`DOC-01` records their findings; `GATE-01` integrates and verifies the result.
Sizes are bounded small/medium implementation slices, not estimates of runtime.

| Task | Owner and exclusive boundary | Observable outcome |
|---|---|---|
| `UI-01` Public UI extraction (M) | Public UI stream: `PageIntro`, `ActionLink`, privacy/accessibility, both checkout recovery pages and their focused render tests | Several real pages use each component; text, links, headings, metadata and CSS contracts remain unchanged; `node --test tests/site/public-components.test.ts` passes |
| `GC-01` Obsolete inventory list removal (S) | Inventory cleanup stream: retired list component and only its dedicated fixtures/tests | No route/import can reach the removed list; current shelves, inspector and stock-update tests remain; full tests/build required after integration |
| `DOC-01` Catalog, plan and current documentation (S) | Integration owner: this document, README, current inventory runbook and changelog | Reuse inventory, retention decisions, follow-up work and validation are discoverable; existing publication-link checks pass without changing the allowlist |
| `GATE-01` Integrated verification (M) | Integration owner, after both source streams and documentation | Full suites/build and required CI below pass on the combined tree |

Workers do not stage/commit, install dependencies, run shared builds, start
competing browser servers or edit the other stream's files. The integration
owner serializes generated artifacts and final browser validation.

## Second implementation wave

The owner requested implementation of the concrete follow-up items and opening
the working branch in VS Code Insiders. This wave keeps the newer image-led
storefront intact and does not change stock, checkout or publication policies.

| Task | Boundary | Completion gate |
|---|---|---|
| `GC-02` Legacy inline stock cleanup | Remove only the runtime-unreachable inline `CountForm` branch, its client/import and secondary quantity-display metadata; retain both live form modes and the default half of mixed tests | Re-audited references, focused live stock/retry tests, full suites and build |
| `UI-02` Shared notice presentation | Extract current home/collection empty, unavailable and filter-error presentation without moving page-owned catalog/filter/HTTP decisions | Before/after render contracts and current storefront/browser checks |
| `DOC-02` Close the maintenance ledger | Record completed removals, actual component consumers and retained historical artifacts | Catalog agrees with the implementation; publication allowlist unchanged |
| `GATE-02` Verify and open the implementation | Serialize final application/browser/build checks and use an isolated native test database | Full checks pass; actual implementation workspace opens in VS Code Insiders |

`GC-02` and `UI-02` have disjoint write boundaries and may run in parallel.
The later evidence-led maintenance step remains an ongoing process, not a
promise that every unused-looking export or generated artifact is removable.

Verification for the second wave includes the full application/prototype
suites, native PostgreSQL suite, production build/artifact, built-browser
journeys, source formatting/types and source/Pages publication links. The
implementation is ready for the protected release process; deployment still
requires the release checks below.

## Dead-code evidence ledger

The inventory audit searched production imports and routes, repository-wide
references, test fixtures, script registration and publication configuration.
Runtime-unused is not the same as untested.

| Candidate | Decision | Evidence and constraints |
|---|---|---|
| `admin/InventoryProductList.astro` | Removed in the first wave | Before removal, all three references were dedicated fixtures in `tests/site/admin-presentation.test.ts`; no production import. `/inventory/products` renders `InventoryWorkspace`, and `/inventory/` redirects there. The old list is not a framework route, has no registration script and is not published by the review allowlist. |
| Old list's `stockLocations` fixture and three dedicated tests | Removed with the list | They rendered the retired component. Default correction, compact receiving, live workspace, conflict and retry tests remain. A lower test count from these named retired cases is intentional, not evidence that replacement coverage can be removed. |
| `CountForm`'s `inline` branch and `.stock-count` styles | Removed in the second wave | Re-audit found only two production callers: the editor uses default mode and `InventoryWorkspace` uses compact mode. Removed only inline-specific fixtures/tests and the inline iteration of the mixed stale-count test; its default iteration and assertions remain. |
| `src/client/stock-controls.ts` | Removed with its target cluster | Removed the module and `AdminLayout` import together after proving only the unreachable inline branch emitted its targets. The current receiving/validation/retry client, `admin.ts`, is unchanged. |
| `Quantities`' `compact` prop and `data-secondary-quantity` attributes | Removed with inline display | These served only the retired CSS. `data-level`, variant/location identifiers and quantity hooks used by authoritative refresh remain. |
| Preserved design prototypes and Pages scripts | Retain | The original ten directions and subsequently approved concepts are explicit review artifacts, with package commands, CI entrypoints and a publication allowlist. Similar-looking designs are intentional, not abandoned production UI. |
| `migrations/*.sql` | Retain unchanged | The migration runner discovers filenames and verifies recorded checksums. Absence of static imports is irrelevant. Use forward migrations for schema changes. |
| `dist/`, `dist-site/`, `.astro/`, `test-results/` | Generated/local artifacts, not dead source | Respect active servers, shared validation and the Pages builder's ownership marker. Do not delete another task's output or broadly remove workspace directories. |
| Unused-looking exports or CSS | Investigate before removal | Check dynamic imports, attributes/events, framework conventions and public/package consumers. No deletion based solely on a warning or one empty search. |

Retired names in this ledger are historical documentation, not executable
references. Keep that distinction when checking the final removal diff.

## Follow-up execution plan

1. **Verify and deliver this wave.** Review the two source streams together,
   keep the public and private behavior boundaries intact, and pass the gates
   below before release.
2. **Legacy inline stock cluster: implemented in the second wave.** Re-audited
   at the follow-up baseline and removed only the `inline` branch, its client
   import/module and quantity-display metadata. Preserved the default-mode half
   of mixed tests, mutation serialization, allocation protection and receiving.
   The integrated full-suite/build gates still apply.
3. **Shared notices: implemented in the second wave.** Characterized unavailable,
   empty, invalid-filter and no-match responses before replacing the current
   home/collection wrappers. `NoticePanel` shares markup, not catalog/error
   decisions, and preserves the newer image-led storefront.
4. **Current operational documentation: reconciled in these waves.** Corrected
   stale README/runbook descriptions and updated this catalog and removal ledger.
   Accepted historical specs and design records remain history rather than
   being rewritten to look like current implementation.
5. **Repeat evidence-led cleanup on a bounded area.** Record candidate,
   references, runtime reachability, side effects, retention decision and
   verification. Add an analysis dependency only if existing tools cannot
   answer a demonstrated question; do not install a linter merely to generate
   speculative deletion work.

## Validation and release gates

Baseline and final checks use the repository's existing tooling:

```sh
npm test
npm run format:check
npm run check
npm run build:site
npm run check:site-artifact
npm run test:e2e
```

Focused render tests supplement, not replace, the existing customer journeys,
inventory DOM/retry/accessibility gate and printed-label checks. Dead-code
removal requires the full test suite and build after deletion, not just an
empty reference search.

Database behavior is not changed in this wave. The protected
`inventory-checks` CI job must still pass its native PostgreSQL suite.
`verify-and-build` must retain the preserved-design/source-link/Pages gates,
and `site-checks` must pass on both the PR and merged release. No protection
bypass, live stock mutation, provider-setting change or migration is part of
this cleanup.

Acceptance criteria:

- Multiple public pages consume each new component without content or behavior changes.
- Retired inventory markup has no executable consumer; only dedicated obsolete tests are removed.
- Current stock selection, receiving, conflicts, retries, public cart and checkout recovery remain covered.
- The component catalog distinguishes existing, newly extracted and proposed work.
- Follow-up deletions have named boundaries, prerequisites and verification; preserved artifacts remain intact.
- The combined final tree passes the required gates before deployment.

Rollback is an application-code revert through the same protected release
process. Never restore an old inventory database to undo UI cleanup.
