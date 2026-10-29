import { escapeHtml as e } from "./dom.mjs";

const emphasisNames = { balanced: "Balanced story", services: "Service-forward reference", retail: "Product-led", editorial: "Editorial commerce" };

export function selectDesigns(designs, { emphasis, search }) {
  const term = search.trim().toLowerCase();
  return designs.filter((design) => (emphasis === "all" || design.emphasis === emphasis)
    && `${design.name} ${design.direction} ${design.description}`.toLowerCase().includes(term));
}

export function renderGalleryCards(designs) {
  return designs.map((design) => `<article class="concept" data-concept="${e(design.id)}"
    style="--card-ink:${e(design.colors[0])};--card-paper:${e(design.colors[2])}">
    <a class="concept-visual" href="${e(design.home)}" aria-label="Explore ${e(design.name)} homepage">
      <span class="concept-number" aria-hidden="true">${e(design.number)}</span>
      <img src="${e(design.image)}" alt="" width="900" height="780" loading="lazy">
    </a>
    <div class="concept-body">
      <div class="concept-meta"><span>${e(emphasisNames[design.emphasis])}</span>
        <span class="palette" aria-hidden="true">${design.colors.map((color) => `<i style="--swatch:${e(color)}"></i>`).join("")}</span></div>
      <p class="eyebrow">${e(design.direction)}</p><h2>${e(design.name)}</h2><p>${e(design.description)}</p>
      <div class="concept-actions"><a class="concept-primary" href="${e(design.home)}">Open homepage <span aria-hidden="true">&rarr;</span></a>
        <a class="concept-secondary" href="store.html?design=${e(design.id)}">Preview store</a></div>
      <a class="concept-brief" href="plan.html?doc=${e(design.brief)}">Read the design rationale &rarr;</a>
    </div>
  </article>`).join("");
}
