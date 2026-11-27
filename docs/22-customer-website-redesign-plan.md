# The True Hive — Customer-Facing Website Redesign, Conversion Psychology, Google SEO & AI Overview / Agent UX Plan

**As-of date:** November 24, 2026  
**Target site:** `https://thetruehive.com` (Madisonville, Tennessee)  
**Scope:** Complete customer-facing website redesign and subpage overhaul (`/`, `/goods`, `/goods/[slug]`, `/services`, `/about`, `/cart`, `/contact`) reusing existing verified True Hive products, ingredients, assets, pickup locations, and beekeeping services, accompanied by **5 interactive full-site prototypes** in `prototypes/redesign-2026/`.

---

## 1. Executive Audit of the Current Live Site (`https://thetruehive.com`)

Direct inspection of the live production HTML, subpages, `robots.txt`, and `sitemap.xml` on November 24, 2026 surfaced high-impact blockers across SEO, conversion, and trust:

### Critical SEO & AI Discoverability Blockers (Immediate Fixes)
1. **Sitewide `<meta name="robots" content="noindex, follow">` is live on production (`/`):** Search engines and Google AI Overviews cannot index or cite pages marked `noindex` (verified in live HTML `<head>`).
2. **`/sitemap.xml` returns HTTP `404`:** Because `config.indexable` is currently disabled, the sitemap endpoint returns 404 and `/robots.txt` omits the `Sitemap:` line.
3. **Minimal Structured Data (JSON-LD):** Every page emits only a 4-field `Organization` object (`name`, `url`, `telephone`). Missing:
   - `LocalBusiness` / `Store` service-area metadata (Madisonville, TN; Monroe, Blount, Knox counties; pickup meetup locations — without fabricating a walk-in storefront address).
   - `Product` / `ProductGroup` + `Offer` (`price`, `priceCurrency`, `availability`, `availableDeliveryMethod: OnSitePickup`, `hasVariant`) on `/goods/[slug]`.
   - `Service` schema for **No-Cost Honeybee Colony Rescue** and **Farm Pollination**.
   - `BreadcrumbList` on subpages.
4. **No Query Fan-Out Answer Content:** Google's AI Overviews and AI Mode break queries into subtopic fan-out searches (e.g., *"free honeybee removal Monroe County TN"*, *"honeybee vs wasp removal"*, *"is lye left in handmade soap"*, *"where to buy handmade coconut milk soap Madisonville TN"*). Current pages lack direct, factual answers to these buyer and homeowner questions.

### Critical Attention, UX & Conversion Leaks
1. **Fails the 5-Second Clarity Test (NN/g):** Current hero headline — *"Good things, a little closer to home."* — is poetic but vague. A first-time visitor cannot tell in 5 seconds that The True Hive sells **small-batch handmade soaps ($10)** and provides **$0 no-cost honeybee colony rescue & farm pollination in East Tennessee**.
2. **Zero Product Visuals Above the Fold:** Only the honeycomb photo appears above the fold on `/`. Neither *Coconut Milk Delight* nor *The True Soap* (nor the sculpted Wolf Mold) is visible without scrolling.
3. **Sold-Out Placeholder SVG in Homepage Slot #2:** On the live homepage's 3-product row, **Nile Crocodile** (a sold-out candle with a placeholder SVG reading `"CONCEPT PRODUCT"`) sits *ahead* of signature in-stock soap **The True Soap**. Showing a sold-out concept placeholder in prime real estate kills buying momentum and lowers perceived polish.
4. **Pricing & Variant Friction:** On both active soaps, the variant picker shows `Single 4oz bar — $10.00` beside `Single 1oz Wolf Mold — $12.50` (and the URL slug reads `4oz-wolf` while the label reads `1oz Wolf Mold`). Without clarifying the sculpted artisan gift value — or fixing the weight mismatch — charging more for fewer ounces triggers immediate price resistance.
5. **Unanswered Ingredient & Trust Objections:**
   - Ingredients are raw bullets (`Lye`, `Palm Oil`, `Beeswax ;)`). Listing raw `Lye` without a 1-line saponification note ("used to turn oils into soap — zero lye remains in the finished bar") causes hesitation among casual soap shoppers.
   - `Beeswax ;)` includes a winking emoticon, weakening perceived authority for both human shoppers and AI extractors.
   - `"AI styling reference"` appears prominently on cards; honest disclosure is essential until real product photos are uploaded, but it should be styled calmly as a transparent studio note while prioritizing real photography in Phase 3.
6. **Under-Leveraged $0 Colony Rescue Offer:** Free honeybee relocation in Monroe, Blount, and Knox counties is buried inside quiet prose instead of leveraging the **Zero-Price Effect** with an immediate click-to-call bar and a 15-second *"Honeybee vs. Wasp?"* helper.
7. **Navigation & Cart Friction:** Top navigation on the live homepage has only `Store | Services | About us` — no persistent Cart badge, no direct Contact link, and no Call `(423) 368-2262` shortcut for urgent bee calls.
8. **Pickup Reassurance Gap:** `/cart` states *"Look for a 2018 Nissan Altima at your confirmed meetup point"* (Weigel's Vonore, Dunkin' Madisonville, Pizza Hut Madisonville). Framed cleanly with a visual 3-step timeline, zero-fee badge, and friendly neighbor handoff tone, this feels convenient and reassuring rather than awkward.

---

## 2. Research-Backed Psychology, Sales & Marketing Framework

Every tactic below is grounded in peer-reviewed behavioral science or established UX research and **strictly complies with The True Hive's no-dark-patterns policy** (no fake scarcity timers, no fabricated reviews, no unsupported cosmetic/medical claims):

| Principle | Evidence / Source | Concrete True Hive Application |
|---|---|---|
| **5-Second First Impression & Value Clarity** | Nielsen Norman Group (*Testing Visual Design*, 2024; *Visual Hierarchy in UX*, 2021) | Replace vague poetic hero with explicit value proposition: *Small-batch East Tennessee soaps ($10) + $0 honeybee colony rescue & farm pollination*. Show soap + honeycomb visuals above the fold. |
| **Layer-Cake Scanning & 3-Tier Visual Hierarchy** | Nielsen Norman Group (*The Layer-Cake Pattern*, 2019; *5 Principles of Visual Design*, 2020) | Make every `h2`/`h3` a self-contained benefit or answer (never filler like "Take a look"). Keep strict 3-tier type scale so scanners grasp products, prices, pickup, and services in seconds. |
| **Von Restorff (Isolation) Effect** | Restorff (1933); modern CRO visual salience synthesis | Give the primary action (`Shop In-Stock Soaps` / `Add to Cart` / `Call for Free Bee Rescue`) a distinct high-contrast color and whitespace isolation per viewport — never compete with 3 equal buttons. |
| **Zero-Price Effect** | Shampanier, Mazar & Ariely (*Marketing Science*, 2007, Vol. 26 No. 6) | People perceive `$0 / Free` as carrying extra positive affect beyond mere cost savings. Elevate **No-Cost ($0) Honeybee Colony Rescue** into a dedicated, zero-risk callout with instant click-to-call. |
| **Hick's Law & Choice Architecture** | Hick (1952); Baymard product-list UX benchmarks | Reduce friction into 2 clear in-stock soaps first (move sold-out seasonal items like *Nile Crocodile* and *Wildflower Honey* into an honest "Seasonal & Next-Batch Radar" section). Simplify format picks into **Everyday 4oz Bar ($10)** vs. **Sculpted Wolf Gift Mold ($12.50)**. |
| **Sensory & Concrete Framing + Anchoring** | Behavioral framing & Baymard PDP photography/description research | Translate flat ingredients into sensory benefits (*Teawood warm cedar-tea + creamy coconut milk lather*; *warm vanilla & tonka bean + local beeswax*). Frame the Wolf Mold as a sculpted gift piece rather than a per-ounce comparison. |
| **Objection Neutralization & Risk Reversal** | Baymard Cart Abandonment research (unexpected costs/fulfillment clarity) | State **$0 shipping / free local US-411 pickup** upfront on every product card and PDP; explain saponified lye clearly; explain the 3-step confirmed meetup process before cart entry; require no customer account. |
| **Authority & Statistical Proof** | Cialdini (*Influence*); Aggarwal et al. (ACM SIGKDD 2024, +32.8% stat / +29.7% citation lift in GEO-bench) | Highlight the verified **2016 *Science* study (`doi:10.1126/science.aac7287`)** — *+24% median crop yield-gap closure on fields under 5 acres* — as a bold visual proof card on `/services` and Home. |

*Note on evidence limits:* Published CRO lifts (e.g., testimonial lift studies, Baymard averages) come from broader e-commerce benchmarks, not True Hive's specific Madisonville catalog. Treat these as strong design hypotheses to validate with real local orders and inquiry tracking after launch.

---

## 3. Google SEO, AI Overview (GEO) & Agentic UX Blueprint

Grounded directly in **Google Search Central's *Optimizing your website for generative AI features*** (updated July 10, 2026), **`web.dev/articles/ai-agent-site-ux`** (Agent-Friendly Website UX), **Aggarwal et al. (Princeton/Georgia Tech/IIT Delhi/AI2, ACM SIGKDD 2024)**, and **Pew Research Center (July 2025)**:

### A. Verified Facts vs. Myths (As of November 2026)
- **AI Overviews & AI Mode use RAG (grounding) + Query Fan-Out:** Google retrieves indexed pages across related subtopics and cites sources offering **non-commodity, first-hand experience** (maker process, local Madisonville/East TN specifics, verified formulas, real beekeeping field knowledge).
- **Zero-Click Reality Makes Citations & Conversion Critical:** Pew Research Center (July 2025, 68,879 real searches) found traditional organic click-through drops from ~15% to ~8% when an AI Overview is present (~47% relative drop). Winning citations *inside* the AI answer and converting high-intent visitors who click through is essential.
- **What Google Officially Mythbusts (Do NOT Waste Time On):**
  - `llms.txt` is **ignored by Google Search** (harmless if added later for other crawlers, not a Google ranking factor).
  - Artificial "micro-chunking" or keyword-stuffed copy rewritten solely for bots violates helpful-content principles.
  - **FAQ Rich Results were permanently retired by Google on May 7, 2026** (docs removed June 15, 2026). Keep clear visible Q&A blocks for human readers, RAG passage extraction, and non-Google answer engines, *not* expecting Google SERP FAQ accordions.

### B. Technical & Content SEO Action Plan
1. **Turn On Indexing at Launch (`config.indexable = true`):** Serve `index, follow` on public canonical routes, `noindex, nofollow` on `/cart`, `/checkout/*`, `/inventory/*`, `/prototypes/*`, and restore HTTP 200 `/sitemap.xml` + `Sitemap: https://thetruehive.com/sitemap.xml` in `/robots.txt`.
2. **Rich, Truthful JSON-LD Matching Visible HTML:**
   - **Sitewide:** `Organization` + `LocalBusiness` (`areaServed`: Monroe County, Blount County, Knox County, TN; Madisonville & Vonore; phone `+1-423-368-2262`; no fabricated walk-in retail street address).
   - **Product Pages (`/goods/[slug]`):** `ProductGroup` with `hasVariant` (`Product` + `Offer`, real USD price, real `InStock`/`OutOfStock` state, `availableDeliveryMethod: http://purl.org/goodrelations/v1#DeliveryModePickUp`, `brand: The True Hive`).
   - **Services Page (`/services`):** Two `Service` entities — *No-Cost Honeybee Colony Rescue* (`price: 0`, `priceCurrency: USD`, tri-county `areaServed`) and *East Tennessee Farm Pollination* (linking cited `Science` 2016 evidence).
   - **Subpages:** `BreadcrumbList` matching visible breadcrumb links.
3. **Google Business Profile + Google Merchant Center (Official Google AI Guide Recommendation):**
   - Set up a **Service-Area Google Business Profile** (hiding private home/apiary address per GBP rules) covering Monroe, Blount, and Knox counties.
   - Connect a truthful **Merchant Center feed** once live Stripe checkout + real product photography are enabled so products surface in Google Shopping & AI Mode product carousels.
4. **Agentic Browser UX (`web.dev/articles/ai-agent-site-ux`):**
   - Browser agents combine **Screenshots + Raw DOM + Accessibility Tree**.
   - Use strictly semantic `<button>`, `<a href>`, `<label for>`, `<fieldset>/<legend>`, and ARIA `aria-pressed` / `aria-live` states (no clickable `<div>`s).
   - Zero transparent "ghost" overlays covering buttons or links; explicit `cursor: pointer`; predictable, stable button placement across all product pages; interactive targets ≥ 44×44 px.
   - Future-ready: keep cart and variant actions cleanly structured so **WebMCP** tool annotations can be layered onto add-to-cart / inquiry forms once Chrome origin trials stabilize.

---

## 4. Content Reuse & Cleanup Map

| Existing Asset / Content | Action | Details |
|---|---|---|
| `honeybees-on-comb.webp` | **Reuse with separation** | Dedicated lower beekeeping section in the selected Golden Apothecary homepage, About banner, and Services visual anchor; no bees beside soap in its hero. |
| `soap-delight-bar.webp`, `soap-delight-wolf.webp`, `soap-true-bar.webp`, `soap-true-wolf.webp` | **Reuse + elevate** | Bring immediately onto Homepage & Storefront; keep honest `"AI styling reference"` disclosure subtle until real photos replace them. |
| **Coconut Milk Delight** (`$10` / `$12.50`, Teawood, 9 real ingredients) | **Reuse + enhance** | Add plain-English ingredient benefits + saponified lye reassurance + scent note chips. |
| **The True Soap** (`$10` / `$12.50`, Vanilla & Tonka Bean, 7 real ingredients) | **Reuse + clean up** | Clean `"Beeswax ;)"` → `"Local Beeswax"` (note the playful origin in the story instead of the formal ingredient list). Verify Wolf Mold weight (`1oz` vs URL `4oz-wolf`) before launch. |
| **Nile Crocodile** & **Wildflower Honey** (Sold Out / SVG placeholders) | **Reposition cleanly** | Remove from top 3 homepage hero shelf; move into an honest **"Seasonal & Next-Batch Radar"** section on `/goods` so in-stock soaps lead every conversion path. |
| **Colony Rescue & Farm Pollination** copy + `(423) 368-2262` + `Science` 2016 DOI | **Reuse + amplify** | Turn `$0` rescue into a high-visibility banner + add interactive *Honeybee vs. Wasp* ID checklist; turn the *Science* +24% stat into a scannable proof block. |
| **3 US-411 Pickup Meetup Points** (Weigel's Vonore, Dunkin' Madisonville, Pizza Hut Madisonville) & 2018 Nissan Altima note | **Reuse + reframe** | Present as a reassuring 3-step visual pickup map & selector right on `/cart` and summarized on every PDP. |
| **Contact Email Draft (`loganstakely18@gmail.com`)** | **Reuse + clarify** | Keep honest client-side `mailto:` composer with clear disclosure; pair with prominent tap-to-call button. |

---

## 5. Five Distinct Consumer Brand Prototypes (All with Adaptive Light/Dark Mode)

Open `prototypes/redesign-2026/index.html` (`/prototypes/redesign-2026/`). Every prototype honors the user's OS `prefers-color-scheme` automatically plus a manual `Auto / Light / Dark` switch, covers all 7 customer-facing subpages, and includes the live **SEO / AI / Psychology X-Ray Drawer**:

1. **01 — Golden Apothecary (`golden-apothecary`) — selected and implemented public direction**: Unites **Golden Direct (Light)** and **Apothecary Noir (Dark)** with a product-first hero, adaptive appearance, visible cart and mobile hamburger. The explicitly selected **Cinematic Craft-style scent/lather meters** appear on both public soap cards and detail pages: Coconut Milk Delight **95/78/84** and The True Soap **82/94/92** for Creaminess / Scent Warmth / Bar Firmness. They retain their visible **illustrative guide, not lab-tested scores** disclosure; they are not customer ratings or verified measurements. Stocked products lead the real homepage; actual owner photos supersede labeled styling references, and links preserve each pictured format. Bee imagery and prototype-faithful rescue/pollination panels remain in a separate lower section, with common questions at the bottom. The public shell preserves native filters, cart, pickup and checkout authority. Preview tools and all other studies remain confined to the existing authenticated studio.
2. **02 — Cinematic Craft (`story-flagship`)**: Full-bleed atmospheric honeycomb hero, translucent proof strip, arched botanical product cards, and tactile **Scent & Lather Visual Meters** (Creaminess / Scent Warmth / Bar Firmness) inspired by Flamingo Estate & Aesop.
3. **03 — Modern DTC (`modern-dtc`)**: High-velocity modern DTC landing experience featuring an honest 1-click **"Try Both Scents in One Trip — $20.00"** pickup pair builder, bold **"Inside vs. Never Inside"** contrast strip, and punchy thumb-friendly CTAs.
4. **04 — East TN Hearth (`local-hearth`)**: Neighbor-first dual-doorway hero routing **Local Soap Shoppers** and **Monroe / Blount / Knox Bee & Farm Neighbors** in 2 seconds, plus a visual **3-Stop US-411 Pickup Corridor** (`Weigel's Vonore` → `Dunkin' Madisonville` → `Pizza Hut Madisonville`).
5. **05 — Studio Minimal (`gallery-minimal`)**: Le Labo / Apple-inspired gallery whitespace, cognitive processing fluency, and an oversized interactive **Sculptural Product Stage** switching bars & Wolf Molds with zero visual clutter.

---

## 6. Phased Implementation Plan (Moving Chosen Prototype to Production)

- **Phase 0 — Emergency SEO & Trust Fixes (Day 1):** Verify Wolf Mold actual weight (`1oz` vs `4oz`), clean `"Beeswax ;)"` in admin catalog, reorder homepage featured goods so in-stock soaps appear first, verify `config.indexable` flip readiness for launch, and add `ProductGroup`/`LocalBusiness`/`Service`/`BreadcrumbList` JSON-LD to `SiteLayout.astro` and subpages.
- **Phase 1 — Public Visual Rollout and Prototype Parity (implemented 2026-11-26):** Apply Golden Apothecary to all seven public routes using the existing Astro/Node app and genuine catalog data. Match the sun/moon appearance control, five-link/mobile navigation, grouped footer, product/format quick add, collection pills and seasonal radar, soap gallery/price selection and full-width ingredient grid, Home trust strip and pickup steps, compact About, safe bee-identification helper, phone-left/draft-right Contact, and items-left/pickup-and-checkout-right Cart. Preserve canonical/indexing settings, validated search, owner-photo priority, catalog prices and stock, gated checkout, confirmed pickup and private administration. Production retains the owner-selected illustrative sensory guides with explicit disclosure, while real stock and pricing remain authoritative; ingredient explanations describe recipe inputs without asserting finished-batch testing, and the demo meetup selector is not promoted into a fake booking flow.
- **Phase 2 — AI Overview & Local SEO Activation (Week 2):** Enable production indexing & `/sitemap.xml`, submit to Google Search Console (track the *Generative AI performance report*), publish Service-Area Google Business Profile, and verify accessibility tree + Core Web Vitals (`LCP ≤ 2.5s`, `INP ≤ 200ms`, `CLS ≤ 0.1`).
- **Phase 3 — Real Photography, Verified Local Reviews & Live Commerce (Weeks 3–4):** Replace `"AI styling reference"` images with 3–5 real photographs per soap/mold, collect genuine first-party Madisonville customer reviews post-pickup (never fabricated), connect Google Merchant Center feed, and enable live Stripe checkout.
