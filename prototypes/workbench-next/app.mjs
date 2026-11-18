import { exampleProduct, changeVariant, productIssues, validPrice } from "../editor/model.mjs";
import { compactCard, collectionCard, productPage } from "../guided-next/preview.mjs";
import { draftKey, encodeDraft, decodeDraft } from "./drafts.mjs";
import { escapeHtml as e } from "../scripts/dom.mjs";

const mode = new URLSearchParams(location.search).get("mode") === "new" ? "new" : "edit";
const key = draftKey(mode);
let product = exampleProduct(mode);
let photoUrl = "";
let missingPhoto = false;
let dirty = false;
let blocked = false;
let paused = false;
let timer;
let sequence = 3;
let pendingAction;
let previewView = "card";
let previewVariant;
let previewOpener;
const form = document.querySelector("#product-form");
const scroller = document.querySelector(".bench-form-scroll");
const draftState = document.querySelector("#draft-state");
const feedback = document.querySelector("#flow-feedback");
const preview = document.querySelector("#customer-preview");
const actionDialog = document.querySelector("#record-action");
const publishDialog = document.querySelector("#publish-review");
const source = () => photoUrl || `../assets/${product.category === "honey" ? "honey-jar" : product.category === "soap" ? "soap" : "candle"}.svg`;
const announce = (message) => { feedback.textContent = message; feedback.focus({ preventScroll: true }); };
const state = (message) => { draftState.textContent = message; };

document.querySelector("#editor-title").textContent = mode === "new" ? "Add a product." : "Edit your product.";
document.querySelector("#save-local").textContent = mode === "new" ? "Save draft" : "Save changes";
const otherMode = new URL(location.href);
otherMode.searchParams.set("mode", mode === "new" ? "edit" : "new");
document.querySelector("#mode-link").href = otherMode.href;
document.querySelector("#mode-link").textContent = mode === "new" ? "Edit example" : "Add product";

function readLocal() {
  try { return decodeDraft(localStorage.getItem(key), mode); }
  catch { return { state: "unavailable" }; }
}
const saved = readLocal();
if (saved.state === "restored") {
  product = saved.product;
  missingPhoto = saved.hasPhoto;
  state(missingPhoto ? "Local draft restored. Reattach your photo; photos are not saved." : "Local draft restored from this device.");
} else if (saved.state === "invalid") {
  blocked = true;
  state("The saved local draft cannot be read. Clear it to start over; it has not been overwritten.");
} else state(saved.state === "unavailable" ? "Local saving is unavailable. Keep this tab open." : "Autosave ready / this device only.");

scroller.innerHTML = `<section id="bench-essentials"><div class="section-heading"><span class="section-number">01</span><div><h2 tabindex="-1">Product essentials</h2><p>A useful first impression.</p></div></div>
  <label>Product name<input name="title" data-field="title" maxlength="160" placeholder="e.g. Amber candle"></label>
  <label>Category<select name="category" data-field="category" aria-label="Category">${["candles", "honey", "soap", "gifts"].map((category) => `<option value="${category}">${category[0].toUpperCase() + category.slice(1)}</option>`).join("")}</select></label>
  <label for="bench-summary">Short description</label><textarea id="bench-summary" data-field="summary" maxlength="1000" rows="3" placeholder="A short, confirmed description for the collection."></textarea>
  <details class="advanced"><summary>About identifiers</summary><p>Existing live product keys and SKUs stay fixed. This fictional prototype never generates or stores real inventory identifiers.</p></details></section>
  <section id="bench-photo"><div class="section-heading"><span class="section-number">02</span><div><h2 tabindex="-1">Photo & details</h2><p>Only the facts you know.</p></div></div>
  <div class="flow-photo"><img id="local-photo" src="${source()}" alt="Current example product image" width="420" height="360"><div><label>Choose a local photo<input type="file" id="photo-input" accept="image/jpeg,image/png,image/webp"></label><p class="help">JPEG, PNG or WebP, up to 8 MB. Device-only preview; never uploaded or saved in local storage.</p><button type="button" class="text-button" data-remove-photo hidden>Remove photo selection</button></div></div>
  <p id="photo-reminder" class="photo-reminder" hidden>Reattach your photo after restoring a local draft. Image files are not saved.</p>
  <label for="bench-details">Product details</label><textarea id="bench-details" data-field="details" maxlength="24011" rows="4" placeholder="Confirmed size, care or use."></textarea>
  <label for="bench-ingredients">Ingredients or materials</label><textarea id="bench-ingredients" data-field="ingredients" maxlength="8192" rows="4" placeholder="One confirmed item per line. Optional."></textarea></section>
  <section id="bench-variants"><div class="section-heading"><span class="section-number">03</span><div><h2 tabindex="-1">Variants</h2><p>Clear actions for every format.</p></div><button type="button" class="outline" data-add-variant>+ Add variant</button></div>
  <div id="variant-list" class="variant-cards"></div><p class="section-note">Archive hides an option and keeps stock/history. Delete is only for unused examples.</p>
  <details class="product-actions"><summary>Whole-product actions</summary><p>These affect every variant.</p><div class="variant-actions"><button type="button" class="outline" data-product-archive>Archive product</button><button type="button" class="danger-link" data-product-delete>Delete product</button></div></details></section>`;

function renderVariants() {
  sequence = Math.max(sequence, ...product.variants.map((v) => Number(v.id.slice(5))));
  document.querySelector("#variant-list").innerHTML = product.variants.map((v) => `<div class="variant-card ${v.active ? "" : "is-archived"}" role="group" aria-label="${e(v.label || "New variant")}" data-variant="${v.id}">
    <div class="variant-heading"><h3>${e(v.label || "New variant")}</h3><span class="status ${v.active ? "active" : "archived"}">${v.active ? "Active" : "Archived"}</span></div>
    <div class="field-pair"><label>Variant name<input data-vfield="label" maxlength="160" value="${e(v.label)}" placeholder="e.g. Amber / 8 oz"></label><label>Price (USD)<span class="price-input"><span aria-hidden="true">$</span><input data-vfield="price" inputmode="decimal" maxlength="32" value="${e(v.price)}" placeholder="18.00"></span></label></div>
    <div class="variant-record"><span>${v.stock} demo units</span><span>${v.history ? "Demo history retained" : "Unused example record"}</span></div><div class="variant-actions"><button type="button" class="outline" data-variant-action="${v.active ? "archive" : "restore"}" data-id="${v.id}">${v.active ? "Archive variant" : "Restore variant"}</button><button type="button" class="danger-link" data-variant-action="delete" data-id="${v.id}">Delete variant</button></div>
  </div>`).join("") || '<p class="empty-note">Add a variant before publishing.</p>';
}
function fillFields() {
  for (const field of form.querySelectorAll("[data-field]")) field.value = product[field.dataset.field] || "";
  renderVariants();
}
function publicationIssues() {
  return [...productIssues(product, true), ...(product.status === "archived" ? ["Restore this product to draft before publishing."] : [])];
}
function update() {
  document.querySelector("#desktop-card").innerHTML = compactCard(product, source());
  document.querySelector("#local-photo").src = source();
  document.querySelector("[data-remove-photo]").hidden = !photoUrl && !missingPhoto;
  document.querySelector("#photo-reminder").hidden = !missingPhoto;
  const issues = publicationIssues();
  document.querySelector("#readiness-summary").textContent = issues.length ? `${issues.length} details to review before demo publication.` : `${product.variants.filter((v) => v.active).length} active formats. Essentials are ready to review.`;
  document.querySelector("[data-save-state]").textContent = product.status === "published" ? "Visible in this demo" : product.status === "archived" ? "Archived in demo" : "Draft / not on storefront";
  document.querySelector("[data-product-archive]").textContent = product.status === "archived" ? "Restore product to draft" : "Archive product";
  document.querySelector("[data-publish]").disabled = product.status === "archived";
}
function persist() {
  window.clearTimeout(timer);
  if (!dirty) return !blocked && !paused;
  if (blocked || paused) return false;
  try {
    const raw = encodeDraft(product, mode, Boolean(photoUrl) || missingPhoto);
    if (decodeDraft(raw, mode).state !== "restored") throw new Error("Invalid draft.");
    localStorage.setItem(key, raw);
    dirty = false;
    state(photoUrl ? "Text draft saved on this device. Photo stays in this tab only." : missingPhoto ? "Text draft saved. Reattach your photo; images are not stored." : "Draft saved on this device. Not published to inventory.");
    return true;
  } catch {
    state("This browser could not save your draft. Keep this tab open; your edits are still here.");
    return false;
  }
}
function changed() {
  dirty = true;
  update();
  if (!blocked && !paused) {
    state("Saving draft on this device...");
    window.clearTimeout(timer);
    timer = window.setTimeout(persist, 250);
  }
}
function clearPhoto() {
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = "";
  missingPhoto = false;
  document.querySelector("#photo-input").value = "";
}
function confirmAction(title, description, label, action) {
  document.querySelector("#action-title").textContent = title;
  document.querySelector("#action-description").textContent = description;
  document.querySelector("#confirm-action").textContent = label;
  pendingAction = action;
  actionDialog.returnValue = "";
  actionDialog.showModal();
  actionDialog.querySelector('[value="cancel"]').focus();
}
actionDialog.addEventListener("close", () => { const action = pendingAction; pendingAction = null; if (actionDialog.returnValue === "confirm") action?.(); });

function reviewPublication(requireValid = false) {
  const issues = publicationIssues();
  if (requireValid && issues.length) { announce(issues.join(" ")); return; }
  document.querySelector("#publish-summary").innerHTML = `<p><strong>${e(product.title || "Unnamed product")}</strong> / ${product.variants.filter((v) => v.active).length} active formats</p>${issues.length ? `<ul>${issues.map((issue) => `<li>${e(issue)}</li>`).join("")}</ul>` : "<p>The fictional product has the essentials for publication.</p>"}`;
  document.querySelector("#confirm-publish").disabled = issues.length > 0;
  publishDialog.returnValue = "";
  publishDialog.showModal();
}
publishDialog.addEventListener("close", () => {
  if (publishDialog.returnValue !== "confirm" || publicationIssues().length) return;
  product.status = "published";
  changed();
  persist();
  announce("Demo publication confirmed. The real storefront was not changed.");
});
document.querySelector("#save-local").addEventListener("click", () => {
  const issues = productIssues(product);
  if (issues.length) { announce(issues.join(" ")); return; }
  dirty = true;
  if (persist()) announce("Draft saved on this device. Publication is unchanged.");
  else announce(blocked ? "The saved draft cannot be read. Clear it before replacing it." : paused ? "Review the draft changed in another tab before saving." : "Local save could not be verified. Keep this tab open.");
});
form.addEventListener("submit", (event) => { event.preventDefault(); document.querySelector("#save-local").click(); });

form.addEventListener("input", (event) => {
  const input = event.target;
  if (input.dataset.field) product[input.dataset.field] = input.value;
  else if (input.dataset.vfield) {
    const row = input.closest("[data-variant]");
    product.variants.find((v) => v.id === row.dataset.variant)[input.dataset.vfield] = input.value;
    if (input.dataset.vfield === "label") {
      row.querySelector("h3").textContent = input.value || "New variant";
      row.setAttribute("aria-label", input.value || "New variant");
    }
  } else return;
  changed();
});
form.addEventListener("change", (event) => {
  if (event.target.id !== "photo-input" || !event.target.files[0]) return;
  const file = event.target.files[0];
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
    event.target.value = "";
    announce("Choose a JPEG, PNG or WebP up to 8 MB. No file was uploaded.");
    return;
  }
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = URL.createObjectURL(file);
  missingPhoto = false;
  changed();
  announce("Local photo preview ready. The file was not uploaded and is not saved with your text draft.");
});
form.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.jump) {
    const section = document.querySelector(`#bench-${button.dataset.jump}`);
    scroller.scrollTo({ top: section.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    section.querySelector("h2").focus({ preventScroll: true });
    for (const tab of form.querySelectorAll("[data-jump]")) { if (tab === button) tab.setAttribute("aria-current", "true"); else tab.removeAttribute("aria-current"); }
  } else if (button.hasAttribute("data-add-variant")) {
    if (product.variants.length >= 50) { announce("Review no more than 50 variants."); return; }
    const id = `demo-${++sequence}`;
    product.variants.push({ id, label: "", price: "", active: true, stock: 0, history: false });
    renderVariants(); changed(); document.querySelector(`[data-variant="${id}"] input`).focus();
  } else if (button.dataset.variantAction) {
    const { id, variantAction: action } = button.dataset;
    const result = changeVariant(product, id, action);
    const archive = result.error && action === "delete" && !changeVariant(product, id, "archive").error;
    confirmAction(result.error ? "Keep this variant's records." : `${action === "delete" ? "Delete" : action === "archive" ? "Archive" : "Restore"} this variant?`, result.error || "Only the fictional example changes. Archive keeps all stock/history; deletion is only for unused records.", result.error ? archive ? "Archive variant instead" : "Keep variant" : `${action === "delete" ? "Delete" : action === "archive" ? "Archive" : "Restore"} variant`, () => {
      if (result.error && !archive) return;
      product = changeVariant(product, id, archive ? "archive" : action).product;
      renderVariants(); changed();
      announce(action === "delete" && !archive ? "Variant deleted in this demo only." : "Variant state changed in this demo. Stock and history retained.");
    });
  } else if (button.hasAttribute("data-remove-photo")) { clearPhoto(); changed(); }
  else if (button.hasAttribute("data-publish")) reviewPublication(true);
  else if (button.hasAttribute("data-product-archive") || button.hasAttribute("data-product-delete")) {
    const deletion = button.hasAttribute("data-product-delete");
    const blockedDelete = deletion && product.variants.some((v) => v.stock || v.history);
    confirmAction(blockedDelete ? "Keep the product's history." : "Change the whole product?", blockedDelete ? "Stock or history prevents deletion. Archive the whole product instead." : "This affects every format in this fictional example.", blockedDelete ? "Archive product instead" : deletion ? "Delete product" : product.status === "archived" ? "Restore to draft" : "Archive product", () => {
      if (deletion && !blockedDelete) { product = exampleProduct("new"); clearPhoto(); fillFields(); }
      else product.status = product.status === "archived" && !blockedDelete ? "draft" : "archived";
      changed(); announce("Fictional product updated. No real inventory was changed.");
    });
  }
});
document.querySelector("[data-review]").addEventListener("click", () => reviewPublication());
document.querySelector("[data-clear-draft]").addEventListener("click", () => {
  confirmAction("Clear this local draft?", "Remove this mode's draft from this device and reset the example, including any photo selected in this tab. Other drafts and real inventory are untouched.", "Clear local draft", () => {
    try { localStorage.removeItem(key); } catch { state("This browser could not clear the local draft. Your edits are kept."); return; }
    window.clearTimeout(timer); product = exampleProduct(mode); clearPhoto(); blocked = false; paused = false; dirty = false;
    document.querySelector(".draft-conflict").hidden = true; fillFields(); update(); scroller.scrollTop = 0; state("Local draft cleared. Autosave ready.");
  });
});
window.addEventListener("storage", (event) => {
  if (event.key !== key && event.key !== null) return;
  window.clearTimeout(timer); paused = true; document.querySelector(".draft-conflict").hidden = false;
  state("Draft changed in another tab. Review before autosaving.");
});
document.querySelector("[data-keep-draft]").addEventListener("click", () => { paused = false; blocked = false; dirty = true; document.querySelector(".draft-conflict").hidden = true; persist(); });
document.querySelector("[data-load-draft]").addEventListener("click", () => {
  const other = readLocal();
  if (other.state !== "restored") { state("The saved draft is unavailable or invalid. Your current edits are kept."); return; }
  window.clearTimeout(timer); product = other.product; clearPhoto(); missingPhoto = other.hasPhoto; paused = false; blocked = false; dirty = false;
  document.querySelector(".draft-conflict").hidden = true; fillFields(); update(); state("Local draft restored from this device.");
});

function renderPreview() {
  document.querySelector("#customer-view").innerHTML = previewView === "card" ? `<div class="modal-card-wrap">${collectionCard(product, source())}</div>` : productPage(product, source(), previewVariant);
  for (const button of preview.querySelectorAll("[data-preview-view]")) button.setAttribute("aria-pressed", String(button.dataset.previewView === previewView));
}
function openPreview(view, opener, variant) {
  previewView = view; if (variant) previewVariant = variant; renderPreview();
  if (!preview.open) { previewOpener = opener; preview.showModal(); preview.querySelector(".close-preview").focus(); }
  else {
    const heading = preview.querySelector(previewView === "product" ? ".customer-product h2" : ".customer-card h3");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
  }
  preview.querySelector(".preview-stage").scrollTop = 0;
}
document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (button?.dataset.openPreview) openPreview(button.dataset.openPreview, button);
  else if (button?.dataset.previewView) openPreview(button.dataset.previewView, button);
  else if (button?.dataset.previewFormat) openPreview("product", button, button.dataset.previewFormat);
});
preview.querySelector(".close-preview").addEventListener("click", () => preview.close());
preview.addEventListener("close", () => previewOpener?.focus({ preventScroll: true }));
preview.addEventListener("change", (event) => {
  if (!event.target.hasAttribute("data-page-variant")) return;
  previewVariant = event.target.value;
  const v = product.variants.find((item) => item.id === previewVariant);
  preview.querySelector("[data-customer-price]").textContent = v && validPrice(v.price) ? `$${Number(v.price).toFixed(2)}` : "Price to come";
});
document.querySelector(".bench-layout").addEventListener("wheel", (event) => {
  if (event.target.closest(".bench-form-scroll") || document.querySelector("dialog[open]") || event.ctrlKey || event.metaKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
  scroller.scrollBy({ top: event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroller.clientHeight : 1), behavior: "instant" }); event.preventDefault();
}, { passive: false });
export function confirmLeave() {
  const saved = persist();
  return (!dirty && saved && !photoUrl) || window.confirm(photoUrl ? "Text drafts are saved separately. This selected photo will not be restored after leaving. Continue?" : "This draft is not safely saved on this device. Leave and discard these edits?");
}
for (const link of document.querySelectorAll(".flow-header a"))
  link.addEventListener("click", (event) => { if (!confirmLeave()) event.preventDefault(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") persist(); });
window.addEventListener("pagehide", (event) => { persist(); if (!event.persisted && photoUrl) URL.revokeObjectURL(photoUrl); });
fillFields();
update();
