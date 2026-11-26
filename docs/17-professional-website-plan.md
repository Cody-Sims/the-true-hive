# Professional website experience: phased implementation

Status: **redesign published; apex/www HTTPS hosting verified; operational activation gated**\
Version: WX3 (WX1/WX2 results retained below)  
Date: 2026-11-14  
Agreement evidence: the owner requested a professional, unique site, a detailed
phased plan, parallel subagents, and a file recording work that needs authorization.
The **Apiary Market** visual direction recorded in this historical WX3 plan
was superseded by the owner's **Golden Apothecary** selection on 2026-11-26.
The requirements/results below remain the November 14 record; the
[current redesign](22-customer-website-redesign-plan.md) retains its platform,
content safety and commerce boundaries.
Integration and shared-file owner: coordinating assistant.

## Objective

Turn the existing foundation into a distinctive, polished, easy-to-browse local
maker website. Help a visitor recognize the brand, discover the right collection,
understand what is and is not offered, and find the next honest step. Optimize
usefulness and voluntary interest, not compulsive time on site.

This is a presentation and product-discovery phase. It does not activate inventory,
payments, services, email, shipping, invoicing, analytics or tax collection.

## Users and use cases

| Visitor | Useful outcome |
|---|---|
| Mobile visitor from social media | Understands the business and reaches a relevant collection without a confusing menu or popup |
| Local shopper | Browses soap, honey and candle directions, distinguishes concepts from available merchandise, and understands pickup readiness |
| Homeowner or grower | Finds distinct colony-removal and pollination information without an implied booking or capability promise |
| Returning visitor | Uses familiar navigation, category links and search rather than remembering individual product names |
| Owner reviewing the work | Can review the actual local experience, inspect evidence and find every blocked decision in one place |

## Requirements

### Functional

| ID | Requirement |
|---|---|
| W1 | Preserve The True Hive name, Madisonville locality, approved Apiary Market direction and existing public routes |
| W2 | Create a coherent editorial visual system: warm paper, deep green, restrained honey/red accents, generous spacing, original illustration and strong typography |
| W3 | Give the homepage a clear product-led hierarchy, a primary collection action, local-pickup explanation, a short story and separate service paths |
| W4 | Keep navigation and essential content usable without JavaScript; do not hide the main navigation behind a JS-only control |
| W5 | Add server-rendered collection filtering by the existing product categories and a bounded search query; represent state in the URL |
| W6 | Show a useful no-match state with a clear reset action; never confuse no matches, no published products and a catalog outage |
| W7 | Improve product cards/details while preserving actual public DTOs, product slugs, concept labels and gated test-checkout behavior |
| W8 | Keep missing contact/social information explicit; do not add a form that claims to send messages without an approved receiving workflow |
| W9 | Preserve all ten prototypes and their planning hub as separate review artifacts |
| W10 | Produce a reviewable local preview, public-page screenshots and an accurate permission/decision ledger |

### Non-functional

| ID | Requirement |
|---|---|
| Q1 | Reflow at 320, 375, 768 and 1440 CSS pixels and at a 200%-zoom-equivalent narrow layout without lost content or horizontal overflow |
| Q2 | Maintain WCAG 2.2 AA goals, semantic landmarks, useful headings, visible keyboard focus and adequately sized targets; primary controls target 44 CSS pixels |
| Q3 | Respect reduced motion; no autoplay, scroll hijacking, compulsory animation, endless feed or obstructive sticky interface |
| Q4 | Keep first-party initial browser JavaScript within the existing 25 KB compressed target and total initial public-page resources within 1 MB |
| Q5 | No new framework, UI library, dependency, CDN font, third-party embed or analytics service is needed for this slice |
| Q6 | Preserve 503/404 behavior, non-indexable showcase mode, safe public artifacts and server-only authorization/payment boundaries |

## Non-goals

- Fake scarcity, fabricated reviews, invented social proof, notification bait,
  concealed prices, preselected marketing consent or guilt-based copy.
- Facebook's identity, copyrighted assets, feed replication or advertising system.
- New payment methods, live charges, Stripe resource mutations, Invoicing/Tax
  implementation, tax registrations or financial/account onboarding.
- New business claims, a public address, service area/radius, opening hours,
  guarantees, health claims, product ingredients, prices or stock.
- New lead storage, newsletter signup, customer accounts, CMS or database schema.
- Remote publication, merge/deployment, production DNS/TLS or paid resources
  without the approval recorded in `REQUIRED_PERMISSIONS.md`. The owner approved
  redesign publication and apex/www hosting on 2026-11-14; inventory, payment,
  email and paid upgrades remain outside that authorization.

## Existing-system constraints

- Astro 7.4.4, strict TypeScript, native Node adapter, existing CSS and lockfile.
- Current frontend: `src/layouts/SiteLayout.astro`, `src/styles/site.css`,
  public pages and small components. Existing code is HTML-first.
- During WX1-WX3, hosted `INVENTORY_ENABLED=false` and
  `CHECKOUT_MODE=disabled` remained unchanged. The later separately approved
  inventory-only rollout is recorded in the inventory specification/runbook;
  it does not activate checkout or replace the public showcase.
- Public showcase records are explicitly conceptual, unpriced and not stock.
  Their original illustrations are not product or farm photographs.
- The selected design and factual boundaries are in
  [the brief](00-project-brief.md), [architecture](03-architecture.md) and
  [owner checklist](16-owner-setup-checklist.md).
- Existing installed skills and private configuration are unrelated local work
  and must not be overwritten, committed or exposed.

## Interfaces and data contracts

- Keep `ProductCard` props (`product`, optional `testCheckoutEnabled`) and
  `ProductArt` props (`image`, optional `alt`, optional `eager`) compatible.
- Use the existing `getCatalog`, `getProduct`, availability and presentation
  services; do not introduce a second product or stock authority.
- Collection controls use GET `/goods?category=<existing category>&q=<query>`.
  Category values are `soap`, `honey`, `candles`, `gifts`, or the all-collection
  default. Search is bounded to 80 characters and does not persist visitor data.
- Invalid filters must have an explicit recovery state; source failures remain
  unavailable rather than becoming an empty result or demo fallback.
- Stable homepage anchors: `#goods`, `#pickup`, `#connect`.
- Preserve recognizable navigation names, breadcrumbs and product URLs.
- Shared style contract: existing `--paper`, `--forest`, `--tomato`, `--ochre`,
  `--line` tokens and `.wrap`, `.eyebrow`, `.button`, `.button-primary`,
  `.text-link`, `.fine-print`, `.notice`, `.product-shelf` remain available.
- Page/component-specific visual work uses scoped styles; only the coordinator
  edits the shared layout and stylesheet.

## Security and privacy

No secrets, private identities, stock counts, SKUs or audit data are added to
public components. Search controls only navigate public GET pages. No cookies,
visitor profiles, recommendation tracking, marketing capture or third-party
requests are added. Existing CSP/nonce, robots, sitemap and artifact policy remain.

Psychology-inspired design means recognition, helpful grouping, visible choices,
progressive disclosure and clear feedback. Real facts and useful process
information replace unverified social proof. Success is completing a visitor's
chosen task, not making it hard to leave.

## Error and edge cases

| Case | Expected outcome |
|---|---|
| JavaScript disabled | Navigation, category/search form, product details and contact disclosures remain usable |
| Filter has no matching products | Clear no-match message and reset link; no claim that physical stock is zero |
| No published products | An honest collection-in-progress state, separate from a filter mismatch |
| Catalog fails | HTTP 503 with the existing unavailable explanation and no fictional fallback |
| Product is missing | HTTP 404 and a useful route back to the collection |
| Query contains markup | Escaped text only; no interpreted HTML or script |
| Query/category is invalid | Bounded validation and explicit reset/recovery; no SQL construction |
| Contact or imagery is unapproved | Clearly disclosed pending contact and labeled original illustration |
| Reduced motion or keyboard-only use | Full access without animation, focus traps or hidden targets |
| Payment mode is disabled | No purchase, reservation or pretend success; no enabled payment UI |

## Acceptance criteria

- [x] Homepage, shared shell, story, services, collection and product pages form
  one coherent visual experience rather than unrelated templates.
- [x] A no-JS visitor can narrow the collection to honey, combine search/category
  and reset an empty result.
- [x] The actual URL, input values, visible results and state messages agree.
- [x] Core pages pass the existing automated accessibility and public-boundary
  gates, plus new discovery regressions.
- [x] Keyboard entry/focus, small-screen and zoom-equivalent layouts, reduced
  motion, local-only requests and resource budgets have inspected evidence.
- [x] Real missing-product and unavailable-database behavior are preserved.
- [x] All ten prototypes and source/planning references remain intact.
- [x] Local preview readiness is checked; screenshots show the built application,
  not a design mockup or an unverified worker summary.
- [x] Every unfinished permission, factual input and publication action is
  recorded as blocked, not silently assumed.

## Open questions and owners

The owner supplies final product/content/photo approvals, genuine contacts and
social URLs, actual SKUs/prices/counts and pickup policy. The owner separately
authorizes public release, DNS, fees, live financial actions and operational
inventory activation. These are not blockers to local visual/discovery work.

Conservative implementation assumptions: retain Apiary Market, use original
illustrations and local fonts, leave all money/data-collection flags off, and
publish no new factual promises. Consequential alternatives remain unapproved.

## Alternatives considered

- **Improve the selected direction:** chosen because identity and stack were
  already approved; it preserves continuity and avoids another concept fleet.
- **Clone a social feed:** rejected; it does not help a small local collection's
  bounded discovery task and would add noise, tracking and deceptive incentives.
- **New UI framework/hosted theme:** not needed; existing semantic Astro/CSS can
  deliver this scope without new dependencies or paid assets.
- **Wait for all business inputs before any design work:** unnecessary; local
  implementation can proceed with honest concepts and existing release gates.

## Rollout and rollback

1. Implement locally with exclusive file owners and unchanged provider flags.
2. Integrate and verify the actual built application.
3. Keep a loopback-only review preview and screenshot evidence for the owner.
4. Stop before public publishing/merge/deployment or production configuration
   changes until approval is recorded.
5. If a reviewed release regresses, restore the previous application revision;
   never roll back or rewrite external inventory/order records for a CSS change.

## Execution order and ownership

Research and contract precede implementation. Then `website-shell`,
`website-story` and `website-catalog` run in parallel. Integration and the review
handoff follow all three.

| ID | Purpose / size | Owner and exclusive paths | Prerequisite | Observable verification |
|---|---|---|---|---|
| `website-research` | Evidence-backed ethical UX / S | Research subagent; read-only external sources | None | Source-backed recommendations, limits and no invented uplift |
| `website-contract` | Plan and permission ledger / S | Coordinator: this document, `REQUIRED_PERMISSIONS.md` | Research + existing approved scope | Complete boundaries, ownership and acceptance coverage |
| `website-shell` | Premium shared visual system / M | Coordinator: `SiteLayout.astro`, `site.css`, small original brand component if needed | Contract | Responsive/focus/motion/landmark and visual checks |
| `website-story` | Homepage/story/service journeys / M | Subagent A: `pages/index.astro`, `about.astro`, `services.astro`, `ContactSection.astro`, `ServiceCards.astro` | Contract | Preserve anchors, catalog failure states and honest service/contact copy |
| `website-catalog` | Collection/product discovery / M | Subagent B: `pages/goods/index.astro`, `goods/[slug].astro`, `ProductCard.astro`, `ProductArt.astro` | Contract + observed failing discovery cases | No-JS filtering/search/reset plus unchanged data/payment contracts |
| `website-integration` | Combined verification / M | Coordinator: browser tests, README and integration fixes | All implementation streams | Format/types, Node/prototype, build/artifact, browser and link gates |
| `website-review-handoff` | Reviewable preview and blockers / S | Coordinator: preview/screenshots and final plan/permission status | Integrated verification | Responsive preview, actual evidence and accurate blocked list |

### Shared resources and safe parallel sets

| Resource | Rule |
|---|---|
| Shared CSS/layout/content contracts | One coordinator owns global styles/layout; workers use existing props and scoped styles |
| Browser tests and generated build output | Coordinator only; no concurrent builds/format-all/browser runners |
| `dist-site/`, test ports 4325/4326 and reports | Serialized integration gates after all worker writes finish |
| Existing private local inventory preview | Do not reuse its port or change its configuration/data |
| New website review preview | Separate loopback port, disabled inventory/checkout, no private runtime environment file |
| Changelog/README/spec/perms | Coordinator only; workers report changes rather than competing edits |
| Git/remote/provider operations | No worker commits, pushes, migrations, secrets, DNS, account or payment changes |

### Verification commands

The coordinator first observes the focused discovery regression against the
unchanged built app. After integration:

```sh
npm run format:check
npm run check
npm run test:site
npm run test:prototypes
npm run build:site
npm run check:site-artifact
npm run test:e2e
npm run check:links
```

The native database suite is not a proxy for visual verification and is not
required for a frontend-only change that does not alter backend/stock contracts.
Any tightly coupled backend change would reopen its targeted database gates.

### Evidence and interpretation

- [NN/g: recognition and recall](https://www.nngroup.com/articles/recognition-and-recall/)
  supports recognizable navigation and visible choices.
- [NN/g: progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/)
  supports keeping secondary detail available without overwhelming the main path.
- [NN/g: scanning](https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/)
  supports clear, front-loaded headings; it does not mandate one universal layout.
- [NN/g: deceptive patterns](https://www.nngroup.com/articles/deceptive-patterns/)
  supports the explicit rejection of misleading engagement mechanics.
- [Baymard: product lists and filtering](https://baymard.com/research/ecommerce-product-lists)
  informs relevant category/filter choices; applying large-retail findings to a
  small maker showcase is an inference, not a measured conversion guarantee.
- [W3C: target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
  and [focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)
  inform the AA interaction checks.
- [W3C: animation from interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)
  is an additional AAA motion consideration, not an AA certification claim.
- [web.dev: performance budgets](https://web.dev/articles/performance-budgets-101)
  supports explicit byte budgets; local lab checks do not prove field Core Web Vitals.

## Implementation checkpoint

### Completed locally

| Phase | Observed outcome |
|---|---|
| Research and contract | Evidence-backed ethical UX principles, scoped WX1 plan and the owner permission ledger |
| Shared visual system | Original inline bee mark, local editorial typography, warm palette, coherent header/footer and responsive controls |
| Parallel page work | Homepage/story/service stream and collection/product stream implemented with disjoint ownership |
| Discovery behavior | URL-based no-JS category/search/reset, distinct no-match states, escaped reflection and invalid-filter HTTP 400 without hiding source HTTP 503 |
| Integration | Combined formatting/types, Node/prototype, native build/artifact, browser and source-link checks passed |
| Review evidence | Eight screenshots of the actual final public build and a measured loopback preview |

Two new discovery tests were observed failing before implementation: filtering
still showed all three cards. After implementation they pass. A separate invalid
filter test reproduced HTTP 200 instead of 400 and was corrected. Screenshot
inspection also caught and corrected a global/scoped card-border and inset
conflict; the final build and browser gates were rerun afterward.

Verification record:

- Formatting and Astro/TypeScript: zero errors, warnings or hints.
- Node contracts: 108 passed; 17 DOM-dependent cases are intentionally handled
  by the browser lane, not counted as Node execution.
- Prototype cases: 26 passed.
- Final Playwright gates: 15 passed, including the isolated admin DOM lane,
  no-JS discovery, negative query/escaping, small-screen/doubled-text layout,
  keyboard/reduced motion, local-only requests and resource budgets.
- Native application artifact policy: 10 public assets checked.
- Source and preserved Pages review: 631 references resolve; the curated Pages
  build contains 92 approved source files plus parser/notices.
- Fresh final screenshot captures: largest initial transfer 62,187 bytes and
  zero first-party browser JavaScript bytes on the captured showcase routes;
  no external origins or sub-24px measured interactive targets were found.

These are local/lab observations, not field Core Web Vitals, a manual
screen-reader certification, owner content approval or operational payment/
inventory readiness.

### Morning review

Open **http://127.0.0.1:4330/** on the machine running the checkout. The detached
review process is loopback-only, uses showcase records and does not load the
private runtime environment file. Inventory, checkout and database credentials
are disabled/empty for this review process.

Screenshots and `metrics.json` are in the session artifact directory
`website-review-2026-11-13/`, not the public application or Pages artifact.
Captures include desktop/mobile home, collection, product, service and story
views. The coordinator inspected the built hero, collection, product and mobile
service views and corrected the observed card integration issue.

### Next phase: blocked release and real operating content

No commit, push, PR, public deployment, provider mutation, DNS change or feature
activation was performed in this phase. The code and requested planning files
are persistent local working-tree changes; previously installed skills/private
configuration are preserved.

The next phase starts with the owner's visual/content review and AP-01 release
authorization, now received on 2026-11-14. Real facts/assets/contact/catalog inputs and operational/payment
gates remain separately blocked in `REQUIRED_PERMISSIONS.md`. New plan/permission
documents have deliberately not been added to the existing public-publishing
allowlist or prototype document registry without that review.

## WX2: continue the unblocked technical work

The owner's 2026-11-14 instruction authorizes continuing implementation and
listing genuine owner-dependent items for morning review. It does not supply
missing business facts or approve financial, DNS, publishing or legal actions.
WX1's saved redesign remains intact while this next local slice is implemented.

### Outcomes and boundaries

1. Make privacy guidance accurately explain the existing URL-based collection
   search, browser history and possible hosting logs without inventing retention
   policy or collecting new information.
2. Provide truthful accessibility information: keyboard/no-JS browsing guidance,
   the WCAG 2.2 AA target, known verification limits and a route to existing
   contact channels. This is not a certification or a new feedback form.
3. Make the skip link transfer actual keyboard focus, improve genuine 404
   recovery and avoid presenting search/error documents as canonical/indexable
   business pages, even when normal catalog indexing is enabled later.
4. Support least-privilege **restricted test keys** alongside existing standard
   test keys. Retain the disabled incident switch, live/organization-key
   rejection and all inventory/database/origin gates. No key is created/read
   or deployed as part of this compatibility change.
5. Progress the previously requested Stripe plan using the now-working
   authenticated sandbox tools; distinguish the planner's hosted-Checkout
   baseline from still-unapproved Invoicing/Tax extensions.

No real invoice, email, tax registration, payment, stock change, provider
configuration, paid upgrade or public release is part of WX2.

### Parallel tasks and owners

| ID | Owner / exclusive files | Dependencies | Observable acceptance |
|---|---|---|---|
| `website-readiness-contract` | Coordinator: plan, permissions and Stripe plan document | Current owner request + inspected WX1 state | Bounded local scope, actual planner evidence and owner decisions distinguished |
| `website-readiness-guidance` | Subagent A: `privacy.astro`, new `accessibility.astro` | Contract + observed failing browser cases | Both pages render; search/history/sensitive-input guidance and honest accessibility limits are present; no collection form |
| `website-readiness-recovery` | Subagent B: `SiteLayout.astro`, `404.astro` | Contract + observed failing browser cases | Skip target receives focus, footer reaches guidance, search/errors omit canonical/indexing, 404 stays 404 with useful routes |
| `stripe-restricted-test-key` | Coordinator: checkout config and its existing contract tests | Actual sandbox planner + failing configuration case | `rk_test_` and `sk_test_` accepted only with full test configuration; live/organization/malformed keys still rejected |
| `website-readiness-verification` | Coordinator: browser tests, test fixture config, shared gates and preview/evidence | All three implementation streams | Combined checks pass; no-JS/mobile/reduced-motion/public boundaries and WX1 journeys remain intact |

The two page streams run in parallel with disjoint files. The coordinator alone
edits tests, shared plan/permissions and configuration, and serializes
builds/browser ports/generated artifacts. No worker commits or provider actions.
The existing negative database browser fixture is deliberately indexable only
to test that error documents still suppress indexing; this is not a deploy flag.

### Observed red before implementation

- Valid restricted test configuration was incorrectly presented as disabled.
- Skip navigation changed the fragment but left the main element inactive.
- `/accessibility` returned 404.
- Privacy guidance did not explain collection search.
- Search results still emitted a canonical link.
- A missing page lacked distinct home/service recovery routes.

### Open owner decisions

The real Invoicing workflow, tax registrations/classifications and fees, final
public policy/copy, contact readiness and publication remain in
`REQUIRED_PERMISSIONS.md`. They do not prevent the local technical changes above.
### WX2 completion checkpoint

The continued local slice is implemented and integrated:

- Privacy now explains public search URLs, browser history and possible hosting
  logs without inventing retention policy or a new collection workflow.
- `/accessibility` supplies practical keyboard/no-JS/zoom/motion guidance,
  accurate limits and an existing-contact route, not a certification.
- Skip navigation transfers actual focus into `main`; genuine 404s retain their
  status and offer distinct home/collection/service recovery.
- Search/error documents suppress canonical/share URLs and indexing. This was
  verified against the deliberately indexable unavailable-database test fixture
  as well as ordinary showcase pages.
- Restricted test-key compatibility is implemented without accepting live or
  organization keys or changing disabled defaults.
- The authenticated sandbox planner confirmed hosted web Checkout. The
  [Payments/Invoicing/Tax plan](18-stripe-payments-invoicing-tax-plan.md) distinguishes
  that real tool result from owner-gated financial extensions.

Five new browser cases and the restricted-key case were observed failing before
implementation, then passed. Final combined checks: zero formatting/type issues,
109 Node cases passed (17 DOM-dependent cases run in the browser lane), 26
prototype cases, native build/artifact policy and all 20 Playwright gates.
Readiness flows run with JavaScript disabled; axe coverage now includes privacy,
accessibility and the genuine missing-page response. The curated studio and its
631 references still pass, with 92 approved source files unchanged in scope.

The refreshed review remains **http://127.0.0.1:4330/**. Five additional screenshots
and `metrics.json` are in session artifacts `website-review-2026-11-14/`.
The observed maximum initial transfer was 62,263 bytes with zero initial browser
JavaScript on those captures, local origins only, correct 200/404 statuses and no
horizontal overflow. The coordinator inspected the mobile accessibility and
desktop recovery layouts. These remain lab observations, not field or
assistive-device certification.

No code was committed, pushed or publicly deployed. No private credentials,
physical stock, payment/invoice/tax/account resources, DNS or paid settings were
changed. A sandbox planning guide was generated/accepted; it is not operational
or financial activation. Remaining owner decisions are listed rather than used
to halt independent local technical work.

## WX3: first-party brand-sharing readiness

The final local readiness slice gives normal public pages a consistent branded
preview when their links are shared. It also replaces the prototype favicon
with the original bee/hex identity already used in the website header.

- Original editable SVG artwork and a rendered 1200-by-630 PNG live in
  `src/assets/`. The illustration uses existing local fonts, colors, tagline
  and verified locality; it is not a product/farm photograph or availability
  claim.
- Open Graph and large-image card metadata point at the same first-party,
  built PNG, with explicit dimensions and a descriptive alternative. There
  is no social SDK, remote embed, tracking, paid asset or new dependency.
- Search/error documents continue to omit share URLs/images and canonical
  URLs. Showcase mode remains non-indexable.
- `tests/browser/website-sharing.spec.ts` verifies the actual fetched PNG
  signature/dimensions, matching metadata, original favicon and search/404
  exclusions. The missing metadata was observed failing before implementation;
  the two focused cases now pass.

The coordinator owns this small shared-layout/assets/test change. No further
agent fleet, provider action or publication is required.

### WX3 completion checkpoint

The final combined gates passed against the current source: formatting,
Astro/TypeScript (125 files, no errors/warnings/hints), 109 Node cases with
17 DOM-dependent cases deferred to the browser lane, 26 prototype cases,
native build and artifact policy (11 public assets), all 22 Playwright cases,
and source/studio link checks (631 references). The preserved studio still
builds 92 approved source files; publishing policy and dependency manifests
remain unchanged.

Full command output is retained privately in session artifact
`website-wx3-final-gates.log`. The original PNG artwork was visually inspected.
The refreshed **http://127.0.0.1:4330/** preview responds successfully with
inventory/checkout disabled and no private runtime file loaded.

Five current no-JS desktop/mobile captures and `metrics.json` are in session
artifact directory `website-sharing-review-2026-11-14/`. They confirm expected
200/404 statuses, no horizontal overflow, first-party origins only and zero
initial script bytes. Maximum initial encoded resource-body size was 58,112
bytes; this is a local measurement, not a field-performance or certification
claim. The actual share-image URL on the refreshed preview also returned 200.

All authorized local requirements for WX1-WX3 are complete. Final source,
plans, changelog, assets and permission ledger are saved locally. No commit,
push, public deployment, DNS change or operational/financial activation was
performed. The separately owner-gated rows in `REQUIRED_PERMISSIONS.md` remain
deferred as requested; this checkpoint is not a production-readiness claim.

## Approved publication and apex hosting - 2026-11-14

The owner approved this redesign and publishing it and requested proper hosting
at `thetruehive.com`. Deliver through the existing protected `main` branch,
three mandatory CI contexts and the existing Render native service. Reuse the
current task branch without rewriting shared history; exclude unrelated skills,
private settings and generated review artifacts.

Domain work is limited to the approved apex/www site, HTTPS/canonical redirects
and the existing service's canonical origin. Preserve Porkbun mail/TXT records,
`preview.thetruehive.com`, unrelated domains and inventory activation gates.
At the start of this work, public DNS still resolved the apex/www to Porkbun's
old link redirect. The provider target was verified before the website-record
cutover; the completed result is recorded below.

### Publication and hosting completion checkpoint

- PR #6 merged as `9fffa65e1ff423a9417da1d3cff7440a892d8547` after all
  three mandatory checks passed; the main-branch checks also passed. A bounded
  independent source review approved the redesign before publication.
- Render's actual service UI identified that exact revision as **Live**.
  **https://thetruehive.com/** now serves the approved redesign with strict
  certificate validation; `www` redirects to the apex and preserves paths and
  queries. HTTP upgrades to HTTPS.
- Only the root ALIAS answer was updated and one `www` CNAME added, both to the
  existing Render hostname. Private before/after snapshots prove the seven
  other original DNS records were preserved. The separate Pages preview
  remains healthy over HTTPS.
- Real production checks covered five no-JS desktop/mobile routes, real filter
  results, actual skip-target focus, genuine 404s, canonical/robots metadata,
  no external browser origins and a byte-for-byte match of the served share
  image to the committed asset. The mobile collection was visually inspected.
- Production readiness still reports deliberate showcase mode with inventory
  and checkout disabled. No stock, provider key, invoice, tax setting, email,
  database record, plan upgrade or inventory hostname was changed.

Current public screenshots and `verification.json` are in private session
artifact directory `website-production-2026-11-14/`. The public
[hosting/rollback runbook](14-development-and-operations.md#apexwww-hosting-and-rollback)
and permission ledger now distinguish completed publication from remaining
real-content and operational activation gates.
