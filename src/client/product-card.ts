for (const card of document.querySelectorAll<HTMLElement>(
  "[data-catalog-card]",
)) {
  const form = card.querySelector<HTMLFormElement>("[data-quick-add]");
  if (!form) continue;
  const templates = new Map(
    [...card.querySelectorAll<HTMLTemplateElement>("[data-card-image]")].map(
      (template) => [template.dataset["cardImage"], template],
    ),
  );
  form.hidden = false;
  card.addEventListener("change", (event) => {
    const radio = event.target;
    if (
      !(radio instanceof HTMLInputElement) ||
      radio.type !== "radio" ||
      !radio.checked ||
      radio.disabled ||
      radio.form !== form
    )
      return;
    const template = templates.get(radio.value);
    if (template)
      card
        .querySelector("[data-card-image-display]")
        ?.replaceChildren(template.content.cloneNode(true));
    for (const price of card.querySelectorAll<HTMLElement>(
      "[data-card-price], [data-selected-price]",
    ))
      price.textContent = radio.dataset["variantPrice"] ?? "";
    const stock = card.querySelector(".card-stock");
    if (stock) {
      stock.textContent =
        radio.dataset["variantStockLabel"] ?? "Availability unverified";
      stock.setAttribute(
        "data-stock-state",
        radio.dataset["variantStockState"] ?? "unverified",
      );
    }
    for (const link of card.querySelectorAll<HTMLAnchorElement>(
      "[data-card-link]",
    ))
      if (radio.dataset["variantHref"])
        link.href = radio.dataset["variantHref"];
  });
}
