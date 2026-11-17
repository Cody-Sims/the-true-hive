import { configureFlow } from "../guided-next/app.mjs";
import { scrollLayouts } from "./manifest.mjs";

const params = new URLSearchParams(location.search);
const initial = params.get("layout") === "compact" ? "compact" : "together";
const scroller = document.querySelector(".step-scroll");
const workspace = document.querySelector(".flow-layout");
const phone = window.matchMedia("(max-width: 680px)");
const shortWindow = window.matchMedia("(max-height: 550px)");

function describeLayout() {
  const compact = document.body.dataset.layout === "compact";
  const popOutOnly = phone.matches || (compact && shortWindow.matches);
  document.querySelector("#layout-description").textContent = popOutOnly
    ? compact ? "The form scrolls. Open Preview whenever you need it." : "One page scroll. Open Preview whenever you need it."
    : compact ? "A smaller card stays put. Scrolling anywhere in the workspace moves the form." : "One page, one scrollbar. The form and product move together.";
}

function chooseLayout(layout) {
  if (!scrollLayouts.includes(layout)) return;
  document.body.dataset.layout = layout;
  for (const button of document.querySelectorAll("[data-layout-choice]"))
    button.setAttribute("aria-pressed", String(button.dataset.layoutChoice === layout));
  const compact = layout === "compact";
  describeLayout();
  document.querySelector("#preview-caption").textContent = compact ? "Compact live card" : "Customer view";
  document.querySelector("#preview-help").textContent = compact
    ? "A quick card that fits. Open the full page for every format and detail."
    : "This preview moves with the form. Open the product page for a closer look.";
  configureFlow({ sharedPage: !compact, compact });
  const url = new URL(location.href);
  url.searchParams.set("layout", layout);
  history.replaceState(null, "", url);
  const mode = new URL(document.querySelector("#mode-link").href);
  mode.searchParams.set("layout", layout);
  document.querySelector("#mode-link").href = mode.href;
}

for (const button of document.querySelectorAll("[data-layout-choice]"))
  button.addEventListener("click", () => chooseLayout(button.dataset.layoutChoice));
phone.addEventListener("change", describeLayout);
shortWindow.addEventListener("change", describeLayout);

workspace.addEventListener("wheel", (event) => {
  if (document.body.dataset.layout !== "compact" || document.querySelector("dialog[open]")
    || event.ctrlKey || event.metaKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)
    || event.target.closest(".step-scroll")) return;
  const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroller.clientHeight : 1;
  scroller.scrollBy({ top: event.deltaY * scale, behavior: "instant" });
  event.preventDefault();
}, { passive: false });

workspace.addEventListener("keydown", (event) => {
  if (document.body.dataset.layout !== "compact" || !event.target.closest(".desktop-preview")
    || event.ctrlKey || event.metaKey || event.altKey || document.querySelector("dialog[open]")) return;
  const amounts = { ArrowDown: 40, ArrowUp: -40, PageDown: scroller.clientHeight * .8, PageUp: -scroller.clientHeight * .8, Home: -scroller.scrollHeight, End: scroller.scrollHeight };
  if (!Object.hasOwn(amounts, event.key)) return;
  scroller.scrollBy({ top: amounts[event.key], behavior: "instant" });
  event.preventDefault();
});

chooseLayout(initial);
