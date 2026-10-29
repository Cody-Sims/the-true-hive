import { formatMoney, findVariant } from "./catalog.mjs";
import { getAvailability, priceCart } from "./commerce-model.mjs";
import { escapeHtml as e } from "./dom.mjs";

const categoryNames = { all: "All goods", honey: "Honey", body: "Soap + body", candles: "Candles", gifts: "Gifts" };

function intro(eyebrow, title, description) {
  return `<section class="page-intro"><div><p class="eyebrow">${e(eyebrow)}</p>
    <h1 id="page-title" tabindex="-1">${e(title)}</h1></div><p>${e(description)}</p></section>`;
}

function productStatus(product, context) {
  const states = product.variants.map((variant) => getAvailability(context.snapshot, variant.id, context.fulfillment));
  if (states.some((state) => state.status === "available")) return { status: "available", message: "Sample pickup availability" };
  if (states.some((state) => state.status === "unknown")) return { status: "unknown", message: "Sample inventory unavailable" };
  if (states.every((state) => state.status === "not_offered")) return { status: "not_offered", message: "Pickup-first; shipping is a later phase" };
  return { status: "sold_out", message: "Sold out in this demo" };
}

function productCard(product, context) {
  const href = context.link("product", { product: product.key });
  const status = productStatus(product, context);
  const minimum = Math.min(...product.variants.map((variant) => variant.priceMinor));
  const price = `${product.variants.length > 1 ? "From " : ""}${formatMoney(minimum)}`;
  return `<article class="shop-card">
    <a class="shop-art tone-${e(product.tone)}" href="${e(href)}" aria-label="Explore ${e(product.title)} concept">
      <span class="concept-label">Concept product</span>
      <img src="${e(product.image)}" alt="" width="420" height="360" loading="lazy">
    </a>
    <p class="product-eyebrow">${e(product.eyebrow)}</p>
    <h2><a href="${e(href)}">${e(product.title)}</a></h2>
    <p class="card-price">${e(price)} <span class="fine-print">sample price</span></p>
    <p class="stock-label" data-status="${e(status.status)}">${e(status.message)}</p>
    <a class="text-link" href="${e(href)}">Explore the concept <span aria-hidden="true">&rarr;</span></a>
  </article>`;
}

export function collectionResults(context, filters) {
  const search = filters.search.trim().toLowerCase();
  let visible = context.products.filter((product) =>
    (filters.category === "all" || product.category === filters.category)
    && `${product.title} ${product.eyebrow}`.toLowerCase().includes(search));
  if (filters.sort !== "featured") {
    visible = [...visible].sort((a, b) => {
      const difference = Math.min(...a.variants.map((variant) => variant.priceMinor))
        - Math.min(...b.variants.map((variant) => variant.priceMinor));
      return filters.sort === "price-asc" ? difference : -difference;
    });
  } else {
    visible = [...visible].sort((a, b) => Number(b.key === "honey-oat-soap") - Number(a.key === "honey-oat-soap"));
  }
  return `<p class="results-count" role="status">${visible.length} concept ${visible.length === 1 ? "product" : "products"}.
      All prices, packaging, and quantities are samples.</p>
    ${visible.length
      ? `<div class="collection-grid">${visible.map((product) => productCard(product, context)).join("")}</div>`
      : `<div class="empty-state"><h2>No concepts match that search.</h2><p>Try a different term or reset the collection filters.</p>
        <button class="secondary-action" data-action="clear-filters">Reset filters</button></div>`}`;
}

export function renderCollection(context, filters) {
  return `${intro(`${context.design.number} / ${context.design.name}`, "Good things, from the hive.",
    "A product-first collection preview for Madisonville. Local pickup comes first; real locations, timing, fees, formulas, and retail honey availability still require approval.")}
    <div class="collection-tools">
      <div class="field"><label for="product-search">Find a concept</label>
        <input id="product-search" type="search" value="${e(filters.search)}" placeholder="Try soap, honey, or candle" autocomplete="off"></div>
      <div class="field"><label for="product-sort">Collection order</label><select id="product-sort">
        <option value="featured"${filters.sort === "featured" ? " selected" : ""}>Collection order</option>
        <option value="price-asc"${filters.sort === "price-asc" ? " selected" : ""}>Sample price: low to high</option>
        <option value="price-desc"${filters.sort === "price-desc" ? " selected" : ""}>Sample price: high to low</option>
      </select></div>
    </div>
    <div class="category-tabs" role="group" aria-label="Filter concept products">
      ${Object.entries(categoryNames).map(([id, label]) => `<button type="button" data-category="${id}"
        aria-pressed="${filters.category === id}">${e(label)}</button>`).join("")}
    </div>
    <div id="collection-results">${collectionResults(context, filters)}</div>
    <aside class="notice"><strong>A future store, not an open one.</strong> The working sample cart demonstrates variant and stock handling.
      It does not reserve anything, collect payment, or take an order. Honey is a future retail concept, not a confirmed harvest offer.
      <a href="plan.html?doc=business">See the local-first business plan</a>.</aside>`;
}

export function renderProduct(context, product, selectedVariant) {
  const variant = product.variants.find((entry) => entry.id === selectedVariant) ?? product.variants[0];
  const availability = getAvailability(context.snapshot, variant.id, context.fulfillment);
  const related = context.products.filter((entry) => entry.key !== product.key).slice(0, 3);
  return `<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="${e(context.home)}">Home concept</a><span aria-hidden="true">/</span>
      <a href="${e(context.link("collection"))}">Collection</a><span aria-hidden="true">/</span><span>${e(product.title)}</span></nav>
    <div class="product-layout">
      <figure class="detail-art tone-${e(product.tone)}"><img src="${e(product.image)}"
        alt="Original concept illustration for ${e(product.title)}; packaging is not final." width="420" height="360">
        <figcaption>Original concept illustration. Not real product photography.</figcaption></figure>
      <section class="product-copy" aria-labelledby="page-title">
        <p class="eyebrow">${e(product.eyebrow)} / Collection concept</p>
        <h1 id="page-title" tabindex="-1">${e(product.title)}</h1><p>${e(product.description)}</p>
        <div class="sample-price"><span id="variant-price">${e(formatMoney(variant.priceMinor))}</span>
          <small>Sample price only. Taxes and pickup terms are not configured.</small></div>
        <form id="product-form" class="purchase-form">
          <div class="field"><label for="product-variant">Sample format</label><select id="product-variant" name="variant">
            ${product.variants.map((entry) => `<option value="${e(entry.id)}"${entry.id === variant.id ? " selected" : ""}>${e(entry.label)}</option>`).join("")}
          </select></div>
          <p id="variant-stock" class="stock-label" data-status="${e(availability.status)}" aria-live="polite">${e(availability.message)}</p>
          <div class="quantity-and-action">
            <div class="field"><label for="product-quantity">Quantity</label><input id="product-quantity" name="quantity" type="number" min="1" max="99" step="1" value="1" required></div>
            <button id="add-to-cart" class="primary-action" type="submit"${availability.status !== "available" ? " disabled" : ""}>Add to demo cart <span aria-hidden="true">&rarr;</span></button>
          </div>
        </form>
        <div id="add-feedback" class="notice" role="status" hidden></div>
        <p class="fulfillment-note"><strong>Local pickup first, shipping later.</strong> Pickup location, ready-time notification, schedule,
          accessibility, and any fees must be confirmed. There is no public pickup appointment or order in this preview.</p>
        <a class="text-link" href="${e(context.link("inventory"))}">See how the sample inventory connects <span aria-hidden="true">&rarr;</span></a>
      </section>
    </div>
    <section class="product-details" aria-labelledby="details-title"><h2 id="details-title">A closer look, before it becomes real.</h2>
      <ul>${product.details.map((detail) => `<li>${e(detail)}</li>`).join("")}</ul>
      <p class="fine-print">These are design-review records. Only approved real products, labels, prices and authoritative stock will enter the live storefront.</p></section>
    <section class="related" aria-labelledby="related-title"><h2 id="related-title">More from the future collection.</h2>
      <div class="collection-grid">${related.map((entry) => productCard(entry, context)).join("")}</div></section>`;
}

function summary(context, cart, checkout = false) {
  return `<aside class="order-summary" aria-labelledby="summary-title"><p class="eyebrow">Sample order, not a purchase</p>
    <h2 id="summary-title">The little details.</h2>
    <div class="summary-row"><span>Concept items</span><strong>${cart.itemCount}</strong></div>
    <div class="summary-row total"><span>Sample merchandise subtotal</span><strong>${e(formatMoney(cart.subtotalMinor))}</strong></div>
    <div class="summary-row"><span>Pickup terms / fees</span><span>To be confirmed</span></div>
    <div class="summary-row"><span>Tax</span><span>Not configured</span></div>
    <p class="fine-print">This is not a payable total. No shipping, tax, pickup fee, discount, or payment has been calculated.</p>
    ${checkout
      ? `<button class="primary-action" type="button" disabled>No payment or order in this prototype</button>`
      : cart.canReview
        ? `<a class="primary-action" href="${e(context.link("checkout"))}">Review checkout concept <span aria-hidden="true">&rarr;</span></a>`
        : `<button class="primary-action" type="button" disabled>Resolve sample availability first</button>`}
    <p class="fine-print">The live site will use a hosted checkout that revalidates stock and prices. Adding to a cart does not reserve stock.</p></aside>`;
}

export function renderCart(context) {
  const cart = priceCart(context.lines, context.products, context.snapshot, context.fulfillment);
  const lines = cart.items.map(({ product, variant, quantity, lineTotalMinor, issue }) =>
    `<article class="cart-line"><a href="${e(context.link("product", { product: product.key }))}" aria-label="View ${e(product.title)}">
      <img src="${e(product.image)}" alt="" width="420" height="360"></a><div>
      <h2><a href="${e(context.link("product", { product: product.key }))}">${e(product.title)}</a></h2>
      <p>${e(variant.label)} &middot; ${e(formatMoney(variant.priceMinor))} sample unit price</p>
      <p><strong>${e(formatMoney(lineTotalMinor))}</strong> sample line subtotal</p>
      ${issue ? `<p class="line-issue">${e(issue)}</p>` : ""}
      <form data-line="${e(variant.id)}"><div class="field"><label for="qty-${e(variant.id)}">Quantity for ${e(product.title)}</label>
        <input id="qty-${e(variant.id)}" name="quantity" type="number" min="0" max="99" step="1" value="${quantity}" required></div>
        <button class="secondary-action" type="submit">Update</button>
        <button class="secondary-action" type="button" data-action="remove" data-variant="${e(variant.id)}"
          aria-label="Remove ${e(product.title)} ${e(variant.label)}">Remove</button></form></div></article>`).join("");
  return `${intro("Your sample collection", "Your demo cart.",
    "A shared sample cart across all ten design directions. Quantities are rechecked against the selected inventory scenario, not reserved.")}
    ${cart.items.length
      ? `<div class="cart-layout"><div>${lines}<button class="secondary-action" data-action="reset">Reset demo cart</button></div>${summary(context, cart)}</div>`
      : `<div class="empty-state"><h2>A little room for good things.</h2><p>No sample items are in the cart.</p>
        <a class="primary-action" href="${e(context.link("collection"))}">Explore the collection <span aria-hidden="true">&rarr;</span></a></div>`}
    <aside class="notice">Try adding two 12 oz sample honey jars, then change the inventory scenario to <strong>12 oz honey: one sample jar left</strong>.
      The cart should block review until corrected, rather than oversell or silently change your quantity.
      <a href="${e(context.link("inventory"))}">Inspect the fixture model</a>.</aside>`;
}

export function renderCheckout(context) {
  const cart = priceCart(context.lines, context.products, context.snapshot, context.fulfillment);
  if (!cart.canReview) {
    return `${intro("A deliberate stopping point", "This sample needs another look.",
      "The cart is empty or the current sample stock cannot support it. No payment, reservation, or order has been created.")}
      <div class="notice"><ul>${(cart.issues.length ? cart.issues : ["Add a concept product before reviewing."]).map((issue) => `<li>${e(issue)}</li>`).join("")}</ul></div>
      <a class="primary-action" href="${e(context.link("cart"))}">Return to the demo cart</a>`;
  }
  return `${intro("Read-only checkout handoff", "A confident next step.",
    "This screen shows where the live website would hand off to hosted checkout. It deliberately does not collect contact details, addresses, or payment.")}
    <div class="cart-layout"><div class="checkout-stages">
      <section class="checkout-stage"><p class="eyebrow">01 / Review</p><h2>Your sample collection</h2>
        ${cart.items.map((item) => `<p><strong>${e(item.product.title)}</strong> &times; ${item.quantity} &middot; ${e(item.variant.label)}</p>`).join("")}
        <a class="text-link" href="${e(context.link("cart"))}">Edit the demo cart &rarr;</a></section>
      <section class="checkout-stage"><p class="eyebrow">02 / Pickup first</p><h2>Make collection clear.</h2>
        <p>The real checkout must show the approved pickup location, preparation time, instructions, accessibility information,
          and any fees before the customer commits. Those business decisions are not configured here.</p></section>
      <section class="checkout-stage"><p class="eyebrow">03 / Hosted checkout</p><h2>Let the platform finish safely.</h2>
        <p>Provider-calculated totals, stock validation, secure payment, receipt, and ready-for-pickup notifications belong to the real commerce platform.
          No order is placed by viewing this concept.</p><a class="text-link" href="plan.html?doc=inventory">Read the inventory and fulfillment requirements &rarr;</a></section>
    </div>${summary(context, cart, true)}</div>`;
}

export function renderInventory(context) {
  const ready = context.snapshot.status === "ready";
  const physical = context.snapshot.levels.reduce((sum, level) => sum + level.onHand, 0);
  const committed = context.snapshot.levels.reduce((sum, level) => sum + level.committed, 0);
  const eligible = context.products.flatMap((product) => product.variants)
    .reduce((sum, variant) => sum + (getAvailability(context.snapshot, variant.id, "pickup").quantity ?? 0), 0);
  const rows = context.snapshot.levels.map((level) => {
    const found = findVariant(level.variantId, context.products);
    const location = context.snapshot.locations.find((entry) => entry.id === level.locationId);
    return `<tr><th scope="row">${e(found.variant.sku)}<br><span class="fine-print">${e(found.product.title)} / ${e(found.variant.label)}</span></th>
      <td>${e(location.name)}<br><span class="fine-print">${location.channels.includes("pickup") ? "Pickup enabled in demo" : "Not an online fulfillment location"}</span></td>
      <td>${ready ? level.onHand : "&mdash;"}</td><td>${ready ? level.committed : "&mdash;"}</td>
      <td>${ready ? level.unavailable : "&mdash;"}</td><td>${ready ? level.available : "&mdash;"}</td></tr>`;
  }).join("");
  return `${intro("Read-only fixture explorer", "Behind the collection.",
    "One fictional inventory snapshot drives the collection, product, and cart previews. This is not a secured admin and contains no real business stock.")}
    <div class="inventory-stats">
      <div class="inventory-stat"><strong>${ready ? physical : "&mdash;"}</strong><span>Sample on-hand units, all locations</span></div>
      <div class="inventory-stat"><strong>${ready ? committed : "&mdash;"}</strong><span>Sample committed units</span></div>
      <div class="inventory-stat"><strong>${ready ? eligible : "&mdash;"}</strong><span>Sample available units in pickup scope</span></div>
    </div>
    ${!ready ? `<p class="notice">Inventory is unavailable in this scenario. Counts are unknown, not zero. Catalog descriptions remain visible; cart additions and review are blocked.</p>` : ""}
    <div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable sample inventory table"><table>
      <caption>Fictional variant/location records. No stock is reduced when adding to the demo cart.</caption>
      <thead><tr><th scope="col">Sample variant / SKU</th><th scope="col">Sample location</th>
      <th scope="col">On hand</th><th scope="col">Committed</th><th scope="col">Other unavailable</th><th scope="col">Available</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <div class="inventory-principles">
      <section><h2>A single authority.</h2><p>Real quantities, orders, stock adjustments, roles, and audit history belong in the selected inventory/commerce system, not local browser storage.</p></section>
      <section><h2>The right scope.</h2><p>Market stock is not automatically pickup or shipping stock. A future harvest forecast is not physical retail inventory.</p></section>
      <section><h2>Visible failures.</h2><p>Unknown inventory blocks purchasing. The production integration must handle retries, duplicate events, reconciliation, and checkout revalidation.</p></section>
    </div>
    <aside class="notice">This review-only lab has no admin credentials, authentication, adjustment endpoint, or business records.
      <a href="plan.html?doc=inventory">Read the actual inventory requirements</a>, or
      <a href="${e(context.link("collection"))}">return to the customer-facing collection</a>.</aside>`;
}
