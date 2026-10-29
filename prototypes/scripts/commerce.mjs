import { products, scenarios, createSnapshot, findVariant, formatMoney } from "./catalog.mjs";
import { designs, getDesign } from "./designs.mjs";
import { changeCart, getAvailability, readCart } from "./commerce-model.mjs";
import { collectionResults, renderCollection, renderProduct, renderCart, renderCheckout, renderInventory } from "./commerce-views.mjs";
import { escapeHtml as e } from "./dom.mjs";

const cartKey = "true-hive-demo-cart:v1";
const query = new URLSearchParams(location.search);
const design = getDesign(query.get("design") ?? "meadow");
const view = document.body.dataset.view;
const content = document.querySelector("#commerce-content");
const noticeElement = document.querySelector("#store-notice");
const paths = { collection: "store.html", product: "product.html", cart: "cart.html", checkout: "checkout.html", inventory: "inventory.html" };
const titles = { collection: "Collection preview", product: "Product preview", cart: "Demo cart", checkout: "Checkout concept", inventory: "Inventory lab" };
const state = {
  scenario: query.get("scenario") ?? "normal",
  fulfillment: query.get("method") ?? "pickup",
  lines: [],
  invalidCart: false,
  storageError: false,
  filters: { category: "all", search: "", sort: "featured" },
  product: products.find((entry) => entry.key === (query.get("product") ?? "honey-oat-soap")),
  variant: query.get("variant"),
};

function link(destination, extras = {}) {
  if (!paths[destination]) throw new RangeError("Unknown prototype destination.");
  const parameters = new URLSearchParams({ design: design.id, scenario: state.scenario, method: state.fulfillment, ...extras });
  return `${paths[destination]}?${parameters}`;
}

function context() {
  return { design, products, lines: state.lines, fulfillment: state.fulfillment, snapshot: createSnapshot(state.scenario),
    home: design.home, link };
}

function notice(message, error = false, reset = false) {
  noticeElement.hidden = false;
  noticeElement.setAttribute("role", error ? "alert" : "status");
  noticeElement.textContent = message;
  if (reset) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-action";
    button.dataset.action = "reset";
    button.textContent = "Reset saved demo cart";
    noticeElement.append(document.createElement("br"), button);
  }
}

function readSavedCart(raw) {
  const result = readCart(raw, products);
  state.invalidCart = !result.ok;
  state.lines = result.ok ? result.lines : [];
  if (!result.ok) notice(result.error, true, true);
}

function loadCart() {
  try {
    readSavedCart(localStorage.getItem(cartKey));
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== "SecurityError") throw error;
    state.storageError = true;
    notice("Browser storage is blocked. The demo cart cannot be saved; no cart action will report success.", true);
  }
}

function saveCart(lines) {
  try {
    localStorage.setItem(cartKey, JSON.stringify({ version: 1, lines }));
  } catch (error) {
    if (!(error instanceof DOMException) || !["SecurityError", "QuotaExceededError"].includes(error.name)) throw error;
    notice("The sample cart could not be saved in this browser. Your previous cart was not changed. Enable storage or free space and retry.", true);
    return false;
  }
  state.lines = lines;
  state.invalidCart = false;
  state.storageError = false;
  updateCartBadge();
  return true;
}

function updateCartBadge() {
  const count = state.lines.reduce((sum, line) => sum + line.quantity, 0);
  for (const badge of document.querySelectorAll("[data-cart-count]")) badge.textContent = String(count);
}

function renderShell() {
  document.body.dataset.design = design.id;
  document.title = `${design.name} | ${titles[view]} | The True Hive`;
  document.querySelector("[data-store-header]").innerHTML = `
    <a class="brand store-wordmark" href="${e(design.home)}">the true hive<small>${e(design.name)} / Madisonville, TN</small></a>
    <nav class="store-nav" aria-label="Store preview navigation">
      <a data-commerce-link="collection" href="${e(link("collection"))}"${view === "collection" ? ' aria-current="page"' : ""}>Collection</a>
      <a href="${e(design.home)}#services">Beekeeping</a>
      <a data-commerce-link="cart" href="${e(link("cart"))}"${view === "cart" ? ' aria-current="page"' : ""}>Demo cart <span class="cart-count" data-cart-count>0</span></a>
      <a href="index.html">All designs</a>
    </nav>`;
  document.querySelector("#demo-controls").innerHTML = `<div class="demo-controls">
    <div class="field"><label for="design-select">Design direction</label><select id="design-select">
      ${designs.map((entry) => `<option value="${entry.id}"${entry.id === design.id ? " selected" : ""}>${entry.number} / ${e(entry.name)}</option>`).join("")}
    </select></div>
    <div class="field"><label for="scenario-select">Demo inventory scenario</label><select id="scenario-select">
      ${scenarios.map((entry) => `<option value="${entry.id}"${entry.id === state.scenario ? " selected" : ""}>${e(entry.label)}</option>`).join("")}
    </select></div>
    <div class="field"><label for="fulfillment-select">Fulfillment preview</label><select id="fulfillment-select">
      <option value="pickup"${state.fulfillment === "pickup" ? " selected" : ""}>Local pickup first</option>
      <option value="shipping"${state.fulfillment === "shipping" ? " selected" : ""}>Shipping / later phase</option>
    </select></div></div>
    <p class="control-note">Review controls, not shopper-facing production features. Change scenarios to explore stock, outage, and cart behavior.</p>`;
  document.querySelector("[data-store-footer]").innerHTML = `<span>THE TRUE HIVE / ${e(design.name)}<br>Fictional catalog and quantities. No purchases or real inventory connection.</span>
    <a href="plan.html?doc=${e(design.brief)}">Design rationale</a><a href="plan.html?doc=business">Business launch plan</a>
    <a data-commerce-link="inventory" href="${e(link("inventory"))}">Inventory lab</a><a href="plan.html?doc=questions">Partner questions</a>`;
  updateCartBadge();
}

function renderView() {
  const current = context();
  if (view === "collection") content.innerHTML = renderCollection(current, state.filters);
  else if (view === "product") content.innerHTML = renderProduct(current, state.product, state.variant);
  else if (view === "cart") content.innerHTML = renderCart(current);
  else if (view === "checkout") content.innerHTML = renderCheckout(current);
  else if (view === "inventory") content.innerHTML = renderInventory(current);
  else throw new RangeError("Unknown commerce prototype view.");
  content.setAttribute("aria-busy", "false");
}

function updateResults() {
  document.querySelector("#collection-results").innerHTML = collectionResults(context(), state.filters);
  for (const button of document.querySelectorAll("[data-category]")) {
    button.setAttribute("aria-pressed", String(button.dataset.category === state.filters.category));
  }
}

function syncParameters() {
  const url = new URL(location.href);
  url.searchParams.set("scenario", state.scenario);
  url.searchParams.set("method", state.fulfillment);
  if (view === "product" && state.variant) url.searchParams.set("variant", state.variant);
  history.replaceState(null, "", url);
  for (const anchor of document.querySelectorAll("[data-commerce-link]")) {
    anchor.href = link(anchor.dataset.commerceLink);
  }
}

function updateVariant() {
  const found = findVariant(state.variant, products);
  const availability = getAvailability(createSnapshot(state.scenario), found.variant.id, state.fulfillment);
  document.querySelector("#variant-price").textContent = formatMoney(found.variant.priceMinor);
  const stock = document.querySelector("#variant-stock");
  stock.textContent = availability.message;
  stock.dataset.status = availability.status;
  document.querySelector("#add-to-cart").disabled = availability.status !== "available";
}

function applyChange(change) {
  if (state.invalidCart || state.storageError) {
    notice("The saved demo cart is unavailable. Reset an invalid cart or enable browser storage before adding items.", true, state.invalidCart);
    return false;
  }
  const result = changeCart(state.lines, change, context());
  if (!result.ok) {
    notice(result.error, true);
    return false;
  }
  return saveCart(result.lines);
}

function resetCart() {
  if (!saveCart([])) return;
  notice("The demo cart was reset. No real inventory or order was changed.");
  if (view === "cart" || view === "checkout") renderView();
}

function bindEvents() {
  document.querySelector("#design-select").addEventListener("change", (event) => {
    const url = new URL(location.href);
    url.searchParams.set("design", event.target.value);
    location.assign(url);
  });
  document.querySelector("#scenario-select").addEventListener("change", (event) => {
    state.scenario = event.target.value;
    syncParameters();
    renderView();
    notice("Sample inventory scenario changed. Cart quantities were rechecked, not reserved or silently adjusted.");
  });
  document.querySelector("#fulfillment-select").addEventListener("change", (event) => {
    state.fulfillment = event.target.value;
    syncParameters();
    renderView();
    notice(state.fulfillment === "shipping"
      ? "Shipping is a later business phase and is not offered by this pickup-first demo."
      : "Pickup-first sample restored. A real location, schedule, and fees still require approval.");
  });
  content.addEventListener("input", (event) => {
    if (event.target.id !== "product-search") return;
    state.filters.search = event.target.value;
    updateResults();
  });
  content.addEventListener("change", (event) => {
    if (event.target.id === "product-sort") {
      state.filters.sort = event.target.value;
      updateResults();
    }
    if (event.target.id === "product-variant") {
      state.variant = event.target.value;
      syncParameters();
      updateVariant();
    }
  });
  content.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target;
    if (!form.reportValidity()) return;
    if (form.id === "product-form") {
      const variantId = form.elements.variant.value;
      const quantity = Number(form.elements.quantity.value);
      if (!applyChange({ variantId, quantity, operation: "add" })) return;
      const feedback = document.querySelector("#add-feedback");
      feedback.hidden = false;
      feedback.innerHTML = `Added to the demo cart. Stock is not reserved. <a href="${e(link("cart"))}">View your sample cart &rarr;</a>`;
      notice("Added to the sample cart. No purchase, reservation, or real stock change occurred.");
    } else if (form.dataset.line) {
      const variantId = form.dataset.line;
      const quantity = Number(form.elements.quantity.value);
      if (!applyChange({ variantId, quantity, operation: "set" })) return;
      renderView();
      notice("Sample cart updated and revalidated.");
      const focus = document.getElementById(`qty-${variantId}`) ?? document.querySelector("#page-title");
      focus.focus();
    }
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.category) {
      state.filters.category = button.dataset.category;
      updateResults();
    }
    if (button.dataset.action === "clear-filters") {
      state.filters = { category: "all", search: "", sort: "featured" };
      renderView();
      document.querySelector("#product-search").focus();
    }
    if (button.dataset.action === "reset") resetCart();
    if (button.dataset.action === "remove") {
      if (!applyChange({ variantId: button.dataset.variant, quantity: 0, operation: "set" })) return;
      renderView();
      notice("Sample item removed. No real stock was changed.");
      document.querySelector("#page-title").focus();
    }
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== cartKey) return;
    readSavedCart(event.newValue);
    updateCartBadge();
    renderView();
  });
}

const validScenario = scenarios.some((scenario) => scenario.id === state.scenario);
const validFulfillment = ["pickup", "shipping"].includes(state.fulfillment);
const validVariant = !state.variant || state.product?.variants.some((variant) => variant.id === state.variant);
if (!design || !validScenario || !validFulfillment || !validVariant || (view === "product" && !state.product)) {
  content.setAttribute("aria-busy", "false");
  content.innerHTML = `<section class="page-intro"><div><p class="eyebrow">Invalid preview link</p>
    <h1>That concept could not be found.</h1></div><p>A design, product, format, or scenario in this URL is not part of the studio.
    No cart or inventory was changed.</p></section><a class="primary-action" href="index.html">Return to all ten designs</a>`;
} else {
  state.variant ??= state.product?.variants[0].id;
  loadCart();
  renderShell();
  renderView();
  bindEvents();
}
