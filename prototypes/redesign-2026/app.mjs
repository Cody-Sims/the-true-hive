// The True Hive — 5 Distinct Real-World Consumer Brand Prototypes (All with OS Light/Dark Mode + Toggle)
// 01 Golden Apothecary (Golden Direct Light <-> Apothecary Noir Dark)
// 02 Cinematic Craft | 03 Modern DTC | 04 East TN Hearth | 05 Studio Minimal
import {
  siteMeta,
  pickupLocations,
  ingredientNotes,
  products,
  seasonalRadar,
  faqs,
  beeIdSteps,
  prototypes,
  formatMoney,
} from "./data.mjs";
import { buildJsonLd, getPageSeoAudit } from "./seo-schema.mjs";

const memoryCart = {};
const selectedVariants = {
  "coconut-milk-delight": products[0].variants[0].key,
  "the-true-soap": products[1].variants[0].key,
};

let state = {
  proto: "golden-apothecary",
  colorMode: "system", // "system" | "light" | "dark"
  page: "home",
  slug: "coconut-milk-delight",
  gallerySlug: "coconut-milk-delight",
  minimalFormat: "all", // "all" | "bar" | "wolf"
  storeFilter: "all",
  pickupKey: pickupLocations[1].key, // Dunkin' Madisonville default
  beeChoice: null,
  xrayOpen: false,
  mobileMenuOpen: false,
  studioToolsOpen: false,
  toast: null,
  inquiry: {
    name: "",
    replyTo: "",
    topic: "No-cost Honeybee Colony Rescue",
    message: "",
  },
};

const mobileViewport = window.matchMedia("(max-width: 940px)");
let lastPreviewFocus = null;

function readParams() {
  const p = new URLSearchParams(window.location.search);
  const pr = p.get("proto") || p.get("arch") || p.get("theme");
  const m = p.get("mode");
  const pg = p.get("page");
  const sl = p.get("slug");
  const variantKey = p.get("variant");
  if (pr && prototypes.some((x) => x.id === pr)) state.proto = pr;
  if (m && ["system", "light", "dark"].includes(m)) state.colorMode = m;
  if (pg && ["home", "goods", "product", "services", "about", "cart", "contact"].includes(pg)) {
    state.page = pg;
  }
  if (sl && products.some((x) => x.slug === sl)) state.slug = sl;
  const product = products.find((x) => x.slug === state.slug);
  if (state.page === "product" && product?.variants.some((v) => v.key === variantKey)) {
    selectedVariants[product.slug] = variantKey;
  }
}

function syncUrl(push = false) {
  const url = new URL(window.location.href);
  url.searchParams.delete("arch");
  url.searchParams.delete("theme");
  url.searchParams.set("proto", state.proto);
  url.searchParams.set("mode", state.colorMode);
  url.searchParams.set("page", state.page);
  if (state.page === "product") {
    url.searchParams.set("slug", state.slug);
    const product = products.find((p) => p.slug === state.slug) || products[0];
    url.searchParams.set("variant", activeVariantFor(product).key);
  } else {
    url.searchParams.delete("slug");
    url.searchParams.delete("variant");
  }
  const next = url.toString();
  if (push && next !== window.location.href) {
    window.history.pushState({}, "", next);
  } else {
    window.history.replaceState({}, "", next);
  }
}

function cartKey() { return "truehive-redesign-cart-v3"; }

function normalizeCart(raw) {
  if (!Array.isArray(raw)) return [];
  const merged = new Map();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const qty = Number(entry.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) continue;
    const variantKey = typeof entry.variantKey === "string" ? entry.variantKey : "";
    let matchedProduct = null;
    let matchedVariant = null;
    for (const p of products) {
      const v = p.variants.find((item) => item.key === variantKey);
      if (v) { matchedProduct = p; matchedVariant = v; break; }
    }
    if (!matchedProduct || !matchedVariant) continue;
    const existing = merged.get(matchedVariant.key);
    if (existing) existing.qty = Math.min(99, existing.qty + qty);
    else {
      merged.set(matchedVariant.key, {
        productSlug: matchedProduct.slug,
        productTitle: matchedProduct.title,
        variantKey: matchedVariant.key,
        variantLabel: matchedVariant.label,
        priceMinor: matchedVariant.priceMinor,
        image: matchedVariant.small,
        qty,
      });
    }
  }
  return [...merged.values()];
}

function getCart() {
  try {
    const raw = window.localStorage.getItem(cartKey());
    if (raw) return normalizeCart(JSON.parse(raw));
  } catch { /* fallback */ }
  return normalizeCart(memoryCart[cartKey()]);
}

function saveCart(items) {
  const clean = normalizeCart(items);
  memoryCart[cartKey()] = clean;
  try { window.localStorage.setItem(cartKey(), JSON.stringify(clean)); } catch { /* ignore */ }
}
function getCartCount() { return getCart().reduce((s, i) => s + i.qty, 0); }
function getCartSubtotal() { return getCart().reduce((s, i) => s + i.priceMinor * i.qty, 0); }

function renderToast() {
  const region = document.getElementById("toast-region");
  if (!region) return;
  region.innerHTML = state.toast
    ? `<div class="toast" role="status"><span>${esc(state.toast)}</span><a href="${navHref("cart")}" data-nav="cart">View Cart &rarr;</a></div>`
    : "";
}

function showToast(msg) {
  state.toast = msg;
  renderToast();
  window.clearTimeout(window.__toastTimer);
  window.__toastTimer = window.setTimeout(() => { state.toast = null; renderToast(); }, 4500);
}

function addItemsToCart(entries, toastText) {
  const items = getCart();
  for (const { productSlug, variantKey, qty } of entries) {
    const product = products.find((p) => p.slug === productSlug);
    if (!product) continue;
    const variant = product.variants.find((v) => v.key === variantKey) || product.variants[0];
    const existing = items.find((i) => i.variantKey === variant.key);
    if (existing) existing.qty = Math.min(99, existing.qty + qty);
    else {
      items.push({
        productSlug: product.slug,
        productTitle: product.title,
        variantKey: variant.key,
        variantLabel: variant.label,
        priceMinor: variant.priceMinor,
        image: variant.small,
        qty,
      });
    }
  }
  saveCart(items);
  render();
  showToast(toastText);
}

function updateCartQty(variantKey, delta) {
  const items = getCart()
    .map((i) => (i.variantKey === variantKey ? { ...i, qty: i.qty + delta } : i))
    .filter((i) => i.qty > 0);
  saveCart(items);
  render();
}

function esc(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function navHref(page, slug, variantKey) {
  const params = new URLSearchParams({ proto: state.proto, mode: state.colorMode, page });
  if (slug) params.set("slug", slug);
  if (page === "product" && slug) {
    const product = products.find((p) => p.slug === slug);
    const key = variantKey || selectedVariants[slug];
    if (product?.variants.some((v) => v.key === key)) params.set("variant", key);
  }
  return `prototype.html?${params.toString()}`;
}

function activeVariantFor(product) {
  const k = selectedVariants[product.slug] || product.variants[0].key;
  return product.variants.find((v) => v.key === k) || product.variants[0];
}

function modeChipLabel() {
  if (state.colorMode === "light") return "☀ Light";
  if (state.colorMode === "dark") return "☾ Dark";
  return "◐ Auto";
}

function renderStudioBar() {
  const protoBtns = prototypes
    .map(
      (p) =>
        `<button type="button" class="studio-pill" data-switch-proto="${p.id}" aria-pressed="${p.id === state.proto}">${p.number} ${esc(p.name)}</button>`,
    )
    .join("");
  const modeBtns = [
    ["system", "Auto (OS)"],
    ["light", "☀ Light"],
    ["dark", "☾ Dark"],
  ]
    .map(
      ([m, lbl]) =>
        `<button type="button" class="mode-btn" data-set-mode="${m}" aria-pressed="${state.colorMode === m}">${lbl}</button>`,
    )
    .join("");

  return `
    <div class="studio-bar" role="region" aria-label="Prototype comparison bar">
      <div class="wrap studio-bar-inner">
        ${state.proto === "golden-apothecary" ? `
          <button type="button" id="studio-tools-toggle" class="studio-tools-toggle" data-toggle-studio-tools aria-controls="studio-controls" aria-expanded="${state.studioToolsOpen}">
            <span>Golden Apothecary</span><span>Preview tools <span aria-hidden="true">&darr;</span></span>
          </button>
        ` : ""}
        <div id="studio-controls" class="studio-controls ${state.studioToolsOpen ? "is-open" : ""}">
        <div class="studio-group">
          <a class="studio-back" href="index.html">&larr; Hub &amp; Plan</a>
          ${protoBtns}
        </div>
        <div class="studio-group">
          <div class="mode-toggle-group" role="group" aria-label="Color appearance mode">${modeBtns}</div>
          <button type="button" class="studio-xray-btn" data-toggle-xray aria-expanded="${state.xrayOpen}">SEO / AI X-Ray</button>
        </div>
        </div>
      </div>
    </div>
  `;
}

function renderSiteHeader() {
  const count = getCartCount();
  const isMinimal = state.proto === "gallery-minimal";
  const isGolden = state.proto === "golden-apothecary";
  const banner =
    state.proto === "local-hearth"
      ? `<span><strong>$0 Free Honeybee Colony Rescue</strong> in Monroe, Blount &amp; Knox counties — <a href="${siteMeta.phoneHref}">Call ${siteMeta.phone}</a></span><span>Free US-411 Pickup in Madisonville &amp; Vonore</span>`
      : state.proto === "golden-apothecary"
      ? `<span><strong>Local Pickup Only</strong> &middot; Madisonville &amp; Vonore</span><span>Small-batch soaps &middot; Everyday bars from $10</span>`
      : `<span><strong>Free Local Pickup</strong> along US-411 (Madisonville &amp; Vonore) &middot; $0 Shipping</span><span>Need Honeybees Relocated? <a href="${navHref("services")}" data-nav="services">$0 Colony Rescue &rarr;</a></span>`;

  const navLinks = [
    ["home", "Home"],
    ["goods", "Shop Soaps"],
    ["services", state.proto === "golden-apothecary" ? "Bee Services" : "Free Bee Rescue & Pollination"],
    ["about", "Our Story"],
    ["contact", "Contact"],
  ]
    .map(
      ([pg, lbl]) =>
        `<a href="${navHref(pg)}" data-nav="${pg}" ${state.page === pg || (pg === "goods" && state.page === "product") ? 'aria-current="page"' : ""}>${lbl}</a>`,
    )
    .join("");

  return `
    ${isMinimal ? "" : `<div class="promo-strip"><div class="wrap promo-strip-inner">${banner}</div></div>`}
    <header class="site-header ${isGolden ? "ga-header" : ""}">
      <div class="wrap header-inner">
        <a class="brand-link" href="${navHref("home")}" data-nav="home">
          ${isMinimal ? "" : `<span class="brand-mark" aria-hidden="true">TH</span>`}
          <span class="brand-text">
            <strong>THE TRUE HIVE</strong>
            <small>Madisonville, Tennessee</small>
          </span>
        </a>
        ${isGolden ? `
          <button type="button" id="mobile-menu-toggle" class="mobile-menu-toggle" data-toggle-mobile-menu aria-label="Menu" aria-controls="primary-nav" aria-expanded="${state.mobileMenuOpen}">
            <span class="menu-icon" aria-hidden="true"><span></span><span></span><span></span></span>
          </button>
        ` : ""}
        <nav ${isGolden ? 'id="primary-nav"' : ""} class="main-nav ${state.mobileMenuOpen ? "is-open" : ""}" aria-label="Primary navigation">
          ${navLinks}
          ${isGolden ? `
            <div class="mobile-menu-extras">
              <button type="button" id="mobile-color-mode" class="mode-chip" data-cycle-mode title="Change color appearance">Appearance: ${modeChipLabel()}</button>
              <a class="call-chip" href="${siteMeta.phoneHref}">Call ${siteMeta.phone}</a>
            </div>
          ` : ""}
        </nav>
        <div class="header-actions">
          <button type="button" id="desktop-color-mode" class="mode-chip" data-cycle-mode title="Toggle Light / Dark / System mode">${modeChipLabel()}</button>
          ${isMinimal ? "" : `<a class="call-chip" href="${siteMeta.phoneHref}">Call ${siteMeta.phone}</a>`}
          <a class="cart-chip" href="${navHref("cart")}" data-nav="cart" aria-label="Cart ${count} ${count === 1 ? "item" : "items"}">
            Cart <span class="cart-badge">${count}</span>
          </a>
        </div>
      </div>
    </header>
  `;
}

function renderVariantButtons(product) {
  const active = activeVariantFor(product);
  return `
    <div class="variant-row" role="group" aria-label="Choose format for ${esc(product.title)}">
      ${product.variants
        .map(
          (v) => `
        <button type="button" id="format-${esc(v.key)}" class="variant-btn" data-select-variant="${product.slug}|${v.key}" aria-pressed="${v.key === active.key}">
          <strong>${esc(v.shortLabel)} — ${formatMoney(v.priceMinor)}</strong>
          <span>${esc(v.roleTag)}</span>
        </button>
      `,
        )
        .join("")}
    </div>
  `;
}

function renderProductCard(product) {
  const active = activeVariantFor(product);
  return `
    <article class="product-card">
      <a class="product-media" href="${navHref("product", product.slug)}" data-nav="product" data-slug="${product.slug}">
        <img src="${active.image}" alt="${esc(active.alt)}" />
        <div class="media-top-badges">
          <span class="pill-tag pill-stock">In Stock &middot; $0 Pickup</span>
          <span class="pill-tag">${esc(product.badge)}</span>
        </div>
        <span class="ai-ref-note">AI styling reference</span>
      </a>
      <div class="product-body">
        <div>
          <p class="eyebrow" style="margin-bottom:0.25rem">${esc(product.categoryLabel)}</p>
          <div class="product-title-row">
            <h3><a href="${navHref("product", product.slug)}" data-nav="product" data-slug="${product.slug}">${esc(product.title)}</a></h3>
            <span class="price-display">${formatMoney(active.priceMinor)}</span>
          </div>
        </div>
        <p style="margin:0;color:var(--muted);font-size:0.92rem">${esc(product.shortHook)}</p>
        <div class="scent-chips">${product.scentNotes.map((n) => `<span class="scent-chip">${esc(n)}</span>`).join("")}</div>
        ${state.proto === "golden-apothecary" ? renderSensoryProfile(product) : ""}
        ${renderVariantButtons(product)}
        <div style="display:flex;flex-wrap:wrap;gap:0.6rem;margin-top:auto;padding-top:0.35rem">
          <button type="button" class="btn btn-primary" style="flex:1" data-add-cart="${product.slug}|${active.key}">Add to Cart — ${formatMoney(active.priceMinor)}</button>
          <a class="btn btn-secondary" href="${navHref("product", product.slug)}" data-nav="product" data-slug="${product.slug}">Ingredients</a>
        </div>
      </div>
    </article>
  `;
}

function renderSensoryProfile(product) {
  const metrics = [
    ["Creaminess", product.meters.richness],
    ["Scent Warmth", product.meters.warmth],
    ["Bar Firmness", product.meters.firmness],
  ];
  return `
    <div class="ga-sensory-profile" role="group" aria-label="${esc(product.title)} sensory profile">
      <p class="eyebrow">Scent &amp; lather profile</p>
      <div class="sf-meters ga-meters">
        ${metrics.map(([label, value]) => `
          <div class="sf-meter-row">
            <span>${label}</span>
            <div class="sf-meter-track" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}" aria-valuetext="${value} out of 100, illustrative sensory guide">
              <div class="sf-meter-fill" style="width:${value}%"></div>
            </div>
            <span class="ga-meter-value" aria-hidden="true">${value}/100</span>
          </div>
        `).join("")}
      </div>
      <p class="ga-profile-note">Illustrative sensory guide for this preview, not lab-tested scores.</p>
    </div>
  `;
}

function renderServicesCards(detailed = false) {
  return `
    <div class="grid-2">
      <article class="service-panel rescue-panel">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap">
          <span class="pill-tag pill-free">$0 NO-COST SERVICE</span>
          <span style="font-size:0.8rem;font-weight:700;color:var(--muted)">Monroe &middot; Blount &middot; Knox Counties</span>
        </div>
        <h3 style="font-family:var(--font-display);font-size:1.65rem;margin:0">Live Honeybee Colony Rescue</h3>
        <p style="margin:0;color:var(--muted)">
          Found honeybees swarming a branch, porch, or wall? Don’t call an exterminator. We come to you and relocate honeybee colonies alive at <strong>zero cost</strong> so they can keep thriving.
        </p>
        ${
          detailed
            ? `<ul class="checklist">
                <li><strong>Property address:</strong> Where the colony is located.</li>
                <li><strong>Exact hive spot:</strong> Tree branch, roof, shed, wall cavity, etc.</li>
                <li><strong>Good visit window:</strong> Your preferred time for us to inspect safely.</li>
              </ul>`
            : ""
        }
        <div style="display:flex;flex-wrap:wrap;gap:0.65rem;margin-top:auto">
          <a class="btn btn-primary" href="${siteMeta.phoneHref}">Call ${siteMeta.phone} — Free Rescue</a>
          ${!detailed ? `<a class="btn btn-secondary" href="${navHref("services")}" data-nav="services">Bee vs. Wasp Helper &rarr;</a>` : `<a class="btn btn-secondary" href="${navHref("contact")}" data-nav="contact">Email Draft</a>`}
        </div>
      </article>

      <article class="service-panel">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap">
          <span class="pill-tag">FARMS &amp; GROWERS</span>
          <span style="font-size:0.8rem;font-weight:700;color:var(--muted)">Peer-Reviewed Evidence</span>
        </div>
        <h3 style="font-family:var(--font-display);font-size:1.65rem;margin:0">East Tennessee Farm Pollination</h3>
        <p style="margin:0;color:var(--muted)">We bring active honeybee colonies to your farm to support peak bloom pollination and stronger harvests.</p>
        <div class="stat-callout">
          <span class="big-num">+${siteMeta.scienceCitation.stat}</span>
          <p><strong>Median crop yield-gap closure</strong> on fields under 5 acres across 33 crop systems — <a href="${siteMeta.scienceCitation.url}" target="_blank" rel="noopener noreferrer">${siteMeta.scienceCitation.label}</a>.</p>
        </div>
        ${
          detailed
            ? `<ul class="checklist">
                <li><strong>Farm location</strong> &amp; acreage</li>
                <li><strong>Crops grown</strong> on the land</li>
                <li><strong>Hive count</strong> you’d like to rent</li>
                <li><strong>Preferred inspection day</strong> for a walk-through</li>
              </ul>`
            : ""
        }
        <div style="display:flex;flex-wrap:wrap;gap:0.65rem;margin-top:auto">
          <a class="btn btn-accent2" href="${siteMeta.phoneHref}">Discuss Farm Pollination</a>
          ${!detailed ? `<a class="btn btn-secondary" href="${navHref("services")}" data-nav="services">Assessment Checklist &rarr;</a>` : `<a class="btn btn-secondary" href="${navHref("contact")}" data-nav="contact">Send Farm Details</a>`}
        </div>
      </article>
    </div>
    <div class="safety-banner"><strong>Safety First:</strong> ${siteMeta.safetyNote}</div>
  `;
}

function renderBeeHelper() {
  const step = beeIdSteps[0];
  const selected = step.options.find((o) => o.result === state.beeChoice);
  return `
    <section class="bee-helper" aria-labelledby="bee-helper-h">
      <p class="eyebrow">15-Second Safe ID Helper</p>
      <h3 id="bee-helper-h" style="font-family:var(--font-display);font-size:1.4rem;margin:0 0 0.35rem">Is it a Honeybee or a Wasp?</h3>
      <p style="margin:0;color:var(--muted);font-size:0.9rem">${esc(step.question)}</p>
      <div class="bee-options" role="group" aria-label="Insect appearance choices">
        ${step.options.map((opt) => `<button type="button" class="bee-opt-btn" data-bee-choice="${opt.result}" aria-pressed="${state.beeChoice === opt.result}">${esc(opt.label)}</button>`).join("")}
      </div>
      ${
        selected
          ? `<div class="bee-result" role="status" aria-live="polite">
              <strong style="display:block;margin-bottom:0.25rem">${esc(selected.title)}</strong>
              <p style="margin:0 0 0.7rem;font-size:0.9rem">${esc(selected.detail)}</p>
              <a class="btn btn-primary btn-sm" href="${siteMeta.phoneHref}">Call ${siteMeta.phone} Now</a>
            </div>`
          : ""
      }
    </section>
  `;
}

function renderPickupSection() {
  return `
    <section class="section section-alt" aria-labelledby="pickup-h">
      <div class="wrap">
        <div class="section-head">
          <div>
            <p class="eyebrow">Zero Shipping Fees &middot; Clear Before You Go</p>
            <h2 id="pickup-h">Easy 3-step pickup along US-411.</h2>
          </div>
          <p>No retail shop markup and no surprise shipping costs. Pick your meetup spot in Madisonville or Vonore and meet us at your confirmed window.</p>
        </div>
        <div class="grid-3">
          <article class="card-box"><span class="pill-tag" style="margin-bottom:0.65rem">Step 01</span><h3 style="margin:0 0 0.35rem">Pick Your Soap &amp; Format</h3><p style="margin:0;font-size:0.88rem;color:var(--muted)">Choose 4oz Everyday Bars ($10) or Sculpted Wolf Gift Molds ($12.50) with every ingredient explained clearly.</p></article>
          <article class="card-box"><span class="pill-tag" style="margin-bottom:0.65rem">Step 02</span><h3 style="margin:0 0 0.35rem">Pick 1 of 3 US-411 Spots</h3><p style="margin:0;font-size:0.88rem;color:var(--muted)">Weigel’s (Vonore), Dunkin’ (Madisonville), or Pizza Hut (Madisonville) — zero shipping fee.</p></article>
          <article class="card-box"><span class="pill-tag" style="margin-bottom:0.65rem">Step 03</span><h3 style="margin:0 0 0.35rem">Confirm Time &amp; Meet Locally</h3><p style="margin:0;font-size:0.88rem;color:var(--muted)">Wait for your confirmed window and look for our ${siteMeta.pickupVehicle} for a quick local handoff.</p></article>
        </div>
      </div>
    </section>
  `;
}

function renderFaqSection(list, heading = "Direct Answers — Ingredients, Pickup & Bee Rescue") {
  return `
    <section class="section" aria-labelledby="faq-h">
      <div class="wrap">
        <div class="section-head">
          <div><p class="eyebrow">Clear, Straight Answers</p><h2 id="faq-h">${esc(heading)}</h2></div>
          <p>Honest answers to the exact questions shoppers, homeowners, and growers ask before ordering or calling.</p>
        </div>
        <div class="faq-list">
          ${list.map((f, i) => `<details class="faq-item" ${i < 2 ? "open" : ""}><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}
        </div>
      </div>
    </section>
  `;
}

/* ============================================================================
   5 DISTINCT HOME EXPERIENCES (Prototype 01 = Golden Apothecary + 4 Fresh Brand Directions)
   ============================================================================ */
function renderHomeGoldenApothecary() {
  const heroProducts = [
    { product: products[0], variant: products[0].variants[0] },
    { product: products[1], variant: products[1].variants[0] },
    { product: products[1], variant: products[1].variants[1] },
  ];
  return `
    <section class="ga-hero" aria-labelledby="home-h1">
      <div class="wrap ga-hero-grid">
        <div>
          <p class="eyebrow">Madisonville, TN &middot; In Stock &amp; Ready for Pickup</p>
          <h1 id="home-h1">Small-batch soaps.<br />A little everyday luxury.</h1>
          <p style="font-size:1.05rem;color:var(--muted);max-width:56ch;margin:0 0 1.5rem">
            Coconut Milk Delight or The True Soap. Find your scent, compare the lather, and choose an everyday bar or sculpted Wolf Mold — with free local pickup along US-411.
          </p>
          <div style="display:flex;flex-wrap:wrap;gap:0.75rem;margin-bottom:1.4rem">
            <a class="btn btn-primary" href="${navHref("goods")}" data-nav="goods">Shop In-Stock Soaps — From $10 &rarr;</a>
            <a class="btn btn-secondary" href="#in-stock-soaps">Compare the Bars &darr;</a>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:0.5rem">
            <span class="pill-tag">&#10003; Every Ingredient Explained</span>
            <span class="pill-tag">&#10003; Free Local Pickup</span>
            <span class="pill-tag">&#10003; Bars &amp; Gift Molds</span>
          </div>
        </div>
        <div class="ga-collage">
          ${heroProducts.map(({ product, variant }, index) => `
            <a class="ga-visual ${index === 0 ? "ga-visual-main" : "ga-visual-mini"}" href="${navHref("product", product.slug, variant.key)}" data-nav="product" data-slug="${product.slug}">
              <img src="${variant.image}" alt="${esc(variant.alt)}" ${index === 0 ? 'fetchpriority="high"' : ""} />
              <span class="ai-ref-note">AI styling reference</span>
              <div class="ga-caption-pill"><span>${index === 2 ? esc(variant.shortLabel) : esc(product.title)}</span><strong>${formatMoney(variant.priceMinor)}</strong></div>
            </a>
          `).join("")}
        </div>
      </div>
    </section>
    <section class="trust-bar"><div class="wrap trust-grid">
      <div class="trust-item"><strong>100% Readable Ingredients</strong><span>Every oil, butter &amp; saponified step explained</span></div>
      <div class="trust-item"><strong>$0 Local Pickup Fees</strong><span>Dunkin’ &amp; Pizza Hut Madisonville + Weigel’s Vonore</span></div>
      <div class="trust-item"><strong>Two Signature Scents</strong><span>Warm Teawood or vanilla &amp; tonka bean</span></div>
      <div class="trust-item"><strong>Everyday or Gift-Ready</strong><span>4oz bars or sculpted Wolf Molds</span></div>
    </div></section>
    <section id="in-stock-soaps" class="section" aria-labelledby="in-stock-h"><div class="wrap">
      <div class="section-head"><div><p class="eyebrow">In Stock Now &middot; Ready for Pickup</p><h2 id="in-stock-h">Pick your scent. Pick your shape.</h2></div><p>Compare each recipe’s creaminess, scent warmth, and firmness, then choose the 4oz Everyday Bar ($10) or Sculpted Wolf Gift Mold ($12.50).</p></div>
      <div class="grid-2">${products.map(renderProductCard).join("")}</div>
    </div></section>
    ${renderPickupSection()}
    <section class="section section-alt ga-beekeeping" aria-labelledby="beekeeping-h"><div class="wrap">
      <div class="ga-service-intro">
        <figure class="ga-apiary-photo">
          <img src="../next/assets/hive.webp" alt="Honeybees tending golden honeycomb at The True Hive apiary" loading="lazy" />
          <figcaption>Our beekeeping work &middot; East Tennessee</figcaption>
        </figure>
        <div class="section-head">
          <div><p class="eyebrow">Beyond the Soap Shelf &middot; Beekeeping Services</p><h2 id="beekeeping-h">For the bees. And our neighbors.</h2></div>
          <p>A different side of The True Hive: saving live colonies and supporting local growers with farm pollination across East Tennessee.</p>
        </div>
      </div>
      ${renderServicesCards(false)}
    </div></section>
    ${renderFaqSection(faqs, "Commonly Asked Questions")}
  `;
}

function renderHomeStoryFlagship() {
  return `
    <section class="sf-cine-hero" aria-labelledby="home-h1">
      <img class="sf-cine-bg" src="../next/assets/hive.webp" alt="Golden honeycomb tended by Madisonville honeybees" />
      <div class="sf-cine-scrim"></div>
      <div class="sf-cine-content">
        <div class="wrap">
          <p class="eyebrow" style="color:#f5c76b">Madisonville, Tennessee &middot; Small-Batch Soap &amp; Apiary</p>
          <h1 id="home-h1">From golden comb to creamy, honest lather.</h1>
          <p style="max-width:54ch;font-size:1.08rem;color:#ebe4d7;margin:0 0 1.6rem">
            Warm Teawood &amp; coconut milk. Vanilla, tonka bean &amp; local beeswax. Hand-poured in Madisonville with $0 US-411 pickup — alongside free live honeybee colony rescue across Monroe, Blount, and Knox counties.
          </p>
          <div style="display:flex;flex-wrap:wrap;gap:0.8rem">
            <a class="btn btn-primary" href="${navHref("goods")}" data-nav="goods">Explore the Soaps — From $10 &rarr;</a>
            <a class="btn" style="border-color:rgba(255,255,255,0.55);color:#fff" href="${navHref("services")}" data-nav="services">$0 Honeybee Colony Rescue</a>
          </div>
          <div class="sf-proof-strip">
            <div><strong style="display:block;color:#f5c76b">Two Signature Recipes</strong><span style="font-size:0.84rem;color:#dcd5c7">Everyday 4oz Bars ($10) &amp; Sculpted Wolf Molds ($12.50)</span></div>
            <div><strong style="display:block;color:#f5c76b">Zero-Cost Bee Relocation</strong><span style="font-size:0.84rem;color:#dcd5c7">Monroe, Blount &amp; Knox counties · ${siteMeta.phone}</span></div>
            <div><strong style="display:block;color:#f5c76b">+24% Yield-Gap Science</strong><span style="font-size:0.84rem;color:#dcd5c7">Farm pollination backed by 2016 Science study</span></div>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        <div class="section-head">
          <div><p class="eyebrow">Sensory Profile &amp; Craft</p><h2>Feel the recipe before your first wash.</h2></div>
          <p>Every bar is formulated for unmistakable scent warmth, creamy lather, and readable plant oils — zero synthetic detergent fillers.</p>
        </div>
        ${products
          .map((p) => {
            const v = activeVariantFor(p);
            return `
              <article class="sf-arch-card">
                <a class="sf-arch-frame" href="${navHref("product", p.slug)}" data-nav="product" data-slug="${p.slug}">
                  <img src="${v.image}" alt="${esc(v.alt)}" />
                  <span class="ai-ref-note">AI styling reference</span>
                </a>
                <div>
                  <span class="pill-tag pill-stock" style="margin-bottom:0.65rem">In Stock &middot; $0 Local Pickup</span>
                  <h3 style="font-family:var(--font-display);font-size:2rem;font-weight:400;margin:0 0 0.25rem">${esc(p.title)} — <span style="color:var(--accent)">${formatMoney(v.priceMinor)}</span></h3>
                  <p style="font-weight:700;color:var(--muted);margin:0 0 0.65rem">${esc(p.scentLine)}</p>
                  <p style="margin:0 0 0.9rem;color:var(--muted)">${esc(p.story)}</p>
                  <div class="sf-meters" aria-label="Sensory profile">
                    <div class="sf-meter-row"><span>Creaminess</span><div class="sf-meter-track"><div class="sf-meter-fill" style="width:${p.meters.richness}%"></div></div></div>
                    <div class="sf-meter-row"><span>Scent Warmth</span><div class="sf-meter-track"><div class="sf-meter-fill" style="width:${p.meters.warmth}%"></div></div></div>
                    <div class="sf-meter-row"><span>Bar Firmness</span><div class="sf-meter-track"><div class="sf-meter-fill" style="width:${p.meters.firmness}%"></div></div></div>
                  </div>
                  ${renderVariantButtons(p)}
                  <div style="display:flex;flex-wrap:wrap;gap:0.65rem;margin-top:0.9rem">
                    <button type="button" class="btn btn-primary" style="flex:1" data-add-cart="${p.slug}|${v.key}">Add to Cart — ${formatMoney(v.priceMinor)}</button>
                    <a class="btn btn-secondary" href="${navHref("product", p.slug)}" data-nav="product" data-slug="${p.slug}">Read All ${p.ingredients.length} Ingredients</a>
                  </div>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>

    ${renderPickupSection()}
    <section class="section"><div class="wrap"><div class="section-head"><div><p class="eyebrow">Working Apiary</p><h2>Care for the bees, care for the land.</h2></div><p>No-cost honeybee colony rescue and research-backed farm pollination across East Tennessee.</p></div>${renderServicesCards(false)}</div></section>
  `;
}

function renderHomeModernDtc() {
  return `
    <section class="dtc-hero" aria-labelledby="home-h1">
      <div class="wrap dtc-hero-grid">
        <div>
          <span class="pill-tag pill-stock" style="margin-bottom:0.85rem">IN STOCK IN MADISONVILLE &middot; $0 US-411 PICKUP</span>
          <h1 id="home-h1">Ditch grocery detergent bars. Wash with real East TN soap.</h1>
          <p style="font-size:1.06rem;color:var(--muted);margin:0 0 1.45rem;max-width:52ch">
            Made with real coconut milk, shea &amp; mango butters, and local beeswax. Zero mystery chemicals, zero shipping fees — plus <strong>$0 live honeybee colony rescue</strong> in Monroe, Blount &amp; Knox counties.
          </p>
          <div style="display:flex;flex-wrap:wrap;gap:0.7rem;margin-bottom:1.1rem">
            <a class="btn btn-primary" href="${navHref("goods")}" data-nav="goods">Shop Both Soaps — $10 &rarr;</a>
            <a class="btn btn-secondary" href="${siteMeta.phoneHref}">Need $0 Bee Rescue? Call ${siteMeta.phone}</a>
          </div>
          <p style="font-size:0.82rem;color:var(--muted);margin:0">Pick up free at Dunkin’ &amp; Pizza Hut (Madisonville) or Weigel’s (Vonore). No account required.</p>
        </div>

        <!-- Honest Bundle Convenience Anchor ($20 Both-Scents Pair) -->
        <aside class="dtc-bundle-box" aria-label="One-tap pickup pair">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem">
            <span class="eyebrow" style="margin:0">Convenient Two-Scent Pickup</span>
            <span class="pill-tag">$0 Shipping</span>
          </div>
          <h2 style="font-size:1.45rem;margin:0.35rem 0 0.2rem;font-weight:900">Try Both Scents in One Trip — $20.00</h2>
          <p style="margin:0;font-size:0.84rem;color:var(--muted)">1× Coconut Milk Delight (4oz) + 1× The True Soap (4oz). Exact retail total — zero fake discount, double the lather variety.</p>
          <div class="dtc-bundle-thumbs">
            <div class="dtc-bundle-thumb"><img src="../next/assets/soap-delight-bar-small.webp" alt="Coconut Milk Delight bar" /><strong style="font-size:0.82rem">Coconut Milk</strong><div style="font-size:0.74rem;color:var(--muted)">Teawood · $10</div></div>
            <strong style="font-size:1.5rem;color:var(--accent)">+</strong>
            <div class="dtc-bundle-thumb"><img src="../next/assets/soap-true-bar-small.webp" alt="The True Soap bar" /><strong style="font-size:0.82rem">The True Soap</strong><div style="font-size:0.74rem;color:var(--muted)">Vanilla &amp; Beeswax · $10</div></div>
          </div>
          <button type="button" class="btn btn-primary" style="width:100%" data-add-pair>Add Both 4oz Bars to Cart — $20.00</button>
        </aside>
      </div>
    </section>

    <!-- What's Inside vs Never Inside (Loss Aversion & Contrast Effect) -->
    <section class="section section-alt">
      <div class="wrap">
        <div class="section-head"><div><p class="eyebrow">Why Switch to Real Saponified Soap?</p><h2>Everything you want on your skin. Nothing you don’t.</h2></div><p>Every ingredient on our label is chosen for cleansing lather and bar longevity — explained without jargon.</p></div>
        <div class="dtc-contrast-grid">
          <div class="dtc-yes">
            <h3 style="margin:0 0 0.75rem;color:var(--accent-2)">&#10003; Inside The True Hive Bars</h3>
            <ul class="checklist">
              <li><strong>Real Coconut Milk, Shea &amp; Mango Butters</strong> (Coconut Milk Delight)</li>
              <li><strong>Local Beeswax &amp; Warm Vanilla / Tonka Bean</strong> (The True Soap)</li>
              <li><strong>Avocado, Coconut, Castor &amp; Sweet Almond Oils</strong></li>
              <li><strong>Fully Saponified:</strong> Lye turns oils into soap — <strong>zero lye remains</strong> in your finished bar</li>
              <li><strong>$0 Local Pickup Fees</strong> along US-411 in Madisonville &amp; Vonore</li>
            </ul>
          </div>
          <div class="dtc-no">
            <h3 style="margin:0 0 0.75rem;color:var(--muted)">&times; What We Leave Out</h3>
            <ul class="checklist" style="color:var(--muted)">
              <li>No mystery "syndet" synthetic detergent bricks pretending to be soap</li>
              <li>No hidden shipping charges added at the last step of checkout</li>
              <li>No fake countdown timers, fabricated reviews, or exaggerated medical claims</li>
              <li>No fake preorders on sold-out seasonal honey or candles</li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <section class="section"><div class="wrap">
      <div class="section-head"><div><p class="eyebrow">Shop Individual Bars &amp; Gift Molds</p><h2>Choose 4oz Everyday ($10) or Sculpted Wolf Mold ($12.50).</h2></div><a class="btn btn-secondary btn-sm" href="${navHref("goods")}" data-nav="goods">See Seasonal Radar &rarr;</a></div>
      <div class="grid-2">${products.map(renderProductCard).join("")}</div>
    </div></section>

    <section class="section section-alt"><div class="wrap"><div class="section-head"><div><p class="eyebrow">Community Apiary</p><h2>$0 Honeybee Rescue &amp; +24% Farm Pollination.</h2></div><p>Real East Tennessee beekeepers protecting local colonies.</p></div>${renderServicesCards(false)}</div></section>
  `;
}

function renderHomeLocalHearth() {
  return `
    <section class="lh-hero" aria-labelledby="home-h1">
      <div class="wrap">
        <p class="eyebrow">Madisonville &amp; Vonore &middot; Monroe, Blount &amp; Knox Counties, TN</p>
        <h1 id="home-h1" style="font-family:var(--font-display);font-size:clamp(2.2rem,4.5vw,3.6rem);line-height:1.08;max-width:20ch;margin:0 0 0.75rem">Your East Tennessee neighbors for handmade soap &amp; live honeybees.</h1>
        <p style="color:var(--muted);max-width:62ch;margin:0">Whether you’re grabbing small-batch bars along US-411 or calling us to relocate honeybees safely off your property for $0, start right here.</p>

        <!-- Dual Neighbor Doorway (Hick's Law 2-Second Self-Routing) -->
        <div class="lh-doorways">
          <article class="lh-door">
            <span class="pill-tag pill-stock" style="align-self:start">LOCAL SHOPPERS &middot; IN STOCK</span>
            <h2 style="font-family:var(--font-display);font-size:1.7rem;margin:0">Small-Batch Madisonville Soaps</h2>
            <p style="margin:0;color:var(--muted)">Coconut Milk Delight (Teawood) &amp; The True Soap (Vanilla, Tonka Bean &amp; Local Beeswax). $10 for 4oz Everyday Bars or $12.50 for Sculpted Wolf Molds — $0 US-411 pickup.</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.65rem">
              <a href="${navHref("product", "coconut-milk-delight")}" data-nav="product" data-slug="coconut-milk-delight" style="text-decoration:none;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:0.55rem;display:flex;gap:0.6rem;align-items:center">
                <img src="../next/assets/soap-delight-bar-small.webp" alt="Coconut Milk Delight" style="width:52px;height:52px;border-radius:8px;object-fit:cover" />
                <div><strong style="display:block;font-size:0.84rem">Coconut Milk</strong><span style="font-size:0.76rem;color:var(--accent);font-weight:700">From $10</span></div>
              </a>
              <a href="${navHref("product", "the-true-soap")}" data-nav="product" data-slug="the-true-soap" style="text-decoration:none;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:0.55rem;display:flex;gap:0.6rem;align-items:center">
                <img src="../next/assets/soap-true-bar-small.webp" alt="The True Soap" style="width:52px;height:52px;border-radius:8px;object-fit:cover" />
                <div><strong style="display:block;font-size:0.84rem">The True Soap</strong><span style="font-size:0.76rem;color:var(--accent);font-weight:700">From $10</span></div>
              </a>
            </div>
            <a class="btn btn-primary" style="margin-top:auto" href="${navHref("goods")}" data-nav="goods">Shop the Soap Shelf &rarr;</a>
          </article>

          <article class="lh-door lh-door-rescue">
            <span class="pill-tag pill-free" style="align-self:start">$0 FREE SERVICE &middot; TRI-COUNTY</span>
            <h2 style="font-family:var(--font-display);font-size:1.7rem;margin:0">Got Bees on Your Property?</h2>
            <p style="margin:0;color:var(--muted)">We relocate live honeybee colonies at <strong>zero cost</strong> in Monroe, Blount, and Knox counties — and offer research-backed farm pollination (+24% yield-gap closure in <em>Science</em>).</p>
            <img src="../next/assets/hive.webp" alt="Honeybees on comb" style="width:100%;height:118px;object-fit:cover;border-radius:10px" />
            <div style="display:flex;gap:0.55rem;flex-wrap:wrap;margin-top:auto">
              <a class="btn btn-primary" style="flex:1;background:var(--alert);border-color:var(--alert);color:#fff" href="${siteMeta.phoneHref}">Call ${siteMeta.phone}</a>
              <a class="btn btn-secondary" href="${navHref("services")}" data-nav="services">Bee vs. Wasp?</a>
            </div>
          </article>
        </div>
      </div>
    </section>

    <!-- Visual US-411 Pickup Corridor -->
    <section class="section section-alt" aria-labelledby="corridor-h">
      <div class="wrap">
        <p class="eyebrow">Zero-Stress Local Pickup</p>
        <h2 id="corridor-h" style="font-family:var(--font-display);font-size:clamp(1.75rem,3vw,2.5rem);margin:0 0 0.4rem">3 Easy Meetup Stops Along US-411</h2>
        <p style="margin:0;color:var(--muted);max-width:58ch">No hidden shipping fees and no guesswork. Pick your stop at checkout, wait for your confirmed window, and look for our <strong>${siteMeta.pickupVehicle}</strong>.</p>
        <div class="lh-corridor">
          ${pickupLocations
            .map(
              (l, idx) => `
            <article class="lh-stop">
              <span class="lh-stop-badge">US-411 Stop 0${idx + 1} &middot; ${esc(l.town)}</span>
              <h3 style="margin:0 0 0.25rem;font-size:1.15rem">${esc(l.shortName)}</h3>
              <p style="margin:0 0 0.35rem;font-weight:700;font-size:0.88rem">${esc(l.street)}, ${esc(l.city)}, TN ${esc(l.postalCode)}</p>
              <p style="margin:0;font-size:0.82rem;color:var(--muted)">${esc(l.mileNote)} &middot; $0 pickup fee</p>
            </article>
          `,
            )
            .join("")}
        </div>
      </div>
    </section>

    <section class="section"><div class="wrap">
      <div class="section-head"><div><p class="eyebrow">Order Local Soaps</p><h2>In stock right now.</h2></div><p>Transparent ingredients, honest pricing, and quick US-411 handoff.</p></div>
      <div class="grid-2">${products.map(renderProductCard).join("")}</div>
    </div></section>
    ${renderFaqSection(faqs)}
  `;
}

function renderHomeGalleryMinimal() {
  const staged = products.find((p) => p.slug === state.gallerySlug) || products[0];
  const stagedVar = activeVariantFor(staged);

  return `
    <section class="gm-hero" aria-labelledby="home-h1">
      <div class="wrap">
        <p class="eyebrow" style="color:var(--accent-2)">Madisonville, Tennessee</p>
        <h1 id="home-h1">Honest small-batch soap. Zero-cost bee rescue.</h1>
        <p style="color:var(--muted);max-width:52ch;margin:0 auto 1.75rem;font-size:1.05rem">
          Two transparent recipes poured in Madisonville ($10 bars, $12.50 sculpted Wolf Molds), free US-411 pickup, and live honeybee relocation across Monroe, Blount, and Knox counties.
        </p>
        <div style="display:flex;justify-content:center;gap:0.75rem;flex-wrap:wrap">
          <a class="btn btn-primary" href="#sculptural-stage">Explore the Soaps</a>
          <a class="btn btn-secondary" href="${navHref("services")}" data-nav="services">$0 Colony Rescue</a>
        </div>
      </div>
    </section>

    <!-- Oversized Gallery Stage (Cognitive Fluency & Calm Focus) -->
    <section id="sculptural-stage" class="section" style="padding-top:2rem">
      <div class="wrap">
        <div class="gm-tabs" role="tablist" aria-label="Switch showcased soap">
          ${products
            .map(
              (p) =>
                `<button type="button" class="gm-tab" role="tab" data-gallery-slug="${p.slug}" aria-selected="${p.slug === staged.slug}">${esc(p.title)} &mdash; From $10</button>`,
            )
            .join("")}
        </div>
        <div class="gm-stage-grid" style="padding-top:1rem">
          <div class="gm-stage-photo">
            <img src="${stagedVar.image}" alt="${esc(stagedVar.alt)}" />
            <span class="ai-ref-note">AI styling reference</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:1rem">
            <div>
              <p class="eyebrow" style="color:var(--accent-2)">${esc(staged.categoryLabel)} &middot; In Stock</p>
              <h2 style="font-size:clamp(1.8rem,3.2vw,2.6rem);font-weight:500;letter-spacing:-0.03em;margin:0 0 0.35rem">${esc(staged.title)}</h2>
              <p style="font-size:1.35rem;font-weight:700;margin:0">${formatMoney(stagedVar.priceMinor)} <span style="font-size:0.86rem;font-weight:400;color:var(--muted)">&middot; ${esc(stagedVar.label)}</span></p>
            </div>
            <p style="margin:0;color:var(--muted)">${esc(staged.story)}</p>
            ${renderVariantButtons(staged)}
            <div style="display:flex;gap:0.65rem;flex-wrap:wrap">
              <button type="button" class="btn btn-primary" style="flex:1" data-add-cart="${staged.slug}|${stagedVar.key}">Add to Cart — ${formatMoney(stagedVar.priceMinor)}</button>
              <a class="btn btn-secondary" href="${navHref("product", staged.slug)}" data-nav="product" data-slug="${staged.slug}">Full Formula</a>
            </div>
            <details class="faq-item" style="margin-top:0.25rem">
              <summary>Ingredients (${staged.ingredients.length}) &amp; Saponification Note</summary>
              <p>${esc(staged.ingredients.join(", "))}. Lye reacts completely with plant oils during curing so zero lye remains in the finished bar.</p>
            </details>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        <div class="grid-3" style="margin-bottom:3rem">
          <div><p class="eyebrow" style="color:var(--accent-2)">01 / Free Pickup</p><h3 style="margin:0 0 0.35rem;font-weight:600">Three US-411 Stops</h3><p style="margin:0;font-size:0.88rem;color:var(--muted)">Weigel’s (Vonore), Dunkin’ &amp; Pizza Hut (Madisonville). Look for our ${siteMeta.pickupVehicle}.</p></div>
          <div><p class="eyebrow" style="color:var(--accent-2)">02 / $0 Bee Rescue</p><h3 style="margin:0 0 0.35rem;font-weight:600">Monroe, Blount &amp; Knox</h3><p style="margin:0;font-size:0.88rem;color:var(--muted)">No-cost live honeybee relocation. Call <a href="${siteMeta.phoneHref}" style="font-weight:700">${siteMeta.phone}</a>.</p></div>
          <div><p class="eyebrow" style="color:var(--accent-2)">03 / Pollination</p><h3 style="margin:0 0 0.35rem;font-weight:600">+24% Yield-Gap Data</h3><p style="margin:0;font-size:0.88rem;color:var(--muted)">Backed by a <a href="${siteMeta.scienceCitation.url}" target="_blank" rel="noopener noreferrer">2016 Science study</a> on fields &lt; 5 acres.</p></div>
        </div>
        ${renderServicesCards(false)}
      </div>
    </section>
  `;
}

/* ============================================================================
   5 DISTINCT SHOP (/goods) & PRODUCT DETAIL (/goods/[slug]) EXPERIENCES
   ============================================================================ */
function renderGoodsPage() {
  // 02 — Cinematic Craft: Editorial Botanical Lookbook Shop
  if (state.proto === "story-flagship") {
    return `
      <section class="sf-shop-banner">
        <div class="wrap">
          <nav class="breadcrumbs"><a href="${navHref("home")}" data-nav="home">Home</a> / <span>Soap Atelier</span></nav>
          <p class="eyebrow">From the Madisonville Soap Room</p>
          <h1 style="font-family:var(--font-display);font-size:clamp(2.2rem,4.5vw,3.5rem);font-weight:400;margin:0 0 0.6rem">Small-batch soaps, poured by hand.</h1>
          <p style="color:var(--muted);max-width:56ch;margin:0">Compare creaminess, scent warmth, and bar firmness across both recipes — available in Everyday 4oz Bars ($10) or Sculpted Wolf Molds ($12.50) with $0 US-411 pickup.</p>
        </div>
      </section>
      <section class="section"><div class="wrap">
        ${products
          .map((p) => {
            const v = activeVariantFor(p);
            return `
              <article class="sf-arch-card">
                <a class="sf-arch-frame" href="${navHref("product", p.slug)}" data-nav="product" data-slug="${p.slug}">
                  <img src="${v.image}" alt="${esc(v.alt)}" />
                  <span class="ai-ref-note">AI styling reference</span>
                </a>
                <div>
                  <span class="pill-tag pill-stock" style="margin-bottom:0.6rem">In Stock &middot; $0 Pickup</span>
                  <h2 style="font-family:var(--font-display);font-size:2.1rem;font-weight:400;margin:0 0 0.25rem"><a href="${navHref("product", p.slug)}" data-nav="product" data-slug="${p.slug}" style="text-decoration:none">${esc(p.title)}</a> — <span style="color:var(--accent)">${formatMoney(v.priceMinor)}</span></h2>
                  <p style="font-weight:700;color:var(--muted);margin:0 0 0.65rem">${esc(p.scentLine)}</p>
                  <p style="margin:0 0 0.85rem;color:var(--muted)">${esc(p.story)}</p>
                  <div class="sf-meters" aria-label="Sensory profile">
                    <div class="sf-meter-row"><span>Creaminess</span><div class="sf-meter-track"><div class="sf-meter-fill" style="width:${p.meters.richness}%"></div></div></div>
                    <div class="sf-meter-row"><span>Scent Warmth</span><div class="sf-meter-track"><div class="sf-meter-fill" style="width:${p.meters.warmth}%"></div></div></div>
                    <div class="sf-meter-row"><span>Bar Firmness</span><div class="sf-meter-track"><div class="sf-meter-fill" style="width:${p.meters.firmness}%"></div></div></div>
                  </div>
                  ${renderVariantButtons(p)}
                  <div style="display:flex;gap:0.65rem;flex-wrap:wrap;margin-top:0.9rem">
                    <button type="button" class="btn btn-primary" style="flex:1" data-add-cart="${p.slug}|${v.key}">Add to Cart — ${formatMoney(v.priceMinor)}</button>
                    <a class="btn btn-secondary" href="${navHref("product", p.slug)}" data-nav="product" data-slug="${p.slug}">Botanical Dossier &rarr;</a>
                  </div>
                </div>
              </article>
            `;
          })
          .join("")}
        <div class="card-box" style="border-style:dashed;margin-top:2rem">
          <p class="eyebrow">Seasonal Apiary Waitlist (Currently Sold Out)</p>
          <div class="grid-2">${seasonalRadar.map((r) => `<div><strong>${esc(r.title)} (${esc(r.priceLabel)})</strong> &middot; <span style="font-size:0.84rem;color:var(--muted)">${esc(r.format)} — ${esc(r.note)}</span></div>`).join("")}</div>
        </div>
      </div></section>
    `;
  }

  // 03 — Modern DTC: High-Velocity Pack Builder + Comparison Shelf
  if (state.proto === "modern-dtc") {
    return `
      <section class="section"><div class="wrap">
        <nav class="breadcrumbs"><a href="${navHref("home")}" data-nav="home">Home</a> / <span>Shop</span></nav>
        <p class="eyebrow">Fast Local Pickup Shop &middot; $0 Shipping</p>
        <h1 style="font-size:clamp(2rem,4.2vw,3.2rem);font-weight:900;letter-spacing:-0.03em;margin:0 0 1.25rem">Build your US-411 Soap Pickup Pack.</h1>

        <aside class="dtc-pack-bar" aria-label="One-tap pickup bundles">
          <div>
            <span class="pill-tag pill-stock" style="margin-bottom:0.5rem">CONVENIENT TWO-SCENT PICKUP</span>
            <h2 style="font-size:1.55rem;font-weight:900;margin:0 0 0.35rem">One trip along US-411, both signature scents.</h2>
            <p style="margin:0;color:var(--muted);font-size:0.9rem">Grab 1× Coconut Milk Delight + 1× The True Soap in a single click — exact honest pricing, zero shipping fees, zero fake discounts.</p>
          </div>
          <div class="dtc-pack-btns">
            <button type="button" class="btn btn-primary" data-add-pair>Add Both 4oz Everyday Bars — $20.00</button>
            <button type="button" class="btn btn-secondary" data-add-wolf-pair>Add Both Sculpted Wolf Molds — $25.00</button>
          </div>
        </aside>

        <h2 style="font-size:1.35rem;font-weight:800;margin:0 0 1rem">Or pick individual bars &amp; gift molds:</h2>
        <div class="grid-2">${products.map(renderProductCard).join("")}</div>

        <div style="overflow-x:auto">
          <table class="dtc-compare-table" aria-label="Side-by-side soap comparison">
            <thead><tr><th>Compare</th><th>Coconut Milk Delight</th><th>The True Soap</th></tr></thead>
            <tbody>
              <tr><td><strong>Scent</strong></td><td>Warm Teawood &amp; Coconut Milk</td><td>Warm Vanilla &amp; Toasted Tonka Bean</td></tr>
              <tr><td><strong>Key Oils / Butters</strong></td><td>Shea + Mango Butter, Coconut Milk, Sweet Almond</td><td>Local Beeswax, Avocado, Palm, Coconut, Castor</td></tr>
              <tr><td><strong>Best For</strong></td><td>Ultra-creamy, silky everyday lather</td><td>Classic firm beeswax bar with warm sweet aroma</td></tr>
              <tr><td><strong>Formats</strong></td><td>4oz Bar ($10) &middot; Wolf Mold ($12.50)</td><td>4oz Bar ($10) &middot; Wolf Mold ($12.50)</td></tr>
            </tbody>
          </table>
        </div>

        <div style="margin-top:2rem"><p class="eyebrow">Seasonal Radar (Sold Out)</p><div class="grid-2">${seasonalRadar.map((r) => `<article class="card-box" style="border-style:dashed"><span class="pill-tag">${esc(r.statusLabel)}</span><h3 style="margin:0.45rem 0 0.2rem">${esc(r.title)} — ${esc(r.priceLabel)}</h3><p style="margin:0;font-size:0.86rem;color:var(--muted)">${esc(r.format)} &middot; ${esc(r.note)}</p></article>`).join("")}</div></div>
      </div></section>
    `;
  }

  // 04 — East TN Hearth: Neighborhood Farmstand Market Shop
  if (state.proto === "local-hearth") {
    return `
      <section class="section"><div class="wrap">
        <nav class="breadcrumbs"><a href="${navHref("home")}" data-nav="home">Home</a> / <span>Neighborhood Shop</span></nav>
        <p class="eyebrow">Madisonville &amp; Vonore &middot; Direct From Your Neighbors</p>
        <h1 style="font-family:var(--font-display);font-size:clamp(2rem,4vw,3.1rem);margin:0 0 0.85rem">Fresh on the shelf for US-411 pickup.</h1>
        <div class="lh-market-strip">
          <strong>Free Pickup Stops:</strong>
          ${pickupLocations.map((l) => `<span class="pill-tag">${esc(l.shortName)} (${esc(l.town)})</span>`).join("")}
          <span style="color:var(--muted);margin-left:auto">Look for our ${siteMeta.pickupVehicle}</span>
        </div>

        <div class="grid-2">${products.map(renderProductCard).join("")}</div>

        <aside class="card-box" style="margin-top:2rem;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:1rem">
          <div style="max-width:60ch">
            <p class="eyebrow">Connected by Bees</p>
            <h2 style="font-family:var(--font-display);font-size:1.5rem;margin:0 0 0.3rem">Every bar supports working East Tennessee beekeeping.</h2>
            <p style="margin:0;color:var(--muted);font-size:0.9rem">We rescue live honeybee colonies across Monroe, Blount, and Knox counties at $0 cost to homeowners.</p>
          </div>
          <a class="btn btn-secondary" href="${navHref("services")}" data-nav="services">See $0 Bee Rescue &rarr;</a>
        </aside>

        <section class="lh-chalkboard" aria-label="Seasonal Farmstand Chalkboard">
          <p class="eyebrow" style="color:#ffd479">Seasonal Farmstand Chalkboard (Currently Sold Out)</p>
          <h2 style="font-family:var(--font-display);font-size:1.55rem;margin:0 0 0.85rem">What’s resting until the next batch or harvest</h2>
          ${seasonalRadar
            .map(
              (r) => `<div class="lh-chalk-row">
                <div><strong>${esc(r.title)}</strong> (${esc(r.format)} &middot; ${esc(r.priceLabel)})<div style="font-size:0.84rem;opacity:0.85">${esc(r.note)}</div></div>
                <a class="btn btn-sm" style="background:#fff;color:#141a16" href="${navHref("contact")}" data-nav="contact">Ask About Next Batch</a>
              </div>`,
            )
            .join("")}
        </section>
      </div></section>
    `;
  }

  // 05 — Studio Minimal: Museum Plinth Gallery + Format Filter + Formula Index
  if (state.proto === "gallery-minimal") {
    return `
      <section class="section"><div class="wrap">
        <nav class="breadcrumbs"><a href="${navHref("home")}" data-nav="home">Home</a> / <span>Catalog</span></nav>
        <div class="gm-shop-bar">
          <div>
            <p class="eyebrow" style="color:var(--accent-2)">Collection / Madisonville</p>
            <h1 style="font-size:clamp(2rem,4vw,3.1rem);font-weight:500;letter-spacing:-0.03em;margin:0">Small-Batch Soaps</h1>
          </div>
          <div style="display:flex;gap:0.45rem;flex-wrap:wrap" role="group" aria-label="Filter by format">
            ${[
              ["all", "All Formats"],
              ["bar", "4oz Bars ($10)"],
              ["wolf", "Wolf Molds ($12.50)"],
            ]
              .map(
                ([k, lbl]) =>
                  `<button type="button" class="btn btn-sm ${state.minimalFormat === k ? "btn-primary" : "btn-secondary"}" data-minimal-format="${k}" aria-pressed="${state.minimalFormat === k}">${lbl}</button>`,
              )
              .join("")}
          </div>
        </div>

        <div class="gm-plinth-grid">
          ${products
            .map((p) => {
              const v =
                state.minimalFormat === "bar"
                  ? p.variants[0]
                  : state.minimalFormat === "wolf"
                    ? p.variants[1]
                    : activeVariantFor(p);
              return `
                <article class="gm-plinth">
                  <a class="gm-plinth-media" href="${navHref("product", p.slug)}" data-nav="product" data-slug="${p.slug}">
                    <img src="${v.image}" alt="${esc(v.alt)}" />
                    <span class="ai-ref-note">AI styling reference</span>
                  </a>
                  <div style="display:flex;justify-content:space-between;align-items:baseline;gap:1rem">
                    <div>
                      <h2 style="font-size:1.35rem;font-weight:600;margin:0"><a href="${navHref("product", p.slug)}" data-nav="product" data-slug="${p.slug}" style="text-decoration:none">${esc(p.title)}</a></h2>
                      <p style="margin:0.15rem 0 0;font-size:0.86rem;color:var(--muted)">${esc(p.scentLine)} &middot; ${esc(v.shortLabel)}</p>
                    </div>
                    <strong style="font-size:1.15rem">${formatMoney(v.priceMinor)}</strong>
                  </div>
                  ${state.minimalFormat === "all" ? renderVariantButtons(p) : ""}
                  <div style="display:flex;gap:0.6rem">
                    <button type="button" class="btn btn-primary" style="flex:1" data-add-cart="${p.slug}|${v.key}">Add — ${formatMoney(v.priceMinor)}</button>
                    <a class="btn btn-secondary" href="${navHref("product", p.slug)}" data-nav="product" data-slug="${p.slug}">Formula</a>
                  </div>
                </article>
              `;
            })
            .join("")}
        </div>

        <table class="gm-index-table" aria-label="Complete catalog index">
          <thead><tr><th>Edition</th><th>Format</th><th>Key Notes</th><th>Status</th><th>Price</th></tr></thead>
          <tbody>
            ${products.map((p) => `<tr><td><a href="${navHref("product", p.slug)}" data-nav="product" data-slug="${p.slug}" style="font-weight:700">${esc(p.title)}</a></td><td>4oz Bar / Wolf Mold</td><td>${esc(p.scentLine)}</td><td>In Stock ($0 Pickup)</td><td>$10.00 – $12.50</td></tr>`).join("")}
            ${seasonalRadar.map((r) => `<tr style="color:var(--muted)"><td>${esc(r.title)}</td><td>${esc(r.format)}</td><td>${esc(r.statusLabel)}</td><td>Sold Out</td><td>${esc(r.priceLabel)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div></section>
    `;
  }

  // 01 — Golden Apothecary: Balanced Apothecary Storefront with Category Filter
  const filtered = state.storeFilter === "all" || state.storeFilter === "soap" ? products : [];
  return `
    <section class="section"><div class="wrap">
      <nav class="breadcrumbs"><a href="${navHref("home")}" data-nav="home">Home</a> / <span>Store</span></nav>
      <div class="section-head">
        <div><p class="eyebrow">The True Hive Apothecary &middot; Local Pickup Only</p><h1 style="font-family:var(--font-display);font-size:clamp(2rem,4vw,3.1rem);margin:0 0 0.45rem">Small-batch soaps, ready along US-411.</h1><p>Everyday 4oz Bars ($10) and Sculpted Wolf Gift Molds ($12.50) with full ingredient transparency.</p></div>
        <div style="display:flex;gap:0.45rem;flex-wrap:wrap">
          ${[["all", "All Goods (4)"], ["soap", "In-Stock Soaps (2)"], ["seasonal", "Seasonal Radar (2)"]].map(([k, lbl]) => `<button type="button" class="btn btn-sm ${state.storeFilter === k ? "btn-primary" : "btn-secondary"}" data-store-filter="${k}" aria-pressed="${state.storeFilter === k}">${lbl}</button>`).join("")}
        </div>
      </div>
      ${filtered.length ? `<div class="grid-2">${filtered.map(renderProductCard).join("")}</div>` : ""}
      ${
        state.storeFilter === "all" || state.storeFilter === "seasonal"
          ? `<div style="margin-top:2.5rem"><p class="eyebrow">Seasonal &amp; Next-Batch Radar (Currently Sold Out)</p><div class="grid-2">${seasonalRadar.map((r) => `<article class="card-box" style="border-style:dashed"><span class="pill-tag" style="margin-bottom:0.5rem">${esc(r.statusLabel)}</span><h3 style="margin:0 0 0.25rem">${esc(r.title)} — ${esc(r.priceLabel)}</h3><p style="margin:0;color:var(--muted);font-size:0.86rem"><strong>${esc(r.format)}:</strong> ${esc(r.note)}</p></article>`).join("")}</div></div>`
          : ""
      }
    </div></section>
    ${renderPickupSection()}
  `;
}

function renderProductPage() {
  const p = products.find((x) => x.slug === state.slug) || products[0];
  const v = activeVariantFor(p);
  const other = products.find((x) => x.slug !== p.slug);

  // 02 — Cinematic Craft: Arched Editorial PDP + Botanical Dossier
  if (state.proto === "story-flagship") {
    return `
      <section class="section"><div class="wrap">
        <nav class="breadcrumbs"><a href="${navHref("home")}" data-nav="home">Home</a> / <a href="${navHref("goods")}" data-nav="goods">Soap Atelier</a> / <span>${esc(p.title)}</span></nav>
        <div class="sf-arch-card">
          <div class="sf-arch-frame"><img src="${v.image}" alt="${esc(v.alt)}" /><span class="ai-ref-note">AI styling reference</span></div>
          <div>
            <p class="eyebrow">${esc(p.categoryLabel)} &middot; Madisonville, TN</p>
            <h1 style="font-family:var(--font-display);font-size:clamp(2.1rem,4vw,3.2rem);font-weight:400;margin:0 0 0.3rem">${esc(p.title)}</h1>
            <p style="font-size:1.5rem;font-weight:700;color:var(--accent);margin:0 0 0.85rem">${formatMoney(v.priceMinor)} <span style="font-size:0.88rem;color:var(--muted);font-weight:500">&middot; ${esc(v.label)}</span></p>
            <p style="color:var(--muted);margin:0 0 1rem">${esc(p.story)}</p>
            <div class="sf-meters">
              <div class="sf-meter-row"><span>Creaminess</span><div class="sf-meter-track"><div class="sf-meter-fill" style="width:${p.meters.richness}%"></div></div></div>
              <div class="sf-meter-row"><span>Scent Warmth</span><div class="sf-meter-track"><div class="sf-meter-fill" style="width:${p.meters.warmth}%"></div></div></div>
              <div class="sf-meter-row"><span>Bar Firmness</span><div class="sf-meter-track"><div class="sf-meter-fill" style="width:${p.meters.firmness}%"></div></div></div>
            </div>
            ${renderVariantButtons(p)}
            <div style="display:flex;gap:0.7rem;flex-wrap:wrap;margin-top:1rem">
              <button type="button" class="btn btn-primary" style="flex:1" data-add-cart="${p.slug}|${v.key}">Add to Cart — ${formatMoney(v.priceMinor)}</button>
              <a class="btn btn-secondary" href="${navHref("cart")}" data-nav="cart">US-411 Pickup</a>
            </div>
          </div>
        </div>
        <p class="eyebrow" style="margin-top:2.2rem">Botanical Dossier &middot; Every Ingredient Explained</p>
        <div class="sf-dossier-strip">${p.ingredients.map((i) => `<div class="sf-dossier-item"><strong>${esc(i)}</strong><p style="margin:0.3rem 0 0;font-size:0.82rem;color:var(--muted)">${esc(ingredientNotes[i] || "")}</p></div>`).join("")}</div>
      </div></section>
    `;
  }

  // 03 — Modern DTC: Conversion PDP with 1-Click $20 Pair Upsell
  if (state.proto === "modern-dtc") {
    return `
      <section class="section"><div class="wrap">
        <nav class="breadcrumbs"><a href="${navHref("home")}" data-nav="home">Home</a> / <a href="${navHref("goods")}" data-nav="goods">Shop</a> / <span>${esc(p.title)}</span></nav>
        <div class="grid-2" style="align-items:start">
          <div class="card-box" style="padding:0;overflow:hidden">
            <img src="${v.image}" alt="${esc(v.alt)}" style="width:100%;aspect-ratio:4/3;object-fit:cover" />
            <div class="ga-thumbs">${p.variants.map((vr) => `<button type="button" class="ga-thumb" data-select-variant="${p.slug}|${vr.key}" aria-pressed="${vr.key === v.key}"><img src="${vr.small}" alt="${esc(vr.shortLabel)}" />${esc(vr.shortLabel)} (${formatMoney(vr.priceMinor)})</button>`).join("")}</div>
          </div>
          <div>
            <span class="pill-tag pill-stock" style="margin-bottom:0.55rem">IN STOCK &middot; $0 US-411 PICKUP</span>
            <h1 style="font-size:clamp(2rem,4vw,3rem);font-weight:900;letter-spacing:-0.03em;margin:0 0 0.35rem">${esc(p.title)}</h1>
            <p style="font-size:1.55rem;font-weight:900;color:var(--accent);margin:0 0 0.85rem">${formatMoney(v.priceMinor)} <span style="font-size:0.88rem;color:var(--muted);font-weight:600">&middot; ${esc(v.label)}</span></p>
            <p style="margin:0 0 1rem;color:var(--muted)">${esc(p.story)}</p>
            ${renderVariantButtons(p)}
            <button type="button" class="btn btn-primary" style="width:100%;margin-top:1rem" data-add-cart="${p.slug}|${v.key}">Add to Cart — ${formatMoney(v.priceMinor)}</button>
            <div class="dtc-upsell-box">
              <div><strong>Want both scents in 1 pickup trip?</strong><div style="font-size:0.82rem;color:var(--muted)">Add Coconut Milk Delight + The True Soap (4oz bars) for $20.00.</div></div>
              <button type="button" class="btn btn-accent2 btn-sm" data-add-pair>Add Both ($20)</button>
            </div>
            <h2 style="font-size:1.05rem;font-weight:800;margin:1.35rem 0 0.5rem">Full Transparent Ingredients (Zero Lye Remains After Curing):</h2>
            <ul class="checklist" style="color:var(--muted)">${p.ingredients.map((i) => `<li><strong>${esc(i)}:</strong> ${esc(ingredientNotes[i] || "")}</li>`).join("")}</ul>
          </div>
        </div>
      </div></section>
    `;
  }

  // 04 — East TN Hearth: Neighbor Maker PDP with Live US-411 Pickup Selector
  if (state.proto === "local-hearth") {
    return `
      <section class="section"><div class="wrap">
        <nav class="breadcrumbs"><a href="${navHref("home")}" data-nav="home">Home</a> / <a href="${navHref("goods")}" data-nav="goods">Neighborhood Shop</a> / <span>${esc(p.title)}</span></nav>
        <div class="grid-2" style="align-items:start">
          <figure class="card-box" style="padding:0;overflow:hidden;margin:0">
            <img src="${v.image}" alt="${esc(v.alt)}" style="width:100%;aspect-ratio:4/3;object-fit:cover" />
            <figcaption style="padding:0.75rem 1rem;font-size:0.8rem;color:var(--muted)">AI styling reference &middot; Made in Madisonville, TN</figcaption>
          </figure>
          <div>
            <p class="eyebrow">Made Right Here in Madisonville</p>
            <h1 style="font-family:var(--font-display);font-size:clamp(2rem,4vw,3rem);margin:0 0 0.35rem">${esc(p.title)}</h1>
            <p style="font-size:1.5rem;font-weight:800;color:var(--accent);margin:0 0 0.9rem">${formatMoney(v.priceMinor)} &middot; <span style="font-size:0.9rem;color:var(--muted)">${esc(v.label)}</span></p>
            <p style="color:var(--muted);margin:0 0 1rem">${esc(p.story)}</p>
            ${renderVariantButtons(p)}
            <button type="button" class="btn btn-primary" style="width:100%;margin:1rem 0" data-add-cart="${p.slug}|${v.key}">Add to Cart for Local Pickup — ${formatMoney(v.priceMinor)}</button>
            <div class="card-box" style="background:var(--surface-alt)">
              <strong style="display:block;margin-bottom:0.45rem;font-size:0.9rem">Pick Your Free US-411 Meetup Stop:</strong>
              ${pickupLocations.map((loc) => `<label class="pickup-radio" for="pdp-pk-${loc.key}"><input id="pdp-pk-${loc.key}" type="radio" name="pdp-pickup" value="${loc.key}" ${state.pickupKey === loc.key ? "checked" : ""} data-pickup-select="${loc.key}" /><span><strong>${esc(loc.shortName)} (${esc(loc.town)})</strong> — ${esc(loc.street)}</span></label>`).join("")}
              <p style="margin:0.4rem 0 0;font-size:0.78rem;color:var(--muted)">Wait for your confirmed time window and look for our ${siteMeta.pickupVehicle}. Questions? Call <a href="${siteMeta.phoneHref}" style="font-weight:700">${siteMeta.phone}</a>.</p>
            </div>
          </div>
        </div>
        <section style="margin-top:2.4rem"><h2 style="font-family:var(--font-display);font-size:1.75rem;margin:0 0 0.9rem">Plain-English Ingredient List</h2><div class="grid-3">${p.ingredients.map((i) => `<div class="card-box"><strong>${esc(i)}</strong><p style="margin:0.3rem 0 0;font-size:0.84rem;color:var(--muted)">${esc(ingredientNotes[i] || "")}</p></div>`).join("")}</div></section>
      </div></section>
    `;
  }

  // 05 — Studio Minimal: 60/40 Gallery Monograph PDP with Clean Accordions
  if (state.proto === "gallery-minimal") {
    return `
      <section class="section"><div class="wrap">
        <nav class="breadcrumbs"><a href="${navHref("home")}" data-nav="home">Home</a> / <a href="${navHref("goods")}" data-nav="goods">Catalog</a> / <span>${esc(p.title)}</span></nav>
        <div class="gm-pdp-split">
          <div class="gm-stage-photo"><img src="${v.image}" alt="${esc(v.alt)}" /><span class="ai-ref-note">AI styling reference</span></div>
          <div style="display:flex;flex-direction:column;gap:1.1rem">
            <div>
              <p class="eyebrow" style="color:var(--accent-2)">${esc(p.categoryLabel)} &middot; In Stock</p>
              <h1 style="font-size:clamp(2rem,3.6vw,2.9rem);font-weight:500;letter-spacing:-0.03em;margin:0 0 0.35rem">${esc(p.title)}</h1>
              <p style="font-size:1.35rem;font-weight:600;margin:0">${formatMoney(v.priceMinor)} <span style="font-size:0.86rem;font-weight:400;color:var(--muted)">&middot; ${esc(v.label)}</span></p>
            </div>
            <p style="margin:0;color:var(--muted)">${esc(p.story)}</p>
            ${renderVariantButtons(p)}
            <button type="button" class="btn btn-primary" data-add-cart="${p.slug}|${v.key}">Add to Cart — ${formatMoney(v.priceMinor)}</button>
            <div class="faq-list" style="margin-top:0.5rem">
              <details class="faq-item" open><summary>Formula &amp; Saponification (${p.ingredients.length} ingredients)</summary><p>${esc(p.ingredients.join(", "))}. Lye fully reacts with plant oils during curing so zero lye remains in the finished bar.</p></details>
              <details class="faq-item"><summary>US-411 Local Pickup ($0 Fee)</summary><p>Weigel’s (Vonore), Dunkin’ or Pizza Hut (Madisonville) by confirmed window. Look for our ${siteMeta.pickupVehicle}.</p></details>
              <details class="faq-item"><summary>Visual Reference Disclosure</summary><p>${esc(v.alt)} ${esc(p.weightAuditNote)}</p></details>
            </div>
          </div>
        </div>
      </div></section>
    `;
  }

  // 01 — Golden Apothecary: Balanced Apothecary PDP with Live Variant Thumbnails
  return `
    <section class="section"><div class="wrap">
      <nav class="breadcrumbs"><a href="${navHref("home")}" data-nav="home">Home</a> / <a href="${navHref("goods")}" data-nav="goods">Store</a> / <span>${esc(p.title)}</span></nav>
      <div class="grid-2" style="align-items:start">
        <figure class="card-box" style="padding:0;overflow:hidden;margin:0">
          <img src="${v.image}" alt="${esc(v.alt)}" style="width:100%;aspect-ratio:4/3;object-fit:cover" />
          <div class="ga-thumbs">${p.variants.map((vr) => `<button type="button" class="ga-thumb" data-select-variant="${p.slug}|${vr.key}" aria-pressed="${vr.key === v.key}"><img src="${vr.small}" alt="${esc(vr.shortLabel)}" />${esc(vr.shortLabel)} · ${formatMoney(vr.priceMinor)}</button>`).join("")}</div>
          <figcaption style="padding:0.75rem 1rem;font-size:0.78rem;color:var(--muted);border-top:1px solid var(--border)"><strong>Transparent Visual Note:</strong> ${esc(v.alt)}</figcaption>
        </figure>
        <div>
          <span class="pill-tag pill-stock" style="margin-bottom:0.65rem">In Stock &middot; $0 Local Pickup</span>
          <h1 style="font-family:var(--font-display);font-size:clamp(2rem,4vw,3rem);line-height:1.08;margin:0 0 0.4rem">${esc(p.title)}</h1>
          <p style="font-size:1.55rem;font-weight:800;color:var(--accent);margin:0 0 0.9rem">${formatMoney(v.priceMinor)} <span style="font-size:0.88rem;font-weight:600;color:var(--muted)">&middot; ${esc(v.label)}</span></p>
          <p style="margin:0 0 1rem">${esc(p.story)}</p>
          ${renderSensoryProfile(p)}
          ${renderVariantButtons(p)}
          <div style="display:flex;flex-wrap:wrap;gap:0.75rem;margin:1.2rem 0">
            <button type="button" class="btn btn-primary" style="flex:1" data-add-cart="${p.slug}|${v.key}">Add to Cart — ${formatMoney(v.priceMinor)}</button>
            <a class="btn btn-secondary" href="${navHref("cart")}" data-nav="cart">Cart &amp; Pickup</a>
          </div>
          <ul class="checklist" style="color:var(--muted)">${p.details.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>
          <p style="font-size:0.76rem;color:var(--muted);margin-top:0.7rem">${esc(p.weightAuditNote)}</p>
        </div>
      </div>
      <section style="margin-top:2.8rem">
        <p class="eyebrow">Every Ingredient Explained</p>
        <h2 style="font-family:var(--font-display);font-size:1.8rem;margin:0 0 0.9rem">What’s inside ${esc(p.title)}</h2>
        <div class="grid-3">${p.ingredients.map((i) => `<div class="card-box"><strong>${esc(i)}</strong><p style="margin:0.3rem 0 0;font-size:0.84rem;color:var(--muted)">${esc(ingredientNotes[i] || "")}</p></div>`).join("")}</div>
      </section>
      ${other ? `<section style="margin-top:2.6rem"><p class="eyebrow">Pair Your Pickup ($0 Extra Fee)</p><div style="max-width:560px">${renderProductCard(other)}</div></section>` : ""}
    </div></section>
  `;
}

function renderServicesPage() {
  return `
    <section class="section"><div class="wrap">
      <nav class="breadcrumbs"><a href="${navHref("home")}" data-nav="home">Home</a> / <span>Beekeeping Services</span></nav>
      <div class="section-head"><div><p class="eyebrow">Monroe, Blount &amp; Knox Counties</p><h1 style="font-family:var(--font-display);font-size:clamp(2rem,4vw,3.2rem);margin:0 0 0.45rem">Free honeybee rescue. Research-backed farm pollination.</h1><p>Call us directly at <strong>${siteMeta.phone}</strong> or check whether it’s a honeybee below.</p></div><a class="btn btn-primary" href="${siteMeta.phoneHref}">Call ${siteMeta.phone}</a></div>
      ${renderServicesCards(true)}
      ${renderBeeHelper()}
    </div></section>
    ${renderFaqSection(faqs.filter((f) => f.category === "services"), "Colony Rescue & Pollination Questions")}
  `;
}

function renderAboutPage() {
  return `
    <section class="section"><div class="wrap">
      <nav class="breadcrumbs"><a href="${navHref("home")}" data-nav="home">Home</a> / <span>About Us</span></nav>
      <div class="grid-2" style="align-items:center">
        <div>
          <p class="eyebrow">Madisonville, Tennessee</p>
          <h1 style="font-family:var(--font-display);font-size:clamp(2rem,4vw,3.1rem);margin:0 0 0.9rem">Local roots. Real beeswax. Connected by bees.</h1>
          <p style="color:var(--muted)">Based in Madisonville, Tennessee, The True Hive brings small-batch soap-making and working beekeeping together — starting with our vanilla-and-tonka recipe (<em>The True Soap</em>) and extending to $0 colony rescue and farm pollination across East Tennessee.</p>
          <div style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-top:1.2rem"><a class="btn btn-primary" href="${navHref("goods")}" data-nav="goods">Shop the Soaps</a><a class="btn btn-secondary" href="${navHref("services")}" data-nav="services">Explore Bee Services</a></div>
        </div>
        <figure class="card-box" style="padding:0;overflow:hidden;margin:0"><img src="../next/assets/hive.webp" alt="Honeybees on comb in Madisonville" /><figcaption style="padding:0.75rem 1rem;font-size:0.8rem;color:var(--muted)">Our Madisonville apiary — connecting everyday soaps with living hives.</figcaption></figure>
      </div>
    </div></section>
  `;
}

function renderCartPage() {
  const items = getCart();
  const subtotal = getCartSubtotal();
  const chosen = pickupLocations.find((l) => l.key === state.pickupKey) || pickupLocations[0];
  return `
    <section class="section"><div class="wrap">
      <nav class="breadcrumbs"><a href="${navHref("home")}" data-nav="home">Home</a> / <span>Cart &amp; Pickup</span></nav>
      <h1 style="font-family:var(--font-display);font-size:clamp(2rem,4vw,3rem);margin:0 0 1.25rem">Your Cart &amp; Free US-411 Pickup</h1>
      <div class="grid-2" style="align-items:start">
        <div>
          ${
            items.length === 0
              ? `<div class="card-box"><h2 style="margin:0 0 0.4rem;font-family:var(--font-display)">Your cart is empty</h2><p style="margin:0 0 1rem;color:var(--muted)">Start with Coconut Milk Delight or The True Soap from $10.00.</p><a class="btn btn-primary" href="${navHref("goods")}" data-nav="goods">Shop In-Stock Soaps &rarr;</a></div>`
              : `${items.map((i) => `<article class="cart-line"><img src="${i.image}" alt="${esc(i.productTitle)}" /><div style="flex:1"><strong>${esc(i.productTitle)}</strong> — <strong>${formatMoney(i.priceMinor * i.qty)}</strong><div style="font-size:0.84rem;color:var(--muted)">${esc(i.variantLabel)}</div><div style="display:inline-flex;align-items:center;gap:0.45rem;margin-top:0.45rem"><button type="button" class="qty-btn" data-qty-delta="${i.variantKey}|-1">&minus;</button><span>${i.qty}</span><button type="button" class="qty-btn" data-qty-delta="${i.variantKey}|1">+</button></div></div></article>`).join("")}<button type="button" class="btn btn-secondary btn-sm" data-clear-cart>Clear Cart</button>`
          }
        </div>
        <aside class="card-box" style="border-color:var(--border-strong)">
          <h2 style="font-family:var(--font-display);font-size:1.45rem;margin:0 0 0.45rem">Choose Your Free US-411 Meetup</h2>
          <p style="margin:0 0 0.8rem;font-size:0.84rem;color:var(--muted)">Confirmed meetup points, not a walk-in shop. $0 shipping.</p>
          ${pickupLocations.map((loc) => `<label class="pickup-radio" for="pk-${loc.key}"><input id="pk-${loc.key}" type="radio" name="pickup" value="${loc.key}" ${state.pickupKey === loc.key ? "checked" : ""} data-pickup-select="${loc.key}" /><span><strong>${esc(loc.name)}</strong><br /><span style="color:var(--muted)">${esc(loc.street)}, ${esc(loc.city)}, TN ${esc(loc.postalCode)}</span></span></label>`).join("")}
          <div style="padding:0.8rem;border-radius:var(--radius-sm);background:var(--surface-alt);font-size:0.82rem;margin:0.85rem 0 1rem"><strong>Handoff Reassurance:</strong> Wait for confirmation at <strong>${esc(chosen.name)}</strong> and look for our <strong>${siteMeta.pickupVehicle}</strong>.</div>
          <div style="display:flex;justify-content:space-between;font-size:1.2rem;font-weight:800;padding-top:0.55rem;border-top:1px solid var(--border);margin-bottom:0.9rem" role="status"><span>Subtotal ($0 pickup)</span><span>${formatMoney(subtotal)}</span></div>
          <button type="button" class="btn btn-primary" style="width:100%" ${items.length === 0 ? "disabled" : ""} data-demo-checkout>${items.length ? "Continue to Stripe Test Checkout" : "Add a Soap to Continue"}</button>
          <p style="font-size:0.76rem;color:var(--muted);margin:0.6rem 0 0">Prototype preview only — no real charge.</p>
        </aside>
      </div>
    </div></section>
  `;
}

function renderContactPage() {
  const subj = encodeURIComponent(`[The True Hive] ${state.inquiry.topic}`);
  const body = encodeURIComponent(`Name: ${state.inquiry.name}\nReply-to: ${state.inquiry.replyTo}\nTopic: ${state.inquiry.topic}\n\n${state.inquiry.message}`);
  const mailtoUrl = `mailto:${siteMeta.email}?subject=${subj}&body=${body}`;
  return `
    <section class="section"><div class="wrap">
      <nav class="breadcrumbs"><a href="${navHref("home")}" data-nav="home">Home</a> / <span>Contact</span></nav>
      <div class="grid-2" style="align-items:start">
        <div>
          <p class="eyebrow">Madisonville, Tennessee</p>
          <h1 style="font-family:var(--font-display);font-size:clamp(2rem,4vw,3rem);margin:0 0 0.7rem">Keep it local. Start a conversation.</h1>
          <p style="color:var(--muted)">Call for honeybee colony rescue or farm pollination, or prepare an email draft below to send from your own mail app.</p>
          <div class="card-box" style="margin-top:1.1rem"><p class="eyebrow">Direct Phone</p><p style="font-size:1.45rem;font-weight:800;margin:0 0 0.6rem">${siteMeta.phone}</p><a class="btn btn-primary" href="${siteMeta.phoneHref}">Call ${siteMeta.phone} &rarr;</a><p style="font-size:0.84rem;color:var(--muted);margin:0.8rem 0 0">Email: <a href="mailto:${siteMeta.email}" style="font-weight:700">${siteMeta.email}</a></p></div>
          <div class="safety-banner"><strong>Safety:</strong> ${siteMeta.safetyNote} Omit home addresses or sensitive details from web drafts.</div>
        </div>
        <div class="card-box">
          <h2 style="font-family:var(--font-display);font-size:1.45rem;margin:0 0 0.4rem">Prepare an Email Draft</h2>
          <p style="font-size:0.82rem;color:var(--muted);margin:0 0 1rem">Nothing is sent by this website — clicking opens a draft in your own email app.</p>
          <div class="field"><label for="inq-name">Your Name</label><input id="inq-name" type="text" value="${esc(state.inquiry.name)}" data-inq="name" /></div>
          <div class="field"><label for="inq-email">Reply-To Email</label><input id="inq-email" type="email" value="${esc(state.inquiry.replyTo)}" data-inq="replyTo" /></div>
          <div class="field"><label for="inq-topic">Topic</label><select id="inq-topic" data-inq="topic">${["No-cost Honeybee Colony Rescue", "Farm Pollination Assessment", "Soap Order or Pickup", "Seasonal Honey / Candle Radar"].map((o) => `<option value="${esc(o)}" ${state.inquiry.topic === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>
          <div class="field"><label for="inq-msg">Message</label><textarea id="inq-msg" rows="4" data-inq="message">${esc(state.inquiry.message)}</textarea></div>
          <a class="btn btn-primary" data-draft-mailto href="${mailtoUrl}">Open Draft in Email App &rarr;</a>
        </div>
      </div>
    </div></section>
  `;
}

function renderFooter() {
  return `
    <footer class="site-footer">
      <div class="wrap footer-grid">
        <div><strong style="font-family:var(--font-display);font-size:1.25rem;display:block;margin-bottom:0.4rem">The True Hive</strong><p style="margin:0 0 0.7rem;color:var(--muted);font-size:0.88rem">Small-batch soaps, $0 honeybee colony rescue, and farm pollination in Madisonville, Tennessee.</p><a href="${siteMeta.phoneHref}" style="font-weight:800">${siteMeta.phone}</a></div>
        <div><h3>Shop</h3><ul><li><a href="${navHref("goods")}" data-nav="goods">All Goods</a></li><li><a href="${navHref("product", "coconut-milk-delight")}" data-nav="product" data-slug="coconut-milk-delight">Coconut Milk Delight</a></li><li><a href="${navHref("product", "the-true-soap")}" data-nav="product" data-slug="the-true-soap">The True Soap</a></li><li><a href="${navHref("cart")}" data-nav="cart">Cart &amp; Pickup</a></li></ul></div>
        <div><h3>Beekeeping</h3><ul><li><a href="${navHref("services")}" data-nav="services">$0 Colony Rescue</a></li><li><a href="${navHref("services")}" data-nav="services">Farm Pollination (+24%)</a></li><li><a href="${navHref("about")}" data-nav="about">Our Story</a></li><li><a href="${navHref("contact")}" data-nav="contact">Contact</a></li></ul></div>
        <div><h3>US-411 Pickup Spots</h3><ul>${pickupLocations.map((l) => `<li>${esc(l.name)}<br /><span style="color:var(--muted);font-size:0.76rem">${esc(l.street)}, ${esc(l.city)}</span></li>`).join("")}</ul></div>
      </div>
      <div class="wrap footer-bottom"><span>The True Hive &middot; Madisonville, Tennessee &middot; Automatic Light/Dark Mode</span><span>Honest stock &middot; Zero fake scarcity or medical claims</span></div>
    </footer>
  `;
}

let lastXrayTrigger = null;

function renderXrayDrawer() {
  if (!state.xrayOpen) return "";
  const active = prototypes.find((p) => p.id === state.proto) || prototypes[0];
  const seo = getPageSeoAudit(state.page);
  const schema = JSON.stringify(buildJsonLd(state.page, state.slug), null, 2);
  return `
    <dialog id="xray-dialog" class="xray-dialog" aria-label="SEO, AI Overview and Psychology Inspector">
      <div class="xray-drawer">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.14);padding-bottom:0.9rem;margin-bottom:1rem">
          <div><div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.1em;color:#f2be59;font-weight:800">Prototype ${active.number} &middot; ${esc(active.name)}</div><h2 style="margin:0.15rem 0 0;font-size:1.15rem">SEO, AI Overview &amp; Psychology X-Ray</h2></div>
          <button type="button" class="studio-pill" data-close-xray>Close &times;</button>
        </div>
        <div class="xray-block"><strong style="color:#f2be59">Conversion Psychology Active Here:</strong><ul style="margin:0.45rem 0 0;padding-left:1.15rem">${active.psychology.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
        <div class="xray-block"><strong style="color:#6be5a4">Page SEO &amp; AI Overview (/${esc(state.page)}):</strong><p style="margin:0.35rem 0"><strong>Title:</strong> ${esc(seo.titleTag)}</p><p style="margin:0.35rem 0"><strong>Robots:</strong> ${esc(seo.robots)}</p></div>
        <div class="xray-block"><strong style="color:#9be8ba">Planned Production JSON-LD Preview (omitted from noindex prototype DOM):</strong><pre class="xray-code">${esc(schema)}</pre></div>
      </div>
    </dialog>
  `;
}

function captureFocusDescriptor() {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return null;
  if (el.id) return { selector: `#${CSS.escape(el.id)}`, start: el.selectionStart, end: el.selectionEnd };
  const attrs = [
    "data-switch-proto", "data-set-mode", "data-cycle-mode", "data-toggle-xray",
    "data-select-variant", "data-add-cart", "data-qty-delta", "data-store-filter",
    "data-minimal-format", "data-gallery-slug", "data-bee-choice", "data-pickup-select",
    "data-add-pair", "data-add-wolf-pair", "data-clear-cart",
  ];
  for (const attr of attrs) {
    if (el.hasAttribute(attr)) {
      const val = el.getAttribute(attr);
      return { selector: val ? `[${attr}="${CSS.escape(val)}"]` : `[${attr}]` };
    }
  }
  return null;
}

function render(options = {}) {
  const focusDesc = options.focusMain ? null : captureFocusDescriptor();
  document.documentElement.setAttribute("data-proto", state.proto);
  document.documentElement.setAttribute("data-color-mode", state.colorMode);
  const active = prototypes.find((p) => p.id === state.proto) || prototypes[0];
  const seo = getPageSeoAudit(state.page);
  document.title = `${seo.titleTag} [${active.name}]`;

  let mainHtml = "";
  if (state.page === "home") {
    if (state.proto === "golden-apothecary") mainHtml = renderHomeGoldenApothecary();
    else if (state.proto === "story-flagship") mainHtml = renderHomeStoryFlagship();
    else if (state.proto === "modern-dtc") mainHtml = renderHomeModernDtc();
    else if (state.proto === "local-hearth") mainHtml = renderHomeLocalHearth();
    else if (state.proto === "gallery-minimal") mainHtml = renderHomeGalleryMinimal();
  } else if (state.page === "goods") mainHtml = renderGoodsPage();
  else if (state.page === "product") mainHtml = renderProductPage();
  else if (state.page === "services") mainHtml = renderServicesPage();
  else if (state.page === "about") mainHtml = renderAboutPage();
  else if (state.page === "cart") mainHtml = renderCartPage();
  else if (state.page === "contact") mainHtml = renderContactPage();

  document.getElementById("app").innerHTML = `
    <a class="skip-link" href="#main">Skip to content</a>
    ${renderStudioBar()}
    ${renderSiteHeader()}
    <main id="main" tabindex="-1">${mainHtml}</main>
    ${renderFooter()}
    ${renderXrayDrawer()}
  `;

  if (state.xrayOpen) {
    const dialog = document.getElementById("xray-dialog");
    if (dialog && typeof dialog.showModal === "function" && !dialog.open) {
      dialog.showModal();
      dialog.addEventListener("close", () => {
        if (state.xrayOpen) {
          state.xrayOpen = false;
          render({ restoreSelector: lastXrayTrigger });
        }
      });
      dialog.addEventListener("click", (evt) => {
        if (evt.target === dialog) dialog.close();
      });
      const closeBtn = dialog.querySelector("[data-close-xray]");
      if (closeBtn) closeBtn.focus();
    }
    return;
  }

  if (options.focusMain) {
    document.getElementById("main")?.focus({ preventScroll: true });
    return;
  }

  const restoreTarget = options.restoreSelector || focusDesc?.selector;
  if (restoreTarget) {
    const target = document.querySelector(restoreTarget);
    if (target && typeof target.focus === "function") {
      target.focus({ preventScroll: true });
      if (typeof focusDesc?.start === "number" && typeof target.setSelectionRange === "function") {
        try { target.setSelectionRange(focusDesc.start, focusDesc.end); } catch { /* ignore */ }
      }
    }
  }
}

function setMobileMenuOpen(open) {
  state.mobileMenuOpen = open;
  const nav = document.getElementById("primary-nav");
  const toggle = document.getElementById("mobile-menu-toggle");
  const focused = document.activeElement;
  nav?.classList.toggle("is-open", open);
  toggle?.setAttribute("aria-expanded", String(open));
  if (focused && (nav?.contains(focused) || focused === toggle) && !focused.getClientRects().length) {
    (mobileViewport.matches ? toggle : document.querySelector(".brand-link"))?.focus({ preventScroll: true });
  }
}

function setStudioToolsOpen(open) {
  state.studioToolsOpen = open;
  const controls = document.getElementById("studio-controls");
  const toggle = document.getElementById("studio-tools-toggle");
  const focused = document.activeElement;
  controls?.classList.toggle("is-open", open);
  toggle?.setAttribute("aria-expanded", String(open));
  if (focused && (controls?.contains(focused) || focused === toggle) && !focused.getClientRects().length) {
    (mobileViewport.matches ? toggle : document.querySelector(".studio-back"))?.focus({ preventScroll: true });
  }
}

document.addEventListener("click", (e) => {
  const menuToggle = e.target.closest("[data-toggle-mobile-menu]");
  if (menuToggle) { setStudioToolsOpen(false); setMobileMenuOpen(!state.mobileMenuOpen); return; }
  const toolsToggle = e.target.closest("[data-toggle-studio-tools]");
  if (toolsToggle) { setMobileMenuOpen(false); setStudioToolsOpen(!state.studioToolsOpen); return; }
  if (state.mobileMenuOpen && !e.target.closest(".site-header")) setMobileMenuOpen(false);
  if (state.studioToolsOpen && !e.target.closest(".studio-bar, #xray-dialog")) setStudioToolsOpen(false);

  const protoBtn = e.target.closest("[data-switch-proto]");
  if (protoBtn) {
    state.proto = protoBtn.dataset.switchProto;
    state.mobileMenuOpen = false;
    state.studioToolsOpen = false;
    syncUrl(true);
    render({ restoreSelector: state.proto === "golden-apothecary" && mobileViewport.matches ? "#studio-tools-toggle" : null });
    window.scrollTo({ top: 0, behavior: "instant" });
    return;
  }

  const modeBtn = e.target.closest("[data-set-mode]");
  if (modeBtn) { state.colorMode = modeBtn.dataset.setMode; syncUrl(false); render(); return; }

  if (e.target.closest("[data-cycle-mode]")) {
    const order = ["system", "light", "dark"];
    state.colorMode = order[(order.indexOf(state.colorMode) + 1) % order.length];
    syncUrl(false); render(); return;
  }

  const navEl = e.target.closest("[data-nav]");
  if (navEl && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
    e.preventDefault();
    state.page = navEl.dataset.nav;
    state.mobileMenuOpen = false;
    state.studioToolsOpen = false;
    if (navEl.dataset.slug) {
      state.slug = navEl.dataset.slug;
      const product = products.find((p) => p.slug === state.slug);
      const variantKey = new URL(navEl.href, window.location.href).searchParams.get("variant");
      if (product?.variants.some((v) => v.key === variantKey)) selectedVariants[product.slug] = variantKey;
    }
    syncUrl(true); render({ focusMain: true }); window.scrollTo({ top: 0, behavior: "instant" }); return;
  }

  const varBtn = e.target.closest("[data-select-variant]");
  if (varBtn) { const [s, k] = varBtn.dataset.selectVariant.split("|"); selectedVariants[s] = k; syncUrl(false); render(); return; }

  const addBtn = e.target.closest("[data-add-cart]");
  if (addBtn) {
    const [s, k] = addBtn.dataset.addCart.split("|");
    const prod = products.find((p) => p.slug === s);
    const v = prod?.variants.find((x) => x.key === k);
    addItemsToCart([{ productSlug: s, variantKey: k, qty: 1 }], `Added ${prod.title} (${v.shortLabel}) to your cart.`);
    return;
  }

  if (e.target.closest("[data-add-pair]")) {
    addItemsToCart(
      [
        { productSlug: "coconut-milk-delight", variantKey: "coconut-milk-delight-4oz-single", qty: 1 },
        { productSlug: "the-true-soap", variantKey: "the-true-soap-4oz-single", qty: 1 },
      ],
      "Added Both 4oz Everyday Bars ($20.00) to your cart!",
    );
    return;
  }

  if (e.target.closest("[data-add-wolf-pair]")) {
    addItemsToCart(
      [
        { productSlug: "coconut-milk-delight", variantKey: "coconut-milk-delight-4oz-wolf", qty: 1 },
        { productSlug: "the-true-soap", variantKey: "the-true-soap-4oz-wolf", qty: 1 },
      ],
      "Added Both Sculpted Wolf Molds ($25.00) to your cart!",
    );
    return;
  }

  const minFmt = e.target.closest("[data-minimal-format]");
  if (minFmt) { state.minimalFormat = minFmt.dataset.minimalFormat; render(); return; }

  const qtyBtn = e.target.closest("[data-qty-delta]");
  if (qtyBtn) { const [k, d] = qtyBtn.dataset.qtyDelta.split("|"); updateCartQty(k, Number(d)); return; }

  if (e.target.closest("[data-clear-cart]")) { saveCart([]); render(); return; }

  const filterBtn = e.target.closest("[data-store-filter]");
  if (filterBtn) { state.storeFilter = filterBtn.dataset.storeFilter; render(); return; }

  const galBtn = e.target.closest("[data-gallery-slug]");
  if (galBtn) { state.gallerySlug = galBtn.dataset.gallerySlug; render(); return; }

  const beeBtn = e.target.closest("[data-bee-choice]");
  if (beeBtn) { state.beeChoice = beeBtn.dataset.beeChoice; render(); return; }

  if (e.target.closest("[data-toggle-xray]")) {
    lastXrayTrigger = "[data-toggle-xray]";
    state.xrayOpen = !state.xrayOpen;
    render();
    return;
  }
  if (e.target.closest("[data-close-xray]")) {
    const dialog = document.getElementById("xray-dialog");
    if (dialog?.open) dialog.close();
    else { state.xrayOpen = false; render({ restoreSelector: lastXrayTrigger }); }
    return;
  }

  if (e.target.closest("[data-demo-checkout]")) {
    const chosen = pickupLocations.find((l) => l.key === state.pickupKey);
    showToast(`Prototype checkout ready (${formatMoney(getCartSubtotal())}) for ${chosen.name} — no real payment charged.`);
  }
});

document.addEventListener("change", (e) => {
  const pk = e.target.closest("[data-pickup-select]");
  if (pk) { state.pickupKey = pk.dataset.pickupSelect; render(); }
});

document.addEventListener("input", (e) => {
  const f = e.target.closest("[data-inq]");
  if (f) {
    state.inquiry[f.dataset.inq] = f.value;
    const link = document.querySelector("[data-draft-mailto]");
    if (link) {
      const subj = encodeURIComponent(`[The True Hive] ${state.inquiry.topic}`);
      const body = encodeURIComponent(`Name: ${state.inquiry.name}\nReply-to: ${state.inquiry.replyTo}\nTopic: ${state.inquiry.topic}\n\n${state.inquiry.message}`);
      link.href = `mailto:${siteMeta.email}?subject=${subj}&body=${body}`;
    }
  }
});

window.addEventListener("popstate", () => {
  state.xrayOpen = false;
  state.mobileMenuOpen = false;
  state.studioToolsOpen = false;
  readParams();
  render({ focusMain: true });
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || state.xrayOpen) return;
  if (state.mobileMenuOpen) {
    setMobileMenuOpen(false);
    document.getElementById("mobile-menu-toggle")?.focus();
    e.preventDefault();
  } else if (state.studioToolsOpen) {
    setStudioToolsOpen(false);
    document.getElementById("studio-tools-toggle")?.focus();
    e.preventDefault();
  }
});

mobileViewport.addEventListener("change", () => {
  const previousFocus = lastPreviewFocus;
  setMobileMenuOpen(false);
  setStudioToolsOpen(state.xrayOpen && mobileViewport.matches);
  // Responsive CSS can blur a control before the media-query callback runs.
  if (!state.xrayOpen && previousFocus?.isConnected && !previousFocus.getClientRects().length && document.activeElement === document.body) {
    const inStudio = previousFocus.closest(".studio-bar");
    const target = mobileViewport.matches
      ? document.getElementById(inStudio ? "studio-tools-toggle" : "mobile-menu-toggle")
      : document.querySelector(inStudio ? ".studio-back" : ".brand-link");
    target?.focus({ preventScroll: true });
  }
});

document.addEventListener("focusin", (e) => {
  lastPreviewFocus = e.target.closest(".ga-header, .studio-bar") ? e.target : null;
});

readParams();
syncUrl(false);
render();
