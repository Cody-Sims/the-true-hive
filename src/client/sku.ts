import { suggestVariantIdentifiers } from "../domain/sku.ts";

const initialized = new WeakSet<Document>();

export function initSkuSuggestions(root: Document = document) {
  if (initialized.has(root)) return;
  initialized.add(root);
  // Delegation also covers rows cloned from the Add variant template.
  root.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const button =
      event.target.closest<HTMLButtonElement>("[data-suggest-sku]");
    const row = button?.closest<HTMLFieldSetElement>("[data-admin-variant]");
    const form = row?.closest<HTMLFormElement>('[data-admin-form="product"]');
    if (!button || !row || !form || button.matches(":disabled")) return;
    if (form.dataset.phase && form.dataset.phase !== "idle") return;
    const status = row.querySelector<HTMLElement>("[data-sku-status]");
    const key = row.querySelector<HTMLInputElement>('[name="variantKey"]');
    const sku = row.querySelector<HTMLInputElement>('[name="sku"]');
    const productKey = form.querySelector<HTMLInputElement>('[name="key"]');
    const label = row.querySelector<HTMLInputElement>('[name="label"]');
    if (!status || !key || !sku || !productKey || !label) return;
    const fillKey = !key.readOnly && !key.value && !key.matches(":disabled");
    const fillSku = !sku.readOnly && !sku.value && !sku.matches(":disabled");
    if (!fillKey && !fillSku) {
      status.textContent =
        "Existing identifiers preserved. Only blank, editable fields can receive suggestions.";
      return;
    }
    try {
      const suggestion = suggestVariantIdentifiers(
        productKey.value,
        label.value,
      );
      for (const other of form.querySelectorAll("[data-admin-variant]")) {
        if (other === row) continue;
        if (
          (fillKey &&
            other.querySelector<HTMLInputElement>('[name="variantKey"]')
              ?.value === suggestion.key) ||
          (fillSku &&
            other.querySelector<HTMLInputElement>('[name="sku"]')?.value ===
              suggestion.sku)
        )
          throw new Error(
            "Local draft collision: use distinct confirmed variant names or enter unique identifiers manually.",
          );
      }
      if (fillKey) key.value = suggestion.key;
      if (fillSku) sku.value = suggestion.sku;
      for (const field of [key, sku])
        field.dispatchEvent(new Event("input", { bubbles: true }));
      status.textContent =
        "Blank identifiers suggested from the product key and variant name. Review before saving; the server checks existing records for uniqueness.";
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : "Enter identifiers manually.";
    }
  });
}
