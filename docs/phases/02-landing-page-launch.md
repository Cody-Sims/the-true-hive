# Phase 2: product-led local landing-page launch

Source: [specification](../00-project-brief.md), R1-R8 and N1-N7.  
Entry gate: P1.5 and all launch-blocking business inputs approved.

## Outcome and order

Publish a trustworthy service/business website, not a partially functioning shop.

Lead with approved products and local pickup context; keep services discoverable. This phase describes the **public pre-commerce release**, not the separate interactive review store. Private business plans/demo carts are excluded.

Sequence: **P2.1 -> (P2.2 || P2.3 || P2.4) -> P2.5 -> P2.6**.

## P2.1 - Implement the contact/navigation spine

**Purpose:** make the business/location and a real next step obvious.  
**Dependencies:** P1.5. **Scope:** M.  
**Files:** `SiteHeader.astro`, `HomeHero.astro`, `SocialLinks.astro`, `ContactSection.astro`, `SiteFooter.astro`, initial page composition; `tests/e2e/contact.spec.ts`.

**Acceptance:** approved name/locality, visible service routing, working phone/email and verified Facebook/Instagram URLs. Header/footer share one content source. No placeholder links, invented handles, nonfunctional form, or emergency promise in the production site.

**Verification:** `npm run test:e2e -- tests/e2e/contact.spec.ts`; manually use phone/email/social links on a real phone and inspect no-JavaScript behavior.

## P2.2 - Implement both service journeys

**Purpose:** help homeowners and farmers identify the appropriate inquiry.  
**Dependencies:** P2.1 and frozen section props. **Scope:** S.  
**Files owned:** `ServiceOverview.astro`, service-specific assets, `tests/e2e/services.spec.ts`.  
**No-edit boundary:** `index.astro`, shared content/styles/configuration, other section components.

**Acceptance:** removal scope/limitations and pollination planning are distinct; actual coverage and assessment wording are clear. A visitor knows what to include and that contact is not a confirmed booking.

**Verification:** `npm run test:e2e -- tests/e2e/services.spec.ts`; owner reviews against actual capability and the approved content sheet.

## P2.3 - Implement the honest product showcase

**Purpose:** establish the future goods range without misleading shoppers.  
**Dependencies:** P2.1 and frozen card props. **Scope:** S.  
**Files owned:** `ProductShowcase.astro`, showcase-specific assets, `tests/e2e/showcase.spec.ts`.  
**No-edit boundary:** page composition, content source, shared tokens/configuration.

**Acceptance:** prioritize approved actual soaps or clearly labeled sample goods and image context. Public pre-commerce pages have no pretend checkout, stock or offer schema. Retail honey is not promised from the allocated next harvest. The internal studio's fictional cart is not promoted as a live shop.

**Verification:** `npm run test:e2e -- tests/e2e/showcase.spec.ts`; inspect accessible card names, image alternatives and the absence of purchase offers.

## P2.4 - Implement the local story and social context

**Purpose:** build real local trust rather than borrowed social proof.  
**Dependencies:** P2.1. **Scope:** S.  
**Files owned:** `LocalStory.astro`, `AroundTheHive.astro`, story/editorial assets, `tests/e2e/story.spec.ts`.  
**No-edit boundary:** `SocialLinks.astro`, content source, shared styles/page configuration.

**Acceptance:** owner-approved story/images, explicit distinction between illustrations and real product photos, ordinary social links using the existing shared component, and no embeds/pixels or invented testimonials.

**Verification:** `npm run test:e2e -- tests/e2e/story.spec.ts`; inspect image rights/claims and the network panel for automatic third-party requests.

## P2.5 - Integrate metadata and launch information

**Purpose:** turn sections into one coherent, discoverable public release.  
**Dependencies:** P2.2-P2.4. **Scope:** M.  
**Files:** `index.astro`, `SiteLayout.astro`, metadata/SEO helper if actually useful, privacy/accessibility/404 pages, sitemap/robots configuration; `tests/e2e/landing.spec.ts`.

**Acceptance:** product-led hierarchy, useful metadata/canonical/social image, correct indexing/sitemap/404 and privacy disclosures. No fake address/offer/rating, preview URL or internal planning context. Approved pickup privacy and the [SEO gates](../06-storefront-seo-and-acquisition.md) guide public content.

**Verification:** `npm run check && npm run build`, then `npm run test:e2e -- tests/e2e/landing.spec.ts`. Inspect rendered metadata/JSON-LD and sitemap; use Google's validator only for markup actually eligible for its results.

## P2.6 - Approve and publish the release

**Purpose:** establish the actual customer experience and operational readiness.  
**Dependencies:** P2.5. **Scope:** S.  
**Files:** release/operations checklist and only fixes identified by the gate.

**Acceptance:** all phase-2 requirement rows pass; no prototype notice, fake fact, incomplete contact method or broken destination remains. Owner can receive/respond to inquiries and knows how to request a content update. Preview rollback has been rehearsed.

**Verification:** run the existing check/build and all phase-2 browser selectors in one runner invocation. Perform keyboard/screen-reader review, real-device contact rehearsal, 320/375/768/1440 px and 200% zoom inspection, network/byte review, and mobile lab performance review. Inspect the deployed production URL after promotion. Record field Core Web Vitals as pending if traffic is insufficient.

## Parallel ownership

P2.2/P2.3/P2.4 are safe together after P2.1: separate components/assets/test files, read-only shared content/tokens. A coordinator alone writes page composition and shared configuration during P2.5. Shared-contract changes invalidate the parallel wave until agreed.

## Rollout and rollback

Publish only when owner facts and contacts are real. Use the actual production domain, then review broken links and inbound contact delivery. Restore the last known-good static deployment for release regressions; no customer database is introduced in this phase.

**Not included:** online ordering, a form inbox, inventory quantities, booking or custom admin.
