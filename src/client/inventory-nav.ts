for (const header of document.querySelectorAll<HTMLElement>(
  "[data-inventory-navbar]",
)) {
  const toggle = header.querySelector<HTMLButtonElement>(
    "[data-inventory-menu-toggle]",
  );
  const navigation = header.querySelector<HTMLElement>("#inventory-navigation");
  if (!toggle || !navigation) continue;
  const mobile = window.matchMedia("(max-width: 1180px)");
  let open = false;
  const setOpen = (next: boolean) => {
    open = mobile.matches && next;
    toggle.hidden = !mobile.matches;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute(
      "aria-label",
      open ? "Close inventory menu" : "Open inventory menu",
    );
    toggle.querySelector("[data-inventory-menu-label]")!.textContent = open
      ? "Close"
      : "Menu";
    navigation.hidden = mobile.matches && !open;
    if (open)
      for (const account of header.querySelectorAll<HTMLDetailsElement>(
        "[data-inventory-account]",
      ))
        account.open = false;
  };
  toggle.addEventListener("click", () => setOpen(!open));
  navigation.addEventListener("click", (event) => {
    if ((event.target as Element).closest("a")) setOpen(false);
  });
  document.addEventListener("pointerdown", (event) => {
    if (
      event.target instanceof Node &&
      !navigation.contains(event.target) &&
      !toggle.contains(event.target)
    )
      setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !open) return;
    setOpen(false);
    toggle.focus();
  });
  mobile.addEventListener("change", () => setOpen(false));
  setOpen(false);
}

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
