# Decisions, unknowns, and risks

Use this register when resuming the project. "Recommended" does not mean the owner approved implementation.

## Confirmed facts

| ID | Fact | Source |
|---|---|---|
| F1 | Business name is The True Hive | Owner's original request |
| F2 | Local market is Madisonville, Tennessee | Owner's follow-up |
| F3 | Initial focus is landing page with Facebook/Instagram connections | Owner's original request |
| F4 | Planned services include hive removal and farm pollination | Owner's original request; exact operational scope still unknown |
| F5 | Planned goods include honey/honey-related products, soaps and candles; mock information is acceptable | Owner's original request |
| F6 | Future store is part of the website, connected to properly handled inventory | Owner's expansion request; custom admin not mandated |
| F7 | Ten total designs, coordinated shop flows and a UI for plans/requirements/business roadmap | Owner's expansion requests |
| F8 | Product/local sales lead; local pickup first and shipping later; broad style exploration | Owner's design/fulfillment answers |
| F9 | Already keeping two hives and selling soaps at small scale; own-made products | Owner's business-stage answer; internal planning context |
| F10 | Next year's honey has a purchaser through a meadery partnership | Owner-reported allocation; top-level context approved for this public review, not buyer identity/terms or final consumer marketing |
| F11 | Complete current planning hub and prototypes may be public in Cody-Sims/the-true-hive | Explicit owner publication/visibility choice on 2026-10-28 |

## Architecture and design decisions

| ID | Status | Decision / rationale | Revisit when |
|---|---|---|---|
| D1 | Confirmed scope | No live checkout/admin now | Owner authorizes commerce |
| D2 | Conditional recommendation | Astro + TypeScript for an initial pre-commerce site; reassess against funded integrated-store requirements before bootstrap | Commerce timing, maintainer expertise, native-theme fit and headless operating budget |
| D3 | Recommended | Typed local content before CMS | Owner updates become frequent and developer-mediated publishing is a real bottleneck |
| D4 | Recommended | Managed commerce/inventory; evaluate a native Shopify primary-domain website/theme before custom headless | A documented requirement exceeds supported theme/app capabilities |
| D5 | Open selection | Ten directions; product-led shortlist, with Fieldwork retained as a service-forward reference, not a conversion winner | Owner shortlist and task-based local review |
| D6 | Recommended | Ordinary social links; no live feeds/pixels by default | A measurable need justifies performance/privacy cost |
| D7 | Recommended | Direct phone/email at initial launch; form later | Owner has a receiving/response workflow |
| D8 | Recommended | One app/repository; no speculative custom admin/database | Proven operational constraints require additional systems |
| D9 | Confirmed target | Unified same-site store; pickup first, shipping later | Explicit owner change |
| D10 | Required planning boundary | Future harvest/wholesale promises are not physical retail inventory; do not retail-presell allocated honey | Agreement/allocation and actual available lots are approved |
| D11 | Required release boundary | Current snapshot may be public by explicit approval; future confidential material is not approved; real production excludes review/demo content | Private hosted material needs access controls, not just noindex |
| D12 | Proposed business sequence | Improve real soap operation -> reliable local pickup/sales -> integrated commerce -> one growth experiment | Actual product/compliance/cost/capacity evidence |
| D13 | Accepted for review | Public GitHub repository and Pages/Actions preview; no real commerce on Pages | Move production business/commerce to an appropriate host |

## Owner decisions by gate

The [partner workbook](10-partner-workbook.md) is the authoritative unanswered-question list, with Q IDs, owners and gates. It is rendered in the hub and can be copied/printed for discussion.

Start with honey allocation Q01, real soap records Q02, partner/operating setup Q03-Q04, pickup Q05, digital identity Q08, budget/time Q09 and product/channel obligations Q11. Choose design through Q07; resolve platform/stock workflows through Q06/Q10/Q12/Q13. Shipping and service expansion remain later Q14/Q18 gates.

## Explicit assumptions

One business, English content, an initially small catalog, no online payments or customer accounts, and service inquiries rather than automated booking. A single maintainer can deploy content initially. These are planning assumptions and can be changed before implementation.

No public pickup address, neighboring service town, acreage capacity, retail honey allocation, price, formula, sellable quantity, certification, emergency availability or company history is assumed. The numerical catalog/stock is explicitly fictional, not evidence about the business.

## Risk register

| Risk | Impact | Mitigation / trigger |
|---|---|---|
| A beautiful product-led page hides service contact | Lost homeowner/grower inquiries | Task-based concept review; services visible from hero/navigation |
| Mock store is mistaken for a live store | Customer confusion and loss of trust | Persistent demo/sample labels, read-only checkout, no real payments/orders or offer/rating schema |
| Unknown contact/social links leak into production | Broken conversion path | Launch-blocking owner confirmation and real-device rehearsal |
| Generic competitor imitation loses local credibility | Weak differentiation and IP risk | Original design/assets; verified local story; borrow patterns, not branding |
| Overbuilding for speculative commerce | Delayed landing page and needless maintenance | Static release first; gated native-versus-headless decision |
| Static deployment is mistaken for a backend | Dropped inquiries/webhooks | Explicit hosted-provider or runtime decision before endpoints |
| Manual catalog stock drifts from actual sales | Overselling or disappointed local shoppers | No quantity claims until authoritative inventory and a freshness policy exist |
| In-person and online stock diverge | Overselling | Shared platform/POS or explicit reconciliation before launch |
| Private apiary/property address is exposed | Safety/privacy harm | Owner approval; service-area approach; no fabricated/public home address |
| Embedded social widgets hurt loading/privacy | Worse mobile experience | Ordinary outbound links and locally hosted approved images |
| Low traffic makes analytics inconclusive | False confidence in a "winning" design | Formative interviews; directional metrics; record insufficient evidence |
| Regulatory/label assumptions are wrong | Unsafe or noncompliant sales | Qualified review before real product claims or commerce |
| Domain/social/hosting controlled by contractor | Business continuity risk | Business-owned accounts, MFA, documented handoff |
| Future honey is sold twice or yield is assumed | Missed commitments and customer/buyer disputes | Private agreement/forecast records; no retail offer until actual unallocated stock exists |
| Small-scale soap demand outpaces safe production | Quality/fulfillment and margin problems | Real batch, cost, label, quality and capacity gate before acquisition spend |
| Future confidential context enters public source | Business/privacy exposure | Current snapshot approval only; review commits, exclude secrets/customer/buyer terms, use private storage when needed |

## Cost and scheduling model

No platform subscription or project price is quoted here; current pricing and the owner's budget have not been established.

Budget separately for domain/DNS, hosting and preview controls, business email, real photography/identity, optional form/CMS, commerce subscription/payment processing, POS/apps, packaging/fulfillment, and ongoing maintenance. Headless also adds cart/integration/API-upgrade work. A static site is not automatically free to operate; a native shop is not automatically cheaper than a static brochure site.

Task scope labels mean **XS: hours, S: roughly one focused day, M: a few focused days** for an experienced implementer, excluding owner decisions/content/legal work. These are sizing aids, not delivery commitments. Re-estimate after design, assets, contact workflow and platform are approved.

## Resumption protocol

Read this register, the [brief](00-project-brief.md), [business plan](09-local-business-launch-plan.md), [partner workbook](10-partner-workbook.md), and the next phase document. Identify the last **approved** gate, not merely the last written page. Recheck external versions/pricing and dated assumptions. Update accepted/rejected/superseded decisions with their reason; never treat prototype completion as business approval.
