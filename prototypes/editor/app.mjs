import { editorDesigns } from "./manifest.mjs";
import { exampleProduct, changeVariant, productIssues } from "./model.mjs";
import { escapeHtml as e } from "../scripts/dom.mjs";

const params = new URLSearchParams(location.search);
const design = editorDesigns.find((entry) => entry.id === params.get("design"));
const mode = params.get("mode") === "new" ? "new" : "edit";
const app = document.querySelector("#app");
const dialog = document.querySelector("#action-dialog");
let product = exampleProduct(mode);
let selected = product.variants[0]?.id;
let step = 0;
let sequence = 3;
let dirty = false;
let notice = "";
let photoUrl = "";
let pendingAction = null;
const steps = ["Essentials", "Photo & details", "Variants", "Review"];
const href = (id, editorMode = mode) => `index.html?design=${id}&mode=${editorMode}`;
const artwork = () => photoUrl || `../assets/${product.category === "honey" ? "honey-jar" : product.category === "soap" ? "soap" : "candle"}.svg`;
const tag = (active) => `<span class="status ${active ? "active" : "archived"}">${active ? "Active" : "Archived"}</span>`;

if (!design) {
  app.innerHTML = `<section class="gallery-hero"><p class="eyebrow">The product editor / Three directions</p><h1>A calmer place<br>to <em>tend your products.</em></h1><p>Adding a candle should feel simple. Compare three ways to write the story, manage formats and decide what belongs on the storefront.</p></section>
    <section class="design-grid" aria-label="Product editor directions">${editorDesigns.map((entry) => `<article class="design-card">
      <a href="${href(entry.id, "edit")}" class="design-art art-${entry.id}" tabindex="-1" aria-hidden="true"><div class="mini-window"><span class="mini-top"></span><span class="mini-side"></span><span class="mini-photo"></span><span class="mini-field f1"></span><span class="mini-field f2"></span><span class="mini-field f3"></span><span class="mini-option o1"></span><span class="mini-option o2"></span><span class="mini-action"></span></div></a>
      <div class="design-card-copy"><p class="eyebrow">Direction ${entry.number} / ${entry.note}</p><h2><a href="${href(entry.id, "edit")}">${entry.name} <span aria-hidden="true">&nearr;</span></a></h2><p>${entry.description}</p><div class="card-links"><a href="${href(entry.id, "edit")}">Edit example <span aria-hidden="true">&rarr;</span></a><a href="${href(entry.id, "new")}">Try adding a product</a></div></div>
    </article>`).join("")}</section><section class="gallery-note"><h2>Same job. Three different flows.</h2><p>Every direction has visible <strong>Archive variant</strong>, <strong>Restore variant</strong> and <strong>Delete variant</strong> actions. Archive hides a format while keeping its history; deletion is limited to unused records. These are proposals, not a selected live redesign.</p></section>`;
} else {
  document.body.dataset.design = design.id;
  document.title = `${design.name} / ${mode === "new" ? "Add" : "Edit"} product | The True Hive`;
  document.querySelector("#review-controls").hidden = false;
  const direction = document.querySelector("#direction");
  direction.innerHTML = editorDesigns.map((entry) => `<option value="${entry.id}" ${entry.id === design.id ? "selected" : ""}>${entry.number} / ${entry.name}</option>`).join("");
  direction.addEventListener("change", () => { if (allowLeave()) location.href = href(direction.value); else direction.value = design.id; });
  for (const [id, value] of [["edit-mode", "edit"], ["new-mode", "new"]]) {
    const link = document.querySelector(`#${id}`);
    link.href = href(design.id, value);
    if (value === mode) link.setAttribute("aria-current", "page");
  }
  render();
}

function allowLeave() {
  return !dirty || window.confirm("Leave this demo and discard your unsaved example changes?");
}

document.querySelectorAll(".review-header a, .mode-switch a").forEach((link) => {
  link.addEventListener("click", (event) => { if (design && !allowLeave()) event.preventDefault(); });
});

function basics() {
  return `<section class="panel basics" id="essentials"><div class="section-heading"><span class="section-number">01</span><div><h2>Product essentials</h2><p>What should your customer know first?</p></div></div>
    <label>Product name<input name="title" data-field="title" value="${e(product.title)}" maxlength="160" placeholder="e.g. Amber candle" required></label>
    <div class="field-pair"><label>Category<select name="category" data-field="category" aria-label="Category">${["candles", "honey", "soap", "gifts"].map((category) => `<option value="${category}" ${product.category === category ? "selected" : ""}>${category[0].toUpperCase() + category.slice(1)}</option>`).join("")}</select></label><div class="field-note"><span class="label-text">Storefront status</span><span class="status ${product.status === "published" ? "active" : "archived"}" data-publication>${product.status === "published" ? "Published (demo)" : product.status === "archived" ? "Archived product" : "Draft / not visible"}</span></div></div>
    <label>Short description<textarea name="summary" data-field="summary" maxlength="1000" rows="3" placeholder="A short, confirmed description for the collection." required>${e(product.summary)}</textarea></label>
    <details class="advanced"><summary>Technical identifiers <span>Optional in this demo</span></summary><p>The live editor keeps permanent product keys and existing SKUs stable. This prototype does not generate or save real identifiers.</p><label>Example URL name<input value="example-amber-candle" readonly aria-describedby="identifier-note"></label><p id="identifier-note">Fictional preview identifier; not a new storefront URL.</p></details></section>`;
}

function media() {
  return `<section class="panel media-panel" id="photo"><div class="section-heading"><span class="section-number">02</span><div><h2>Photo & details</h2><p>A useful image. Only the facts you know.</p></div></div>
    <div class="photo-row"><div class="photo-frame"><img src="${e(artwork())}" alt="${photoUrl ? "Locally selected demo photograph" : "Candle or goods placeholder illustration"}" width="420" height="360" data-art></div><div><label class="upload-label">Choose a local photo<input type="file" id="photo-input" accept="image/jpeg,image/png,image/webp"></label><p class="help">JPEG, PNG or WebP, up to 8 MB. Previewed on this device only; never uploaded.</p>${photoUrl ? `<button type="button" class="text-button" data-remove-photo>Remove preview photo</button>` : ""}</div></div>
    <label>Product details<textarea name="details" data-field="details" rows="4" placeholder="Confirmed size, care or use information.">${e(product.details)}</textarea></label>
    <label>Ingredients or materials<textarea name="ingredients" data-field="ingredients" rows="3" placeholder="One confirmed item per line. Optional.">${e(product.ingredients || "")}</textarea></label></section>`;
}

function variantCard(variant) {
  return `<div class="variant-card ${variant.active ? "" : "is-archived"}" role="group" aria-label="${e(variant.label || "New variant")}" data-variant="${variant.id}">
    <div class="variant-heading"><div><p class="eyebrow">Format / ${variant.id.replace("demo-", "").padStart(2, "0")}</p><h3>${e(variant.label || "New variant")}</h3></div>${tag(variant.active)}</div>
    <div class="field-pair"><label>Variant name<input data-vfield="label" value="${e(variant.label)}" maxlength="160" placeholder="e.g. Amber / 8 oz"></label><label>Price (USD)<span class="price-input"><span aria-hidden="true">$</span><input data-vfield="price" value="${e(variant.price)}" inputmode="decimal" placeholder="18.00" aria-describedby="price-help-${variant.id}"></span></label></div>
    <p class="help" id="price-help-${variant.id}">Dollars, not cents. A price can stay blank while drafting.</p>
    <div class="variant-record"><span><strong>${variant.stock}</strong> demo units</span><span>${variant.history ? "Demo history retained" : "Unused example record"}</span></div>
    <div class="variant-actions"><button type="button" class="outline" data-variant-action="${variant.active ? "archive" : "restore"}" data-id="${variant.id}">${variant.active ? "Archive variant" : "Restore variant"}</button><button type="button" class="danger-link" data-variant-action="delete" data-id="${variant.id}">Delete variant</button></div>
    <p class="action-help">${variant.active ? "Archive hides this option from the storefront and keeps its records." : "Archived: hidden from the storefront. Stock and history stay intact."} Delete is only for unused records.</p>
  </div>`;
}

function variants() {
  const focused = product.variants.find((entry) => entry.id === selected) || product.variants[0];
  if (focused) selected = focused.id;
  const cards = design.id === "variant-desk" ? (focused ? [focused] : []) : product.variants;
  return `<section class="panel variants-panel" id="variants"><div class="section-heading"><span class="section-number">03</span><div><h2>Variants <span class="count">${product.variants.length}</span></h2><p>A size, scent or format. One clear set of actions.</p></div><button type="button" class="outline add-variant" data-add-variant>+ Add variant</button></div>
    ${design.id === "variant-desk" && product.variants.length ? `<div class="variant-desk-grid"><nav class="variant-list" aria-label="Choose a variant">${product.variants.map((variant) => `<button type="button" data-select="${variant.id}" ${variant.id === selected ? 'aria-current="true"' : ""}><span>${e(variant.label || "New variant")}</span><small>${variant.active ? "Active" : "Archived"} / ${variant.price ? `$${e(variant.price)}` : "No price"}</small></button>`).join("")}</nav><div class="variant-detail">${cards.map(variantCard).join("")}</div></div>` : `<div class="variant-cards">${cards.map(variantCard).join("")}</div>`}
    ${!product.variants.length ? `<p class="empty-note">No variants yet. Add a format before publishing.</p>` : ""}
    <p class="section-note">Archiving never erases stock or history. Deleting a stocked or previously used option is blocked, even if its current stock is zero.</p></section>`;
}

function preview() {
  return `<aside class="preview-panel" aria-label="Storefront preview"><div class="preview-label"><span class="eyebrow">Customer view</span><span class="live-dot">Live preview</span></div><div class="preview-art"><img src="${e(artwork())}" data-art alt="${photoUrl ? "Locally selected demo photograph" : "Original goods placeholder illustration"}" width="420" height="360"></div><div class="preview-copy"><p class="eyebrow" data-preview-category>${e(product.category)}</p><h2 data-preview-title>${e(product.title || "Your product name")}</h2><p data-preview-summary>${e(product.summary || "A little story about what you make.")}</p><div class="preview-formats">${product.variants.filter((variant) => variant.active).map((variant) => `<span>${e(variant.label || "Your format")} <strong>${variant.price ? `$${e(variant.price)}` : "Price to come"}</strong></span>`).join("") || "<span>No active variants</span>"}</div></div><p class="preview-footnote">Visual preview only. Nothing here is published.</p></aside>`;
}

function review() {
  const issues = productIssues(product, true);
  return `<section class="panel review-panel"><div class="section-heading"><span class="section-number">04</span><div><h2>A final look</h2><p>Saving and publishing are different decisions.</p></div></div><div class="review-summary"><p><span>Product</span><strong>${e(product.title || "Name needed")}</strong></p><p><span>Formats</span><strong>${product.variants.filter((variant) => variant.active).length} active / ${product.variants.filter((variant) => !variant.active).length} archived</strong></p><p><span>Publication</span><strong>${issues.length ? "A few details to finish" : "Ready to review"}</strong></p></div>${issues.length ? `<ul class="review-issues">${issues.map((issue) => `<li>${e(issue)}</li>`).join("")}</ul>` : '<p class="ready-note">The example has the essentials for publication. The choice is still yours.</p>'}<p class="section-note">Stock is managed separately. Saving a draft does not publish it. Publishing this demo never changes the real storefront.</p></section>`;
}

function productActions() {
  return `<details class="product-actions"><summary>Product actions <span>Archive or delete the whole product</span></summary><p>These actions affect every format, not just the selected variant.</p><div class="variant-actions"><button type="button" class="outline" data-product-action="${product.status === "archived" ? "restore" : "archive"}">${product.status === "archived" ? "Restore product to draft" : "Archive product"}</button><button type="button" class="danger-link" data-product-action="delete">Delete product</button></div></details>`;
}

function render(focusSelector = "") {
  const contents = design.id === "guided"
    ? `<div class="guided-frame"><nav class="step-nav" aria-label="Editing steps">${steps.map((label, index) => `<button type="button" data-step="${index}" ${index === step ? 'aria-current="step"' : ""}><span>${index + 1}</span>${label}</button>`).join("")}</nav><div class="guided-content"><div class="guided-main">${[basics, media, variants, review][step]()}</div>${preview()}</div><div class="step-actions"><button type="button" class="quiet" data-step="${Math.max(0, step - 1)}" ${step === 0 ? "disabled" : ""}>Previous</button><span>Step ${step + 1} of 4</span><button type="button" class="outline" data-step="${Math.min(3, step + 1)}" ${step === 3 ? "disabled" : ""}>Next step <span aria-hidden="true">&rarr;</span></button></div></div>`
    : design.id === "variant-desk"
      ? `<div class="desk-layout"><div class="desk-essentials">${basics()}<details class="desk-more"><summary>Photo & longer details</summary>${media()}</details></div><div class="desk-main">${variants()}${review()}</div>${preview()}</div>`
      : `<div class="workbench-layout"><div class="editor-main">${basics()}${media()}${variants()}</div><div class="editor-rail">${preview()}${review()}</div></div>`;
  app.innerHTML = `<div class="editor-shell" data-editor="${design.id}"><div class="page-heading"><div><p class="eyebrow">${design.number} / ${design.name} <span class="heading-separator">/</span> Product workspace</p><h1>${mode === "new" ? "Add a product." : "Edit your product."}</h1><p>${design.note} ${mode === "new" ? "Start simple. Nothing goes live until you decide." : "Keep the details fresh and every format in order."}</p></div><div class="document-state"><span class="state-dot ${dirty ? "unsaved" : ""}"></span><span data-dirty>${dirty ? "Unsaved demo changes" : "Example loaded"}</span></div></div>
    <p id="editor-status" class="editor-status ${notice ? "has-notice" : ""}" role="status" tabindex="-1">${e(notice)}</p>
    <form id="product-form" novalidate>${contents}${productActions()}<div class="save-bar"><div><strong data-save-state>${product.status === "published" ? "Visible in this demo" : product.status === "archived" ? "Archived in this demo" : "Draft / not on storefront"}</strong><span>Demo only. Reload to reset.</span></div><div class="save-actions"><button type="submit" class="outline" name="save">${mode === "new" ? "Save draft" : "Save changes"}</button><button type="button" data-publish ${product.status === "archived" ? "disabled" : ""}>Publish demo <span aria-hidden="true">&nearr;</span></button></div></div></form></div>`;
  if (focusSelector) {
    const target = app.querySelector(focusSelector);
    if (target && !target.matches("input, button, select, textarea, a, [tabindex]"))
      target.setAttribute("tabindex", "-1");
    target?.focus();
  }
}

function announce(message, focus = false) {
  notice = message;
  const status = document.querySelector("#editor-status");
  status.textContent = message;
  status.classList.add("has-notice");
  if (focus) status.focus();
}

function markDirty() {
  dirty = true;
  document.querySelector("[data-dirty]").textContent = "Unsaved demo changes";
  document.querySelector(".state-dot").classList.add("unsaved");
}

app.addEventListener("input", (event) => {
  const input = event.target;
  if (input.dataset.field) {
    product[input.dataset.field] = input.value;
    const selector = { title: "[data-preview-title]", summary: "[data-preview-summary]", category: "[data-preview-category]" }[input.dataset.field];
    if (selector) app.querySelector(selector).textContent = input.value || (input.dataset.field === "title" ? "Your product name" : "A little story about what you make.");
    if (input.dataset.field === "category" && !photoUrl) app.querySelectorAll("[data-art]").forEach((image) => { image.src = artwork(); });
  } else if (input.dataset.vfield) {
    const variant = product.variants.find((entry) => entry.id === input.closest("[data-variant]").dataset.variant);
    variant[input.dataset.vfield] = input.value;
    if (input.dataset.vfield === "label")
      input.closest("[data-variant]").querySelector("h3").textContent = input.value || "New variant";
  } else return;
  app.querySelector(".preview-formats").innerHTML = product.variants.filter((variant) => variant.active).map((variant) => `<span>${e(variant.label || "Your format")} <strong>${variant.price ? `$${e(variant.price)}` : "Price to come"}</strong></span>`).join("") || "<span>No active variants</span>";
  markDirty();
});

app.addEventListener("change", (event) => {
  if (event.target.id !== "photo-input") return;
  const file = event.target.files[0];
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
    announce("Choose a JPEG, PNG or WebP no larger than 8 MB. No file was uploaded.", true);
    event.target.value = "";
    return;
  }
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = URL.createObjectURL(file);
  dirty = true;
  notice = "Local photo preview only. Your file was not uploaded.";
  render("#editor-status");
});

function confirmAction(title, description, consequence, label, action, blocked = false) {
  document.querySelector("#dialog-title").textContent = title;
  document.querySelector("#dialog-description").textContent = description;
  document.querySelector("#dialog-consequence").textContent = consequence;
  document.querySelector("#dialog-kicker").textContent = blocked ? "Protected record / demo" : "Confirm action / demo";
  document.querySelector("#dialog-confirm").textContent = label;
  pendingAction = action;
  dialog.returnValue = "";
  dialog.showModal();
  dialog.querySelector('[value="cancel"]').focus();
}

dialog.addEventListener("close", () => {
  const action = pendingAction;
  pendingAction = null;
  if (dialog.returnValue === "confirm") action?.();
});

function actOnVariant(id, action) {
  const result = changeVariant(product, id, action);
  if (result.error) {
    announce(result.error, true);
    return;
  }
  product = result.product;
  dirty = true;
  notice = action === "delete" ? "Variant deleted in this demo. No real record was changed." : action === "archive" ? "Variant archived in this demo. Hidden from the storefront; stock and history retained." : "Variant restored in this demo. Its stock and history are unchanged.";
  render("#editor-status");
}

app.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.step !== undefined) {
    step = Number(button.dataset.step);
    render(".guided-main h2");
    app.querySelector(".guided-main")?.scrollIntoView({ block: "start" });
  } else if (button.hasAttribute("data-add-variant")) {
    if (product.variants.length >= 50) { announce("The demo supports up to 50 variants.", true); return; }
    const id = `demo-${++sequence}`;
    product.variants.push({ id, label: "", price: "", active: true, stock: 0, history: false });
    selected = id;
    dirty = true;
    render(`[data-variant="${id}"] input`);
  } else if (button.dataset.select) {
    selected = button.dataset.select;
    render(".variant-detail input");
  } else if (button.dataset.variantAction) {
    const { id, variantAction: action } = button.dataset;
    const variant = product.variants.find((entry) => entry.id === id);
    const result = changeVariant(product, id, action);
    if (result.error) {
      const canArchive = action === "delete" && !changeVariant(product, id, "archive").error;
      confirmAction("This variant cannot be removed.", result.error, "No stock, order history or real product data will be erased.", canArchive ? "Archive variant instead" : "Keep variant", canArchive ? () => actOnVariant(id, "archive") : () => {}, true);
    } else {
      confirmAction(`${action === "archive" ? "Archive" : action === "restore" ? "Restore" : "Delete"} this variant?`, variant.label || "Unnamed example variant", action === "delete" ? "Permanent removal is only available because this example has no stock or history. This does not delete the whole product." : action === "archive" ? "This format will be hidden from the storefront. Stock and history stay intact; you can restore it later." : "This format becomes active again. It does not publish a draft or archived product.", `${action === "archive" ? "Archive" : action === "restore" ? "Restore" : "Delete"} variant`, () => actOnVariant(id, action));
    }
  } else if (button.hasAttribute("data-publish")) {
    save(true);
  } else if (button.dataset.productAction) {
    const action = button.dataset.productAction;
    const blocked = action === "delete" && product.variants.some((variant) => variant.stock || variant.history);
    confirmAction(blocked ? "Keep the product's history." : `${action === "delete" ? "Delete" : action === "archive" ? "Archive" : "Restore"} the whole product?`, blocked ? "Stock or past activity prevents permanent deletion. Archiving hides the whole product and all its formats instead." : "This affects the product and every variant, not just one option.", "Demonstration only. No real inventory is connected.", blocked ? "Archive product instead" : action === "delete" ? "Delete product" : action === "archive" ? "Archive product" : "Restore to draft", () => {
      if (action === "delete" && !blocked) {
        dirty = false;
        app.innerHTML = `<section class="empty-state"><p class="eyebrow">Example removed</p><h1>Product deleted.</h1><p>Only fictional data in this tab was removed.</p><a href="${href(design.id, "new")}">Add a new demo product &rarr;</a></section>`;
      } else {
        product.status = action === "restore" ? "draft" : "archived";
        dirty = true;
        notice = product.status === "archived" ? "Product archived in this demo. All variants and history are retained." : "Product restored to draft in this demo. It is not published.";
        render("#editor-status");
      }
    }, blocked);
  } else if (button.hasAttribute("data-remove-photo")) {
    URL.revokeObjectURL(photoUrl);
    photoUrl = "";
    dirty = true;
    render("#photo-input");
  }
});

function save(publish = false) {
  const issues = productIssues(product, publish);
  if (issues.length) { announce(issues.join(" "), true); return; }
  if (publish) product.status = "published";
  dirty = false;
  notice = publish ? "Demo publication confirmed. The real storefront was not changed." : "Demo changes saved for this tab only. Publication is unchanged; reload resets the example.";
  render("#editor-status");
}

app.addEventListener("submit", (event) => { event.preventDefault(); save(); });
window.addEventListener("pagehide", () => { if (photoUrl) URL.revokeObjectURL(photoUrl); });
