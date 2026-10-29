import { designs } from "./designs.mjs";
import { selectDesigns, renderGalleryCards } from "./gallery-view.mjs";

const filters = { emphasis: "all", search: "" };
const grid = document.querySelector("#concept-grid");
const count = document.querySelector("#concept-count");

function render() {
  const visible = selectDesigns(designs, filters);
  grid.innerHTML = visible.length ? renderGalleryCards(visible)
    : `<div class="gallery-empty"><h2>No design matches that combination.</h2><p>Try a different name or reset the filters.</p>
      <button type="button" class="gallery-button" data-reset-gallery>Show all ten designs</button></div>`;
  count.textContent = `${visible.length} of ${designs.length} design directions. Each has a coordinated collection, product, cart, and checkout preview.`;
  for (const button of document.querySelectorAll("[data-emphasis]")) {
    button.setAttribute("aria-pressed", String(button.dataset.emphasis === filters.emphasis));
  }
}

document.querySelector("#design-search").addEventListener("input", (event) => {
  filters.search = event.target.value;
  render();
});
document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.emphasis) {
    filters.emphasis = button.dataset.emphasis;
    render();
  }
  if (button.hasAttribute("data-reset-gallery")) {
    filters.emphasis = "all";
    filters.search = "";
    document.querySelector("#design-search").value = "";
    render();
    document.querySelector("#design-search").focus();
  }
});
render();
