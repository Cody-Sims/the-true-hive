const gallery = document.querySelector<HTMLElement>("[data-product-gallery]");
if (gallery) {
  const radios = () => [
    ...document.querySelectorAll<HTMLInputElement>(
      '[data-add-to-cart] input[type="radio"][name="variantKey"]',
    ),
  ];
  const show = (key: string) => {
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
    ))
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.variantImage === key),
      );
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
