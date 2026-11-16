import { escapeHtml as e } from "../scripts/dom.mjs";
import { products } from "../next/data.mjs";
import { studies } from "./manifest.mjs";
import { selectStudy, studyUrl, previewLine } from "./model.mjs";

let state = selectStudy(new URLSearchParams(location.search));
let quantity = 1;
const root = document.querySelector("#study-content");
const status = document.querySelector("#preview-status");
const money = (minor) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    minor / 100,
  );
const photo = (variant, hero = false) =>
  `<img ${hero ? "data-hero" : ""} src="../next/${e(variant.image)}" srcset="../next/${e(variant.small)} 480w, ../next/${e(variant.image)} 960w" sizes="(max-width: 700px) 90vw, 50vw" width="960" height="960" alt="AI styling reference: ${e(variant.label)}; not an actual product photograph." decoding="async">`;
const figure = () =>
  `<figure class="product-photo">${photo(state.variant, true)}<figcaption>AI styling reference</figcaption></figure>`;
const title = () =>
  `<header class="product-heading"><p class="eyebrow">The True Hive / Soap</p><h1>${e(state.product.title)}</h1><p class="summary">${e(state.product.summary)}</p></header>`;
const ingredientItems = (names) =>
  names.map((name) => `<li>${e(name)}</li>`).join("");
function ingredients(fold = false) {
  const list = `<ol class="ingredient-list">${ingredientItems(state.product.ingredients)}</ol>`;
  return fold
    ? `<details data-ingredients class="ingredients ingredient-fold"><summary>Ingredients <span aria-hidden="true">+</span></summary>${list}</details>`
    : `<section data-ingredients class="ingredients"><h2>Ingredients</h2>${list}</section>`;
}
function formats(cards = false) {
  return `<nav class="formats ${cards ? "format-cards" : ""}" aria-label="Product formats">${state.product.variants
    .map((variant) => {
      const selected = variant.key === state.variant.key;
      return `<a data-study-link data-variant="${e(variant.key)}" href="${e(studyUrl(state, { variant: variant.key }))}" ${selected ? 'aria-current="true"' : ""}>${photo(variant, cards && selected)}<span>${e(variant.label)}<strong>${money(variant.priceMinor)}</strong></span><i aria-hidden="true">${selected ? "Selected" : "Choose"}</i></a>`;
    })
    .join(
      "",
    )}</nav>${cards ? '<p class="reference-note">AI styling references</p>' : ""}`;
}
function purchase() {
  return `<form class="purchase" data-preview-form>
    <label>Quantity<input name="quantity" type="number" min="1" max="100" step="1" required value="${quantity}"></label>
    <button class="add-button" type="submit">Add to cart <span aria-hidden="true">&rarr;</span></button>
    <p class="demo-note">Preview only. No payment or order.</p>
  </form>`;
}
const price = () =>
  `<p class="price" data-selected-price>${money(state.variant.priceMinor)}</p>`;
const pickup = () =>
  `<p class="pickup"><span aria-hidden="true">&#9671;</span> Local pickup in Madisonville</p>`;
function buy({ heading = true, choices = true, fold = false } = {}) {
  return `<section class="buy-panel" aria-label="Product selection">${heading ? title() : ""}${price()}${choices ? `<h2 class="format-heading">Choose your format</h2>${formats()}` : `<p class="selected-format">${e(state.variant.label)}</p>`}${purchase()}${pickup()}${fold ? ingredients(true) : ""}</section>`;
}
function composition() {
  switch (state.design.id) {
    case "quick-pick":
      return `<div class="quick-layout">${figure()}${buy({ fold: true })}</div>`;
    case "formula-map": {
      const midpoint = Math.ceil(state.product.ingredients.length / 2);
      return `${title()}<div class="map-layout"><section data-ingredients class="formula-stage"><header><p class="eyebrow">The ingredient view</p><h2>What's inside.</h2></header><div class="formula-diagram"><ol class="ingredient-list">${ingredientItems(state.product.ingredients.slice(0, midpoint))}</ol>${figure()}<ol class="ingredient-list" start="${midpoint + 1}">${ingredientItems(state.product.ingredients.slice(midpoint))}</ol></div><p class="map-note">Owner-entered ingredients. Shared by both formats.</p></section>${buy({ heading: false })}</div>`;
    }
    case "format-studio":
      return `${title()}<div class="studio-layout"><section class="format-stage" aria-label="Compare product formats"><p class="eyebrow">One soap. Two shapes.</p>${formats(true)}${ingredients()}</section>${buy({ heading: false, choices: false })}</div>`;
    case "label-room":
      return `<div class="label-layout"><aside class="paper-label">${title()}<div class="label-rule" aria-hidden="true"></div>${ingredients()}<p class="label-end">THE TRUE HIVE<br>Madisonville, Tennessee</p></aside><div class="label-stage">${figure()}${buy({ heading: false })}</div></div>`;
    case "gallery-focus":
      return `${title()}<div class="gallery-stage">${figure()}<aside class="gallery-formats"><h2>Choose your format</h2>${formats()}</aside></div><section class="gallery-dock" aria-label="Product selection"><div>${price()}<p class="selected-format">${e(state.variant.label)}</p></div>${purchase()}</section><div class="gallery-details">${ingredients(true)}${pickup()}</div>`;
  }
}
function render(focusVariant = false) {
  root.innerHTML = `<article data-study="${e(state.design.id)}" data-composition="${e(state.design.composition)}">${composition()}</article>`;
  document.querySelector("#design-switch").value = state.design.id;
  document.querySelector("#product-switch").value = state.product.key;
  document.querySelector("#design-note").textContent = state.design.note;
  document.querySelector("#crumb").textContent = state.product.title;
  document.title = `${state.design.name} / ${state.product.title} | The True Hive product-page study`;
  status.textContent = "";
  if (focusVariant)
    root
      .querySelector(`[data-variant="${CSS.escape(state.variant.key)}"]`)
      ?.focus();
}
function navigate(url, focusVariant = false) {
  const previous = state.product.key;
  state = selectStudy(new URL(url, location.href).searchParams);
  if (state.product.key !== previous) quantity = 1;
  history.pushState(null, "", studyUrl(state));
  render(focusVariant);
}
document.querySelector("#design-switch").innerHTML = studies
  .map(
    (study, index) =>
      `<option value="${e(study.id)}">${index + 1}. ${e(study.name)}</option>`,
  )
  .join("");
document.querySelector("#product-switch").innerHTML = products
  .map(
    (product) =>
      `<option value="${e(product.key)}">${e(product.title)}</option>`,
  )
  .join("");
document.addEventListener("click", (event) => {
  const target =
    event.target instanceof Element
      ? event.target.closest("a[data-study-link]")
      : null;
  if (
    !target ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  event.preventDefault();
  navigate(target.href, true);
});
document.addEventListener("change", (event) => {
  const target = event.target;
  if (
    target instanceof HTMLSelectElement &&
    ["design-switch", "product-switch"].includes(target.id)
  )
    navigate(
      studyUrl(
        state,
        target.id === "design-switch"
          ? { design: target.value }
          : { product: target.value },
      ),
    );
  if (
    target instanceof HTMLInputElement &&
    target.name === "quantity" &&
    target.checkValidity()
  )
    quantity = Number(target.value);
});
document.addEventListener("submit", (event) => {
  if (
    !(event.target instanceof HTMLFormElement) ||
    !event.target.matches("[data-preview-form]")
  )
    return;
  event.preventDefault();
  if (!event.target.reportValidity()) return;
  try {
    const line = previewLine(
      state,
      Number(new FormData(event.target).get("quantity")),
    );
    status.textContent = `Preview: ${line.quantity} x ${state.variant.label} / ${money(line.totalMinor)}. No order has been created.`;
  } catch (error) {
    status.textContent = error.message;
  }
});
window.addEventListener("popstate", () => {
  state = selectStudy(new URLSearchParams(location.search));
  quantity = 1;
  render();
});
render();
