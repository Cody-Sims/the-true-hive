import { escapeHtml as e } from "../scripts/dom.mjs";
import { concepts } from "./manifest.mjs";
import { products } from "./data.mjs";
import {
  resolveReview,
  reviewUrl,
  updatePreviewCart,
  cartSummary,
} from "./model.mjs";

const money = (minor) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    minor / 100,
  );
let state = resolveReview(new URLSearchParams(location.search));
let cart = [];
const cartCache = new Map();
const cartKey = () => `true-hive-design-review-${state.concept.id}`;
function readCart() {
  const key = cartKey();
  if (cartCache.has(key)) {
    cart = cartCache.get(key);
    return;
  }
  try {
    cart = JSON.parse(sessionStorage.getItem(key) ?? "[]");
  } catch {
    cart = [];
  }
  cart = cartSummary(cart).lines.map((line) => ({
    variantKey: line.variant.key,
    quantity: line.quantity,
  }));
  cartCache.set(key, cart);
}
function saveCart() {
  cartCache.set(cartKey(), cart);
  try {
    sessionStorage.setItem(cartKey(), JSON.stringify(cart));
  } catch {}
}
const link = (label, patch, className = "") =>
  `<a data-review-nav class="${e(className)}" href="${e(reviewUrl(state, patch))}">${e(label)}</a>`;
const image = (variant, className = "", eager = false) =>
  `<img class="${e(className)}" src="${e(variant.image)}" srcset="${e(variant.small)} 480w, ${e(variant.image)} 960w" sizes="(max-width: 700px) 90vw, 45vw" width="960" height="960" alt="AI styling reference: ${e(variant.label)}; not an actual product photograph." loading="${eager ? "eager" : "lazy"}" decoding="async">`;
const figure = (variant, extra = "") =>
  `<figure class="image-frame">${image(variant, "hero-image", true)}<figcaption>AI styling reference</figcaption>${extra}</figure>`;
const hive = () =>
  `<figure class="hive-frame"><img src="assets/hive.webp" width="960" height="1280" alt="Honeybees tending golden honeycomb." loading="lazy"><figcaption>A closer look at the hive.</figcaption></figure>`;
const ingredientList = (product) =>
  `<ol class="ingredient-list">${product.ingredients.map((name) => `<li>${e(name)}</li>`).join("")}</ol>`;
function ingredients(product, mode = state.concept.ingredientMode) {
  const content = ingredientList(product);
  if (["card", "drawer"].includes(mode))
    return `<details data-ingredient-mode="${e(mode)}" class="ingredient-panel" ${mode === "card" ? "open" : ""}><summary>Ingredients <span aria-hidden="true">+</span></summary>${content}</details>`;
  return `<aside data-ingredient-mode="${e(mode)}" class="ingredient-panel"><p class="eyebrow">${mode === "ledger" ? "Formula notes / owner-entered" : "Inside the bar"}</p><h2>Ingredients</h2>${content}</aside>`;
}
function formatLinks(product, className = "format-links") {
  return `<div class="${e(className)}" aria-label="Formats for ${e(product.title)}">${product.variants.map((variant) => link(`${variant.label} / ${money(variant.priceMinor)}`, { view: "product", product: product.key, variant: variant.key })).join("")}</div>`;
}
function productCard(product, index) {
  const href = reviewUrl(state, {
    view: "product",
    product: product.key,
    variant: product.variants[0].key,
  });
  return `<article class="review-product">
    <a data-review-nav class="image-link" href="${e(href)}">${figure(product.variants[0])}<span class="image-link-name">${e(product.title)}</span></a>
    <div class="card-copy"><p class="eyebrow">Soap / ${String(index + 1).padStart(2, "0")}</p>
    <h2>${link(product.title, { view: "product", product: product.key, variant: product.variants[0].key })}</h2>
    <p class="card-price">From ${money(product.variants[0].priceMinor)}</p>
    ${formatLinks(product)}</div></article>`;
}
const productGrid = () =>
  `<div class="review-products">${products.map(productCard).join("")}</div>`;
function buyPanel() {
  const { product, variant } = state;
  return `<section class="buy-panel" aria-label="Choose a format">
    <p class="product-price">${money(variant.priceMinor)}</p>
    <p class="product-description">${e(product.summary)}</p>
    <h2>Choose your format</h2>
    <nav class="variant-choices" aria-label="Product formats">${product.variants
      .map(
        (entry) =>
          `<a data-review-nav href="${e(reviewUrl(state, { variant: entry.key }))}" ${entry.key === variant.key ? 'aria-current="true"' : ""}>
        ${image(entry, "variant-thumb")}<span>${e(entry.label)}</span><strong>${money(entry.priceMinor)}</strong></a>`,
      )
      .join("")}</nav>
    <button class="primary" data-add-preview="${e(variant.key)}" type="button">Add to preview cart</button>
    <p class="fine">Local design demonstration &middot; no order or stock hold.</p>
    ${link("Pickup by arrangement in Madisonville", { view: "store" }, "text-link")}
  </section>`;
}
function productPage() {
  const { product, variant, concept } = state;
  const heading = `<header class="product-page-heading"><p class="eyebrow">The True Hive / Soap</p><h1>${e(product.title)}</h1></header>`;
  const stage = (panel = "") =>
    `<section class="product-stage" aria-label="Product image">${figure(variant, panel)}</section>`;
  let content;
  if (concept.id === "atelier")
    content = `${stage(ingredients(product))}${buyPanel()}`;
  if (concept.id === "honeyglass")
    content = `${stage()}${buyPanel()}${ingredients(product)}`;
  if (concept.id === "field-notes")
    content = `<aside class="product-index"><h2>On the shelf</h2>${products.map((entry, index) => link(`${String(index + 1).padStart(2, "0")} / ${entry.title}`, { product: entry.key, variant: entry.variants[0].key })).join("")}</aside>${stage()}<div>${buyPanel()}${ingredients(product)}</div>`;
  if (concept.id === "soft-geometry")
    content = `${buyPanel()}${stage()}${ingredients(product)}<aside class="shape-note"><p class="eyebrow">One soap / two shapes</p><div>${product.variants.map((entry) => image(entry)).join("")}</div></aside>`;
  if (concept.id === "night-apiary")
    content = `${stage(ingredients(product))}${buyPanel()}`;
  return `${heading}<article id="product" class="product-layout layout-${e(concept.id)}" data-composition="${e(concept.layout)}">${content}</article>`;
}
function homePage() {
  const { concept } = state;
  const title = concept.headline.split("\n").map(e).join("<br>");
  const art =
    concept.id === "soft-geometry"
      ? `<div class="home-shapes">${image(products[0].variants[0], "", true)}${image(products[1].variants[1], "", true)}</div>`
      : figure(
          concept.id === "night-apiary"
            ? products[1].variants[1]
            : products[0].variants[0],
        );
  return `<section class="concept-hero">
    <div class="hero-copy"><p class="eyebrow">The True Hive / Madisonville, Tennessee</p><h1>${title}</h1>
    <p>Everyday soap. Local roots.</p>${link("Explore the store", { view: "store" }, "primary")}
    ${link("Services for hive & farm", { view: "services" }, "text-link")}</div>${art}
    ${concept.id === "field-notes" ? `<aside class="hero-note"><span>01 / The collection</span><p>Two soaps.<br>Two formats each.<br>Every detail, easy to find.</p></aside>` : ""}
    </section>
    <section class="home-collection"><header><p class="eyebrow">The daily collection</p><h2>A small ritual, made yours.</h2></header>${productGrid()}</section>
    <section class="local-story">${hive()}<div><p class="eyebrow">Beyond the bar</p><h2>Connected by bees.<br>Rooted in Madisonville.</h2><p>Soap-making, colony rescue and farm pollination, from The True Hive.</p>${link("Meet The True Hive", { view: "about" }, "text-link")}</div></section>`;
}
function storePage() {
  return `<header class="store-heading"><p class="eyebrow">The True Hive / The collection</p><h1>${state.concept.id === "field-notes" ? "The goods, at a glance." : "Everyday, a little better."}</h1><p>Two soaps. Choose your favorite format.</p></header>
    ${productGrid()}<aside class="pickup-note" id="pickup"><h2>Local pickup</h2><p>Madisonville, Tennessee &middot; By arrangement, not a walk-in shop.</p><p class="fine">This design preview does not confirm availability or a pickup.</p></aside>`;
}
function cartPage() {
  const summary = cartSummary(cart);
  return `<header class="store-heading"><p class="eyebrow">Design demonstration</p><h1>Your preview cart.</h1><p>No payment, reservation or order is created.</p></header>
    <div class="preview-cart">${
      summary.lines.length
        ? summary.lines
            .map(
              (line) =>
                `<article class="cart-row">${image(line.variant)}<div><h2>${e(line.product.title)}</h2><p>${e(line.variant.label)}</p>
      <label>Quantity<input data-preview-quantity="${e(line.variant.key)}" type="number" min="1" max="100" step="1" value="${line.quantity}"></label>
      <button type="button" class="text-button" data-remove-preview="${e(line.variant.key)}">Remove</button></div><strong>${money(line.quantity * line.variant.priceMinor)}</strong></article>`,
            )
            .join("")
        : `<p>Your preview cart is empty.</p>`
    }
    <p class="product-price">Preview subtotal: ${money(summary.totalMinor)}</p>${link("Keep exploring", { view: "store" }, "primary")}
    <p class="fine">Local browser demonstration only. No checkout or payment connection.</p></div>`;
}
function informationPage() {
  if (state.view === "services")
    return `<section class="information-page">${hive()}<div><p class="eyebrow">For hive & farm</p><h1>For the bees.<br>And the neighbors.</h1><h2>Colony rescue</h2><p>No-cost honeybee relocation in Monroe, Blount and Knox counties.</p><h2>Farm pollination</h2><p>Talk with us about your crops, location, timing and hive needs.</p>${link("Contact us", { view: "contact" }, "primary")}<p class="fine">Give bees space. Do not disturb a colony or approach it for a photograph.</p></div></section>`;
  if (state.view === "about")
    return `<section class="information-page">${hive()}<div><p class="eyebrow">Madisonville, Tennessee</p><h1>Local roots.<br>A love for bees.</h1><p>The True Hive brings soap-making and beekeeping together, with colony rescue and farm pollination for our neighbors.</p>${link("Explore the collection", { view: "store" }, "primary")}${link("Our services", { view: "services" }, "text-link")}</div></section>`;
  if (state.view === "contact")
    return `<section class="prose-page"><p class="eyebrow">For service inquiries</p><h1>Let's start a conversation.</h1><p>This is a design preview. Use the existing contact page for an actual inquiry.</p><a class="primary" href="https://thetruehive.com/contact">Open current contact page</a></section>`;
  return `<section class="prose-page"><h1>${state.view === "privacy" ? "Preview privacy." : "Made to be accessible."}</h1><p>This prototype uses only a static public product snapshot and local session storage for its demo cart. It makes no order, payment or inventory requests.</p><p>Ingredient lists remain selectable text. Navigation and format links work with the keyboard; expandable panels use native disclosure controls.</p>${link("Back to the store", { view: "store" }, "text-link")}</section>`;
}
function shell(content) {
  const { concept, view } = state;
  const shopping = ["store", "product", "cart"].includes(view);
  const count = cartSummary(cart).lines.reduce(
    (sum, line) => sum + line.quantity,
    0,
  );
  return `<aside class="review-bar" aria-label="Prototype review controls"><a href="index.html">All five concepts</a>
    <label>Direction<select data-direction>${concepts.map((entry) => `<option value="${e(entry.id)}" ${entry.id === concept.id ? "selected" : ""}>${e(entry.number)} / ${e(entry.name)}</option>`).join("")}</select></label>
    <span>Design preview &middot; No live orders</span></aside>
    <header class="concept-header"><a class="concept-brand" data-review-nav href="${e(reviewUrl(state, { view: "home" }))}">THE TRUE HIVE<small>Madisonville, Tennessee</small></a>
    <nav aria-label="Main navigation">${link("Store", { view: "store" })}${link("Services", { view: "services" })}${link("About us", { view: "about" })}</nav></header>
    <main id="main" tabindex="-1">
      ${shopping ? `<nav class="shopping-nav" aria-label="Store navigation">${link("All products", { view: "store" })}${link(`Preview cart${count ? ` (${count})` : ""}`, { view: "cart" })}</nav>` : ""}
      <p class="preview-status" role="status" data-preview-status></p>${content}
    </main>
    <footer class="concept-footer"><div><p class="eyebrow">The True Hive</p><strong>A local beginning.</strong><p>AI styling references &middot; Public product snapshot</p></div><nav aria-label="Footer navigation">${link("Contact us", { view: "contact" })}${link("Privacy", { view: "privacy" })}${link("Accessibility", { view: "accessibility" })}</nav></footer>`;
}
function render(focus = false) {
  const active = document.activeElement;
  const focusAttribute = [
    "data-add-preview",
    "data-remove-preview",
    "data-preview-quantity",
  ].find((attribute) => active?.hasAttribute(attribute));
  const focusValue = focusAttribute
    ? active.getAttribute(focusAttribute)
    : null;
  document.body.className = `theme-${state.concept.id}`;
  document.title = `${state.view === "product" ? state.product.title : state.concept.name} | The True Hive design review`;
  const root = document.querySelector("#review-app");
  if (!root) return;
  const content =
    state.view === "home"
      ? homePage()
      : state.view === "store"
        ? storePage()
        : state.view === "product"
          ? productPage()
          : state.view === "cart"
            ? cartPage()
            : informationPage();
  root.innerHTML = shell(content);
  if (focus) {
    document.querySelector("#main").focus();
    window.scrollTo(0, 0);
  } else if (focusAttribute) {
    const control =
      root.querySelector(`[${focusAttribute}="${CSS.escape(focusValue)}"]`) ??
      root.querySelector("[data-preview-quantity], .preview-cart .primary");
    control?.focus();
  }
}
function navigate(url) {
  const next = new URL(url, location.href);
  state = resolveReview(next.searchParams);
  history.pushState(null, "", reviewUrl(state));
  readCart();
  render(true);
}
if (document.body.hasAttribute("data-review-hub")) {
  document.querySelector("#concept-grid").innerHTML = concepts
    .map((concept, index) => {
      const target = resolveReview(new URLSearchParams({ design: concept.id }));
      return `<article class="concept-tile theme-${e(concept.id)}"><a class="tile-art" href="${e(reviewUrl(target))}">${image(products[Math.floor(index / 2) % 2].variants[index % 2], "", true)}<span>${e(concept.number)}</span></a>
      <div><p class="eyebrow">${e(concept.mood)}</p><h2><a href="${e(reviewUrl(target))}">${e(concept.name)}</a></h2><p>${e(concept.treatment)}</p>
      <nav aria-label="Explore ${e(concept.name)}"><a href="${e(reviewUrl(target, { view: "home" }))}">Home</a><a href="${e(reviewUrl(target, { view: "store" }))}">Store</a><a href="${e(reviewUrl(target, { view: "product" }))}">Product & ingredients</a></nav></div></article>`;
    })
    .join("");
} else {
  readCart();
  render();
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const anchor = target?.closest("a[data-review-nav]");
    if (
      anchor &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey &&
      event.button === 0
    ) {
      event.preventDefault();
      navigate(anchor.href);
      return;
    }
    const add = target?.closest("[data-add-preview]");
    if (add) {
      try {
        cart = updatePreviewCart(cart, add.dataset.addPreview, 1);
        saveCart();
        render();
        document.querySelector("[data-preview-status]").textContent =
          "Added to the local preview cart. No order has been placed.";
      } catch (error) {
        document.querySelector("[data-preview-status]").textContent =
          error.message;
      }
    }
    const remove = target?.closest("[data-remove-preview]");
    if (remove) {
      cart = cart.filter(
        (line) => line.variantKey !== remove.dataset.removePreview,
      );
      saveCart();
      render();
    }
  });
  document.addEventListener("change", (event) => {
    const target = event.target;
    if (
      target instanceof HTMLSelectElement &&
      target.matches("[data-direction]")
    )
      navigate(reviewUrl(state, { design: target.value }));
    if (
      target instanceof HTMLInputElement &&
      target.matches("[data-preview-quantity]")
    ) {
      try {
        cart = updatePreviewCart(
          cart.filter(
            (line) => line.variantKey !== target.dataset.previewQuantity,
          ),
          target.dataset.previewQuantity,
          Number(target.value),
        );
        saveCart();
        render();
      } catch (error) {
        target.value = String(
          cart.find(
            (line) => line.variantKey === target.dataset.previewQuantity,
          )?.quantity ?? 1,
        );
        document.querySelector("[data-preview-status]").textContent =
          error.message;
      }
    }
  });
  window.addEventListener("popstate", () => {
    state = resolveReview(new URLSearchParams(location.search));
    readCart();
    render();
  });
}
