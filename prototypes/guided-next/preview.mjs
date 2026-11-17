import { escapeHtml as e } from "../scripts/dom.mjs";
import { validPrice } from "../editor/model.mjs";

const money = (value) => validPrice(value) ? `$${Number(value).toFixed(2)}` : "Price to come";
const active = (product) => product.variants.filter((variant) => variant.active);
const lines = (text) => (text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

function startingPrice(variants) {
  const prices = variants.filter((variant) => validPrice(variant.price)).map((variant) => Number(variant.price));
  return prices.length ? `${new Set(prices).size > 1 ? "From " : ""}$${Math.min(...prices).toFixed(2)}` : "Add a price to preview";
}

export function compactCard(product, source) {
  const variants = active(product);
  return `<article class="customer-card compact-card">
    <button type="button" class="customer-card-image" data-open-preview="product" aria-label="Open product page preview"><img src="${e(source)}" alt="${e(product.title || "Your product")} — compact preview" width="420" height="360"></button>
    <div class="compact-card-copy"><p class="eyebrow">${e(product.category)}</p><h3><button type="button" class="compact-title" data-open-preview="product">${e(product.title || "Your product name")}</button></h3>
      <div class="compact-card-meta"><strong>${startingPrice(variants)}</strong><span>${variants.length} active ${variants.length === 1 ? "format" : "formats"}</span></div>
    </div></article>`;
}

export function collectionCard(product, source) {
  const variants = active(product);
  const price = startingPrice(variants);
  return `<article class="customer-card">
    <button type="button" class="customer-card-image" data-open-preview="product" aria-label="Open product page preview"><img src="${e(source)}" alt="${e(product.title || "Your product")} — preview image" width="420" height="360"><span>View product <span aria-hidden="true">&nearr;</span></span></button>
    <div class="customer-card-copy"><p class="eyebrow">${e(product.category)}</p><h3><button type="button" class="customer-title-link" data-open-preview="product">${e(product.title || "Your product name")} <span aria-hidden="true">&nearr;</span></button></h3><p class="customer-starting-price">${price}</p>
      <div class="customer-formats">${variants.map((variant) => `<button type="button" data-preview-format="${variant.id}"><img src="${e(source)}" alt="" width="42" height="42"><span>${e(variant.label || "Your format")}</span><strong>${money(variant.price)}</strong><span aria-hidden="true">&rarr;</span></button>`).join("") || '<p class="customer-empty">No active formats yet.</p>'}</div>
    </div></article>`;
}

export function productPage(product, source, selectedId) {
  const variants = active(product);
  const selected = variants.find((variant) => variant.id === selectedId) || variants[0];
  return `<article class="customer-product">
    <div class="customer-site-header"><span>The True Hive</span><div aria-label="Storefront navigation example">Store <span>Services</span> <span>About us</span></div></div>
    <button type="button" class="customer-back" data-preview-view="card"><span aria-hidden="true">&larr;</span> Back to card</button>
    <div class="customer-breadcrumb">Home <span aria-hidden="true">/</span> Store <span aria-hidden="true">/</span> ${e(product.title || "Your product")}</div>
    <div class="customer-detail-layout">
      <figure class="customer-hero"><img src="${e(source)}" alt="${e(product.title || "Your product")} — preview image" width="420" height="360"><figcaption>Editor image preview / not a live product</figcaption></figure>
      <section class="customer-detail-copy" aria-label="Product information">
        <p class="eyebrow">The True Hive collection / ${e(product.category)}</p><h2>${e(product.title || "Your product name")}</h2><p class="customer-description">${e(product.summary || "Your short product description appears here.")}</p>
        <p class="customer-detail-price" data-customer-price>${selected ? money(selected.price) : "Add an active format"}</p>
        <fieldset class="customer-format-options"><legend>Choose your format.</legend>${variants.map((variant) => `<label><input type="radio" name="preview-format" data-page-variant value="${variant.id}" ${selected?.id === variant.id ? "checked" : ""}><span>${e(variant.label || "Your format")}</span><strong>${money(variant.price)}</strong></label>`).join("") || "<p>No active formats yet.</p>"}</fieldset>
        <div class="customer-purchase"><label>Quantity<input type="number" value="1" disabled></label><button type="button" disabled>Add to cart</button></div><p class="customer-demo-note">Preview only. Availability and cart actions are not connected.</p>
        <p class="customer-pickup">Local pickup in Madisonville</p>
        <section class="customer-notes"><h3>Product details</h3>${lines(product.details).length ? `<ul>${lines(product.details).map((line) => `<li>${e(line)}</li>`).join("")}</ul>` : "<p>Add details in step 2 to see them here.</p>"}</section>
        <section class="customer-notes"><h3>Ingredients or materials</h3>${lines(product.ingredients).length ? `<ul>${lines(product.ingredients).map((line) => `<li>${e(line)}</li>`).join("")}</ul>` : "<p>Only items you enter in step 2 appear here.</p>"}</section>
      </section>
    </div></article>`;
}
