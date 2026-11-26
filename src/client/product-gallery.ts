const gallery = document.querySelector<HTMLElement>("[data-product-gallery]");
if (gallery) {
  const scope = gallery.closest("[data-product-detail]") ?? document;
  const form = () =>
    scope.querySelector<HTMLFormElement>(
      "[data-add-to-cart]:not([data-quick-add])",
    );
  const radios = () => [
    ...(form()?.querySelectorAll<HTMLInputElement>(
      'input[type="radio"][name="variantKey"]',
    ) ?? []),
  ];
  const show = (key: string) => {
    const radio = radios().find((entry) => entry.value === key);
    if (radio) {
      const price = scope.querySelector("[data-detail-price]");
      const format = scope.querySelector("[data-detail-format]");
      if (price) price.textContent = radio.dataset["variantPrice"] ?? "";
      if (format) format.textContent = radio.dataset["variantLabel"] ?? "";
      const buttonPrice = form()?.querySelector("[data-selected-price]");
      if (buttonPrice)
        buttonPrice.textContent = radio.dataset["variantPrice"] ?? "";
    }
    const template = [
      ...gallery.querySelectorAll<HTMLTemplateElement>(
        "[data-gallery-template]",
      ),
    ].find((entry) => entry.dataset.galleryTemplate === key);
    if (!template) return;
    gallery
      .querySelector("[data-gallery-art]")
      ?.replaceChildren(template.content.cloneNode(true));
    for (const button of gallery.querySelectorAll<HTMLButtonElement>(
      "[data-variant-image]",
    )) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.variantImage === key),
      );
      if (button.dataset.variantImage === key) {
        const note = gallery.querySelector("[data-gallery-note]");
        if (note) note.textContent = button.dataset["variantNote"] ?? "";
      }
    }
  };
  gallery.addEventListener("click", (event) => {
    const button =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>("[data-variant-image]")
        : null;
    if (!button || button.disabled) return;
    const radio = radios().find(
      (entry) => entry.value === button.dataset.variantImage,
    );
    if (
      !radio ||
      radio.disabled ||
      radio.form?.getAttribute("aria-busy") === "true"
    )
      return;
    radio.checked = true;
    radio.dispatchEvent(new Event("change", { bubbles: true }));
  });
  document.addEventListener("change", (event) => {
    const radio = event.target;
    if (
      radio instanceof HTMLInputElement &&
      radios().includes(radio) &&
      radio.checked &&
      !radio.disabled
    )
      show(radio.value);
  });
}
