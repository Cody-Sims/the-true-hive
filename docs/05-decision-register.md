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
| F12 | Use preview.thetruehive.com on existing Porkbun DNS; leave the main domain for the future site | Owner's domain choices on 2026-10-29 |
| F13 | Defer email setup; document contact@thetruehive.com and use phone/socials for now | Latest owner instruction on 2026-10-29; actual phone/profile destinations remain unprovided |
| F14 | Apiary Market (concept 04) is selected; create our own storefront/inventory, not Shopify | Owner's implementation direction |
| F15 | Astro/TypeScript + native Node/PostgreSQL foundation approved; no Docker | Owner's scope confirmation and later no-Docker instruction |
| F16 | Render selected; owner reports account created and connected to GitHub | Owner's hosting answer; no paid resource provisioning is implied |
| F17 | Native Render app in a Hobby workspace plus Neon Free PostgreSQL, both in Oregon | Owner's later provider, tier and region approval; no paid Neon or Render database |
| F18 | Verified database TLS with channel binding when offered using the current Node driver | Explicit owner connection-policy choice; strict required channel binding is not claimed |

## Architecture and design decisions

| ID | Status | Decision / rationale | Revisit when |
|---|---|---|---|
| D1 | Confirmed scope | No live checkout/admin now | Owner authorizes commerce |
| D2 | Accepted | Astro + TypeScript with native Node and PostgreSQL | Proven scaling/operating need, not speculative framework changes |
| D3 | Recommended | Typed local content before CMS | Owner updates become frequent and developer-mediated publishing is a real bottleneck |
| D4 | Superseded | Earlier Shopify recommendation rejected; our database/application own inventory | Preserve the rationale as historical comparison, not active instructions |
| D5 | Accepted | Apiary Market, with all ten prototypes retained separately | Owner-approved changes after real customer feedback |
| D6 | Recommended | Ordinary social links; no live feeds/pixels by default | A measurable need justifies performance/privacy cost |
| D7 | Recommended | Direct phone/email at initial launch; form later | Owner has a receiving/response workflow |
| D8 | Accepted | One modular app/repository and an actual custom inventory database; public editing/admin remains gated | Auth/roles and payment/order specification before new mutations |
| D9 | Confirmed target | Unified same-site store; pickup first, shipping later | Explicit owner change |
| D10 | Required planning boundary | Future harvest/wholesale promises are not physical retail inventory; do not retail-presell allocated honey | Agreement/allocation and actual available lots are approved |
| D11 | Required release boundary | Current snapshot may be public by explicit approval; future confidential material is not approved; real production excludes review/demo content | Private hosted material needs access controls, not just noindex |
| D12 | Proposed business sequence | Improve real soap operation -> reliable local pickup/sales -> integrated commerce -> one growth experiment | Actual product/compliance/cost/capacity evidence |
| D13 | Accepted for review | Public GitHub repository and Pages/Actions preview; no real commerce on Pages | Move production business/commerce to an appropriate host |
| D14 | Accepted for review | One preview CNAME to GitHub; preserve root/www and all existing mail DNS | Production hosting/domain decision, with ownership verification and valid HTTPS |
| D15 | Deferred | No mail-forwarding/mailbox purchase or SMTP setup; future Porkbun mailbox/Workspace decision | Email is needed and the owner approves the actual sending/receiving plan |
| D16 | Superseded by D18 | Earlier free Render draft and Render-database proposal; native Node/no Docker remains valid | Historical alternative, not active provisioning instructions |
| D17 | Required | PRs and actual preview/site/native-DB checks on main; Render waits for CI before deployment | Maintain stable required contexts and do not bypass checks manually |
| D18 | Accepted for foundation | One $7/month native Render app in a Hobby workspace; Neon Free PostgreSQL in Oregon, no paid database resource | Quotas/recovery or measured traffic justify a separately approved upgrade before live operations |
| D19 | Accepted | Certificate-verified TLS and opportunistic channel binding; explicit `channel_binding=prefer`, reject `require` rather than pretending to enforce it | A strict channel-binding requirement needs a compatible driver |
| D20 | Required | Validate database/schema once before listening; Render regularly checks process liveness, not database readiness | Preserve honest outage responses and avoid keeping free Neon compute awake through monitoring |

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
| Expanding custom commerce before contracts/auth | Integrity/security/operating risk | Keep the foundation bounded; add tested order/reservation/payment/owner slices deliberately |
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

The selected starting infrastructure uses Render's publicly listed $7/month native app tier with a Hobby workspace and Neon Free. Recheck current public pricing before provisioning or changing tiers. This is not a complete business budget, a guarantee of future free quotas or approval for paid Neon/Render database resources.

Budget separately for domain/DNS, hosting and preview controls, business email, real photography/identity, optional form/CMS, commerce subscription/payment processing, POS/apps, packaging/fulfillment, and ongoing maintenance. Headless also adds cart/integration/API-upgrade work. A static site is not automatically free to operate; a native shop is not automatically cheaper than a static brochure site.

Task scope labels mean **XS: hours, S: roughly one focused day, M: a few focused days** for an experienced implementer, excluding owner decisions/content/legal work. These are sizing aids, not delivery commitments. Re-estimate after design, assets, contact workflow and platform are approved.

## Resumption protocol

Read this register, the [brief](00-project-brief.md), [business plan](09-local-business-launch-plan.md), [partner workbook](10-partner-workbook.md), and the next phase document. Identify the last **approved** gate, not merely the last written page. Recheck external versions/pricing and dated assumptions. Update accepted/rejected/superseded decisions with their reason; never treat prototype completion as business approval.
