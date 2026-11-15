const initialized = new WeakSet<Document>();

export function initLabelPrinting(root: Document = document) {
  if (initialized.has(root)) return;
  initialized.add(root);
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    "[data-print-labels]",
  )) {
    button.hidden = false;
    button.addEventListener("click", () => {
      const labels = button.closest("[data-barcode-labels]");
      const status = labels?.querySelector<HTMLElement>(
        "[data-print-label-status]",
      );
      const images = [
        ...(labels?.querySelectorAll<HTMLImageElement>(
          "img[data-sku-barcode]",
        ) ?? []),
      ];
      if (!labels || !status) return;
      if (
        !images.length ||
        labels.querySelector("[data-barcode-unavailable]") ||
        images.some((image) => !image.complete || image.naturalWidth === 0)
      ) {
        status.textContent =
          "Barcode images are unavailable or not ready. Wait or reload before printing; do not use incomplete labels.";
        return;
      }
      status.textContent =
        "Review paper size, scaling and quiet zones in print preview. Test a physical scan before using labels.";
      root.defaultView?.print();
    });
  }
}
