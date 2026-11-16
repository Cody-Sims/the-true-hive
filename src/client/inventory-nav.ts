for (const account of document.querySelectorAll<HTMLDetailsElement>(
  "[data-inventory-account]",
)) {
  const closeOutside = (event: Event) => {
    if (event.target instanceof Node && !account.contains(event.target))
      account.open = false;
  };
  document.addEventListener("pointerdown", closeOutside);
  document.addEventListener("focusin", closeOutside);
  account.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !account.open) return;
    event.preventDefault();
    account.open = false;
    account.querySelector<HTMLElement>("summary")?.focus();
  });
}
