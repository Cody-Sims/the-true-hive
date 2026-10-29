# Phase 1: engineering foundation

Source: [specification](../00-project-brief.md), especially N5-N7.  
Entry gate: P0.4 approved. **This phase is future work; no framework app is included in the planning package.**

## Outcome and execution order

Create one reproducible production application and a preview deployment. No checkout, database, custom admin, or runtime API.

Sequence: **P1.1 -> P1.2 -> (P1.3 || P1.4) -> P1.5**.

The commands below are script contracts to create, not scripts available in the prototype folder.

**Platform branch:** the component/build tasks below describe the custom Astro path. If the owner selects a native Shopify website for the first production release, replace framework-specific setup with a scoped theme/sections/content/configuration plan at P0.4, preserving the same accessibility, SEO, ownership and release gates. Do not build an unnecessary second Astro site alongside a native primary-domain site.

## P1.1 - Bootstrap the supported application

**Purpose:** establish a small, maintainable build rather than promoting prototype markup directly.  
**Dependencies:** P0.4. **Scope:** S.  
**Files:** existing prototype package/lockfile reconciled with the selected production setup; framework config, `tsconfig.json`, runtime-version file, `.gitignore` and minimal production entry.

**Acceptance:** the approved production platform/framework is recorded; for a custom Astro/TypeScript build, pin supported compatible releases and implement actual check/build scripts. Do not mistake the existing native prototype tests/parser for the production app. Preserve review tooling deliberately; no fake business links or secrets.

**Verification:** `npm ci && npm run check && npm run build` from a clean checkout. Inspect the built artifact and record selected versions in the architecture document.

## P1.2 - Establish the browser gate and component contracts

**Purpose:** make responsive/accessibility regressions observable before visual work grows.  
**Dependencies:** P1.1. **Scope:** S.  
**Files:** browser-runner configuration, `tests/e2e/foundation.spec.ts`, package/lockfile updates, future `docs/development.md`.

**Acceptance:** `npm run test:e2e -- tests/e2e/foundation.spec.ts` opens the built/preview site and asserts real document landmarks/identity. Freeze simple prop/token contracts for the parallel tasks. Configure a minimal accessibility scan and viewport checks; no empty/vacuous green suite.

**Verification:** run that exact selector; intentionally break its identity assertion once to establish that it fails, then restore it. Inspect the runner's chosen origin and preview-server lifecycle.

## P1.3 - Encode approved content

**Purpose:** keep business facts and provisional goods separate from layout.  
**Dependencies:** P1.2 and approved P0.2 inputs. **Scope:** S.  
**Files owned:** `src/content/business.ts`, `services.ts`, `showcase.ts`, `src/catalog/types.ts`.  
**No-edit boundary:** styles, layouts, test configuration, lockfile.

**Acceptance:** typed content carries the approved locality/contact/social values, distinct service categories, and showcase-only goods without price/stock fields. Unknowns are explicit, not guessed. Keys are stable and vendor-independent.

**Verification:** `npm run check`; inspect the records against `docs/approvals/business-content.md` and the [data model](../04-data-and-integrations.md). Production promotion later rejects required missing values.

## P1.4 - Establish visual tokens and semantic layout

**Purpose:** implement the chosen visual language once.  
**Dependencies:** P1.2 and selected P0.3 design. **Scope:** S.  
**Files owned:** `src/styles/tokens.css`, `global.css`, `src/layouts/SiteLayout.astro`, layout-only assets.  
**No-edit boundary:** content/catalog files, package/lockfile, runner configuration.

**Acceptance:** responsive type/spacing/color tokens, semantic layout, visible focus, skip link, sensible line lengths, reduced motion, and dimensioned image conventions exist. Core layout needs no client JavaScript.

**Verification:** `npm run check && npm run build`; inspect a layout preview at 320/375/768/1440 px, keyboard-only and 200% zoom; measure actual token contrast.

## P1.5 - Integrate and deploy a controlled preview

**Purpose:** prove the combined foundation can be delivered and restored.  
**Dependencies:** P1.3 and P1.4. **Scope:** S.  
**Files:** `src/pages/index.astro`, deployment/CI configuration, future `docs/operations.md`.

**Acceptance:** coherent content/layout, controlled preview, TLS/domain ownership, MFA, secrets and rollback. Internal hub, owner facts, demo fixtures and node modules are not copied as public site output. Hosted planning access is protected; noindex alone is insufficient. Static deployment has no pretend backend.

**Verification:** `npm run check && npm run build`, then `npm run test:e2e -- tests/e2e/foundation.spec.ts`; inspect the actual preview URL and rehearse redeploying a known-good build.

## Safe parallel set

After P1.2, **P1.3 and P1.4** have disjoint writes. A coordinator owns `index.astro`, shared configuration and final integration in P1.5. If the agreed props change, pause and serialize the contract change before continuing.

## Exit / rollback

Exit with a reproducible build, meaningful browser gate, approved content source, selected design tokens and functioning preview. Restore the earlier static deployment if integration fails. Do not buy or introduce runtime infrastructure for unapproved later phases.
