type Appearance = "system" | "light" | "dark";

const appearances: Appearance[] = ["system", "light", "dark"];
const appearanceLabels: Record<Appearance, string> = {
  system: "Auto",
  light: "Light",
  dark: "Dark",
};
const appearanceKey = "true-hive-appearance";
const frame = document.querySelector<HTMLElement>("[data-public-header]");
const toggle = document.querySelector<HTMLButtonElement>("[data-site-menu]");
const panel = document.getElementById("site-header-panel");
const appearance = document.querySelector<HTMLButtonElement>(
  "[data-site-appearance]",
);
const mobile = window.matchMedia("(max-width: 940px)");
let lastHeaderFocus: HTMLElement | null = null;

function currentAppearance(): Appearance {
  const mode = document.documentElement.dataset["colorMode"];
  return appearances.includes(mode as Appearance)
    ? (mode as Appearance)
    : "system";
}

function updateAppearance() {
  if (appearance)
    appearance.textContent = `Appearance: ${appearanceLabels[currentAppearance()]}`;
}

function setMenu(open: boolean) {
  const focused = document.activeElement;
  panel?.classList.toggle("is-open", open);
  toggle?.setAttribute("aria-expanded", String(open));
  if (
    focused instanceof HTMLElement &&
    panel?.contains(focused) &&
    !focused.getClientRects().length
  )
    (mobile.matches
      ? toggle
      : frame?.querySelector<HTMLAnchorElement>(".brand")
    )?.focus({ preventScroll: true });
}

if (frame && toggle && panel) {
  toggle.hidden = false;
  frame.dataset["navEnhanced"] = "true";
  toggle.addEventListener("click", () => {
    setMenu(toggle.getAttribute("aria-expanded") !== "true");
  });
  panel.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a[href]"))
      setMenu(false);
  });
  document.addEventListener("click", (event) => {
    if (event.target instanceof Node && !frame.contains(event.target))
      setMenu(false);
  });
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      toggle.getAttribute("aria-expanded") === "true"
    ) {
      setMenu(false);
      toggle.focus();
      event.preventDefault();
    }
  });
  document.addEventListener("focusin", (event) => {
    lastHeaderFocus =
      event.target instanceof HTMLElement && frame.contains(event.target)
        ? event.target
        : null;
  });
  mobile.addEventListener("change", () => {
    const previous = lastHeaderFocus;
    setMenu(false);
    if (
      previous?.isConnected &&
      !previous.getClientRects().length &&
      document.activeElement === document.body
    )
      (mobile.matches
        ? toggle
        : frame.querySelector<HTMLAnchorElement>(".brand")
      )?.focus({ preventScroll: true });
  });
}

if (appearance) {
  appearance.hidden = false;
  updateAppearance();
  appearance.addEventListener("click", () => {
    const next =
      appearances[
        (appearances.indexOf(currentAppearance()) + 1) % appearances.length
      ]!;
    document.documentElement.dataset["colorMode"] = next;
    updateAppearance();
    try {
      localStorage.setItem(appearanceKey, next);
    } catch {
      // Appearance still works for this page when storage is unavailable.
    }
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== appearanceKey) return;
    const value = event.newValue;
    document.documentElement.dataset["colorMode"] = appearances.includes(
      value as Appearance,
    )
      ? value!
      : "system";
    updateAppearance();
  });
}
