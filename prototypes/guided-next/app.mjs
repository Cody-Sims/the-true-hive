import { exampleProduct, changeVariant, productIssues, validPrice } from "../editor/model.mjs";
import { collectionCard, productPage } from "./preview.mjs";
import { escapeHtml as e } from "../scripts/dom.mjs";

const isNew = new URLSearchParams(location.search).get("mode") === "new";
let product = exampleProduct(isNew ? "new" : "edit");
let step = 0;
let sequence = 3;
let dirty = false;
let photoUrl = "";
let previewView = "card";
let previewVariant = product.variants[0]?.id;
let previewOpener = null;
let pendingAction = null;
const positions = [0, 0, 0, 0];
const labels = ["Essentials", "Photo & details", "Variants", "Review"];
const form = document.querySelector("#product-form");
const scroller = document.querySelector(".step-scroll");
const feedback = document.querySelector("#flow-feedback");
const preview = document.querySelector("#customer-preview");
const recordAction = document.querySelector("#record-action");
const source = () => photoUrl || `../assets/${product.category === "honey" ? "honey-jar" : product.category === "soap" ? "soap" : "candle"}.svg`;

document.querySelector("#editor-title").textContent = isNew ? "Add a product." : "Edit your product.";
document.querySelector("#save-demo").textContent = isNew ? "Save draft" : "Save changes";
document.querySelector("#mode-link").href = isNew ? "?mode=edit" : "?mode=new";
document.querySelector("#mode-link").textContent = isNew ? "Edit example" : "Add product";
document.querySelector(".flow-steps").innerHTML = labels.map((label, index) => `<button type="button" data-step="${index}" aria-controls="step-${index}" ${index === 0 ? 'aria-current="step"' : ""}><span>${index + 1}</span><span>${label}</span></button>`).join("");
scroller.innerHTML = `
  <section id="step-0" data-step-panel="0" aria-labelledby="heading-0">
    <div class="step-intro"><p class="eyebrow">First, the essentials</p><h2 id="heading-0" tabindex="-1">Tell its story.</h2><p>A name, a category, a little about what you make.</p></div>
    <label>Product name<input name="title" data-field="title" maxlength="160" value="${e(product.title)}" placeholder="e.g. Amber candle"></label>
    <label>Category<select name="category" data-field="category" aria-label="Category">${["candles", "honey", "soap", "gifts"].map((category) => `<option value="${category}" ${category === product.category ? "selected" : ""}>${category[0].toUpperCase() + category.slice(1)}</option>`).join("")}</select></label>
    <label for="summary-input">Short description</label><textarea id="summary-input" name="summary" data-field="summary" maxlength="1000" rows="4" placeholder="A short, confirmed description for your customers.">${e(product.summary)}</textarea>
    <div class="field-guidance"><span aria-hidden="true">i</span><p>Keep this short and useful. Longer details and ingredients come next. Saving a draft does not publish it.</p></div>
    <details class="advanced"><summary>About product identifiers</summary><p>The live editor keeps permanent keys and SKUs stable. This prototype does not create real identifiers.</p></details>
  </section>
  <section id="step-1" data-step-panel="1" aria-labelledby="heading-1" hidden>
    <div class="step-intro"><p class="eyebrow">A closer look</p><h2 id="heading-1" tabindex="-1">Photo & details</h2><p>Show the product, then share only what you know.</p></div>
    <div class="flow-photo"><img id="local-photo" src="${source()}" alt="Current example product image" width="420" height="360"><div><label>Choose a local photo<input type="file" id="photo-input" accept="image/jpeg,image/png,image/webp"></label><p class="help">JPEG, PNG or WebP, up to 8 MB. Device-only preview; never uploaded.</p><button type="button" class="text-button" data-remove-photo hidden>Remove local photo</button></div></div>
    <label for="details-input">Product details</label><textarea id="details-input" data-field="details" rows="4" placeholder="Confirmed size, care or use. One paragraph per line.">${e(product.details)}</textarea>
    <label for="ingredients-input">Ingredients or materials</label><textarea id="ingredients-input" data-field="ingredients" rows="4" placeholder="One confirmed item per line. Optional.">${e(product.ingredients || "")}</textarea>
    <p class="help">Open Preview, then click the card image to see how this information sits on a product page.</p>
  </section>
  <section id="step-2" data-step-panel="2" aria-labelledby="heading-2" hidden>
    <div class="step-intro variant-step-intro"><div><p class="eyebrow">Every size, scent or format</p><h2 id="heading-2" tabindex="-1">Variants</h2><p>Hide an option without losing its history.</p></div><button type="button" class="outline" data-add-variant>+ Add variant</button></div>
    <div id="variant-list" class="variant-cards"></div><p class="section-note">Archive keeps stock and history. Delete is only for unused variants. All examples here are fictional.</p>
  </section>
  <section id="step-3" data-step-panel="3" aria-labelledby="heading-3" hidden>
    <div class="step-intro"><p class="eyebrow">One last look</p><h2 id="heading-3" tabindex="-1">Review your product</h2><p>Check both the collection card and the full product page before publishing.</p></div>
    <div id="review-summary"></div><button type="button" class="outline review-preview" data-open-preview="product">Preview the product page <span aria-hidden="true">&nearr;</span></button>
    <div class="publication-choice"><span id="publication-label" class="status"></span><p>Save keeps publication unchanged. Publishing this demo never changes the real storefront.</p><button type="button" data-publish>Publish demo</button></div>
    <details class="product-actions"><summary>Whole-product actions</summary><p>These affect every variant, not just one format.</p><div class="variant-actions"><button type="button" class="outline" data-product-archive>Archive product</button><button type="button" class="danger-link" data-product-delete>Delete product</button></div></details>
  </section>`;

function renderVariants() {
  document.querySelector("#variant-list").innerHTML = product.variants.map((variant) => `<div class="variant-card ${variant.active ? "" : "is-archived"}" role="group" aria-label="${e(variant.label || "New variant")}" data-variant="${variant.id}">
    <div class="variant-heading"><h3>${e(variant.label || "New variant")}</h3><span class="status ${variant.active ? "active" : "archived"}">${variant.active ? "Active" : "Archived"}</span></div>
    <label>Variant name<input data-vfield="label" maxlength="160" value="${e(variant.label)}" placeholder="e.g. Amber / 8 oz"></label>
    <label>Price (USD)<span class="price-input"><span aria-hidden="true">$</span><input data-vfield="price" inputmode="decimal" value="${e(variant.price)}" placeholder="18.00"></span></label>
    <p class="help">Dollars, not cents. Blank prices are fine for drafts.</p><div class="variant-record"><span>${variant.stock} demo units</span><span>${variant.history ? "Demo history retained" : "Unused example record"}</span></div>
    <div class="variant-actions"><button type="button" class="outline" data-variant-action="${variant.active ? "archive" : "restore"}" data-id="${variant.id}">${variant.active ? "Archive variant" : "Restore variant"}</button><button type="button" class="danger-link" data-variant-action="delete" data-id="${variant.id}">Delete variant</button></div>
    <p class="action-help">${variant.active ? "Archive hides this format and keeps all its records." : "Archived: hidden from the storefront. Restore when it is ready."}</p>
  </div>`).join("") || '<p class="empty-note">No variants yet. Add a format before publishing.</p>';
}

function updatePresentation() {
  document.querySelector("#desktop-card").innerHTML = collectionCard(product, source());
  document.querySelector("#local-photo").src = source();
  document.querySelector("[data-remove-photo]").hidden = !photoUrl;
  document.querySelector("#dirty-state").textContent = dirty ? "Unsaved demo edits" : "Example / demo only";
  const issues = productIssues(product, true);
  document.querySelector("#review-summary").innerHTML = `<div class="review-summary"><p><span>Product</span><strong>${e(product.title || "Name needed")}</strong></p><p><span>Formats</span><strong>${product.variants.filter((variant) => variant.active).length} active / ${product.variants.filter((variant) => !variant.active).length} archived</strong></p><p><span>Publication</span><strong>${product.status === "published" ? "Published in demo" : product.status === "archived" ? "Archived in demo" : "Draft / not visible"}</strong></p></div>${issues.length ? `<ul class="review-issues">${issues.map((issue) => `<li>${e(issue)}</li>`).join("")}</ul>` : '<p class="ready-note">The example has the essentials. The decision to publish is still yours.</p>'}`;
  document.querySelector("#publication-label").textContent = product.status === "published" ? "Published in this demo" : product.status === "archived" ? "Archived product" : "Draft / not on storefront";
  document.querySelector("[data-publish]").disabled = product.status === "archived";
  document.querySelector("[data-product-archive]").textContent = product.status === "archived" ? "Restore product to draft" : "Archive product";
  if (preview.open) renderPreview();
}

function setStep(next) {
  positions[step] = scroller.scrollTop;
  step = Math.max(0, Math.min(3, next));
  for (const panel of scroller.querySelectorAll("[data-step-panel]")) panel.hidden = Number(panel.dataset.stepPanel) !== step;
  for (const button of form.querySelectorAll("[data-step]")) {
    if (Number(button.dataset.step) === step) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  }
  document.querySelector("[data-previous]").disabled = step === 0;
  document.querySelector("[data-next]").disabled = step === 3;
  scroller.scrollTop = positions[step];
  document.querySelector(`#heading-${step}`).focus({ preventScroll: true });
}

function announce(message) {
  feedback.textContent = message;
  feedback.focus({ preventScroll: true });
}

function renderPreview() {
  document.querySelector("#customer-view").innerHTML = previewView === "card" ? `<div class="modal-card-wrap">${collectionCard(product, source())}<p class="card-flip-hint">Tap the image to step into the product page.</p></div>` : productPage(product, source(), previewVariant);
  for (const button of preview.querySelectorAll(".preview-view-switch button"))
    button.setAttribute("aria-pressed", String(button.dataset.previewView === previewView));
  preview.dataset.view = previewView;
}

function showPreview(view, opener, variantId) {
  previewView = view;
  if (variantId) previewVariant = variantId;
  renderPreview();
  if (!preview.open) {
    previewOpener = opener;
    preview.showModal();
    preview.querySelector(".preview-stage").scrollTop = 0;
    preview.querySelector(".close-preview").focus({ preventScroll: true });
  } else {
    preview.querySelector(".preview-stage").scrollTop = 0;
    const target = previewView === "product" ? preview.querySelector(".customer-product h2") : preview.querySelector(".customer-card h3");
    target?.setAttribute("tabindex", "-1");
    target?.focus({ preventScroll: true });
  }
}

preview.querySelector(".close-preview").addEventListener("click", () => preview.close());
preview.addEventListener("close", () => { previewOpener?.focus({ preventScroll: true }); });
preview.addEventListener("change", (event) => {
  if (!event.target.hasAttribute("data-page-variant")) return;
  previewVariant = event.target.value;
  const variant = product.variants.find((entry) => entry.id === previewVariant);
  preview.querySelector("[data-customer-price]").textContent = variant && validPrice(variant.price) ? `$${Number(variant.price).toFixed(2)}` : "Price to come";
});
document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (button?.dataset.openPreview) showPreview(button.dataset.openPreview, button);
  else if (button?.dataset.previewView) showPreview(button.dataset.previewView, button);
  else if (button?.dataset.previewFormat) showPreview("product", button, button.dataset.previewFormat);
});

function confirmAction(title, description, label, action) {
  document.querySelector("#action-title").textContent = title;
  document.querySelector("#action-description").textContent = description;
  document.querySelector("#confirm-action").textContent = label;
  pendingAction = action;
  recordAction.returnValue = "";
  recordAction.showModal();
  recordAction.querySelector('[value="cancel"]').focus();
}
recordAction.addEventListener("close", () => {
  const action = pendingAction;
  pendingAction = null;
  if (recordAction.returnValue === "confirm") action?.();
});

function applyVariant(id, action) {
  const result = changeVariant(product, id, action);
  if (result.error) { announce(result.error); return; }
  product = result.product;
  dirty = true;
  renderVariants();
  updatePresentation();
  announce(action === "delete" ? "Variant deleted in this demo only." : action === "archive" ? "Variant archived in this demo. Stock and history retained." : "Variant restored in this demo. No real records changed.");
}

form.addEventListener("input", (event) => {
  const input = event.target;
  if (input.dataset.field) product[input.dataset.field] = input.value;
  else if (input.dataset.vfield) {
    const row = input.closest("[data-variant]");
    const variant = product.variants.find((entry) => entry.id === row.dataset.variant);
    variant[input.dataset.vfield] = input.value;
    if (input.dataset.vfield === "label") {
      row.querySelector("h3").textContent = input.value || "New variant";
      row.setAttribute("aria-label", input.value || "New variant");
    }
  } else return;
  dirty = true;
  updatePresentation();
});

form.addEventListener("change", (event) => {
  if (event.target.id !== "photo-input") return;
  const file = event.target.files[0];
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
    event.target.value = "";
    announce("Choose a JPEG, PNG or WebP up to 8 MB. No file was uploaded.");
    return;
  }
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = URL.createObjectURL(file);
  dirty = true;
  updatePresentation();
  announce("Local photo preview ready. The file stays on this device.");
});

form.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.hasAttribute("data-next")) setStep(step + 1);
  else if (button.hasAttribute("data-previous")) setStep(step - 1);
  else if (button.dataset.step !== undefined) setStep(Number(button.dataset.step));
  else if (button.hasAttribute("data-add-variant")) {
    if (product.variants.length >= 50) { announce("The demo supports up to 50 variants."); return; }
    const id = `demo-${++sequence}`;
    product.variants.push({ id, label: "", price: "", active: true, stock: 0, history: false });
    dirty = true;
    renderVariants();
    updatePresentation();
    document.querySelector(`[data-variant="${id}"] input`).focus();
  } else if (button.dataset.variantAction) {
    const { id, variantAction: action } = button.dataset;
    const result = changeVariant(product, id, action);
    if (result.error) {
      const archive = action === "delete" && !changeVariant(product, id, "archive").error;
      confirmAction("Keep this variant's records.", result.error, archive ? "Archive variant instead" : "Keep variant", () => { if (archive) applyVariant(id, "archive"); });
    } else {
      confirmAction(`${action === "delete" ? "Delete" : action === "archive" ? "Archive" : "Restore"} this variant?`, action === "delete" ? "This unused demo variant will be permanently removed from the example. The whole product is not deleted." : "Archive hides the format and keeps its stock/history. Restore makes it active again, without publishing an unpublished product.", `${action === "delete" ? "Delete" : action === "archive" ? "Archive" : "Restore"} variant`, () => applyVariant(id, action));
    }
  } else if (button.hasAttribute("data-publish")) save(true);
  else if (button.hasAttribute("data-remove-photo")) {
    URL.revokeObjectURL(photoUrl);
    photoUrl = "";
    document.querySelector("#photo-input").value = "";
    dirty = true;
    updatePresentation();
  } else if (button.hasAttribute("data-product-archive") || button.hasAttribute("data-product-delete")) {
    const deletion = button.hasAttribute("data-product-delete");
    const blocked = deletion && product.variants.some((variant) => variant.stock || variant.history);
    confirmAction(blocked ? "Keep the product's history." : deletion ? "Delete this product?" : "Change the whole product?", blocked ? "Stock or history prevents deletion. Archive the whole product instead." : "This affects every variant. Only the fictional example changes.", blocked ? "Archive product instead" : deletion ? "Delete product" : product.status === "archived" ? "Restore to draft" : "Archive product", () => {
      if (deletion && !blocked) {
        product = exampleProduct("new");
        if (photoUrl) URL.revokeObjectURL(photoUrl);
        photoUrl = "";
        document.querySelector("#photo-input").value = "";
        positions.fill(0);
        for (const input of form.querySelectorAll("[data-field]")) input.value = product[input.dataset.field] || "";
        renderVariants();
        setStep(0);
      } else product.status = product.status === "archived" && !blocked ? "draft" : "archived";
      dirty = true;
      updatePresentation();
      announce(deletion && !blocked ? "Fictional product deleted. Start a new draft." : "Demo product state updated. All stock and history retained.");
    });
  }
});

function save(publish = false) {
  const issues = productIssues(product, publish);
  if (issues.length) { announce(issues.join(" ")); return; }
  if (publish) product.status = "published";
  dirty = false;
  updatePresentation();
  announce(publish ? "Demo publication confirmed. The real storefront did not change." : "Demo edits saved for this tab. Publication is unchanged; reload resets the example.");
}
document.querySelector("#save-demo").addEventListener("click", () => save());
form.addEventListener("submit", (event) => { event.preventDefault(); save(); });
for (const link of document.querySelectorAll(".flow-header a"))
  link.addEventListener("click", (event) => { if (dirty && !window.confirm("Leave and discard your unsaved demo edits?")) event.preventDefault(); });
window.addEventListener("pagehide", (event) => { if (!event.persisted && photoUrl) URL.revokeObjectURL(photoUrl); });
renderVariants();
updatePresentation();
setStep(0);
