import { prototypes } from "./data.mjs";

let hubMode = "system";

function render() {
  const grid = document.getElementById("grid");
  if (!grid) return;
  grid.innerHTML = prototypes
    .map(
      (p, idx) => `
    <article class="card ${idx === 0 ? "featured" : ""}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem">
        <span class="eyebrow">Prototype ${p.number}${idx === 0 ? " · Featured (Light + Dark)" : ""}</span>
        <div class="swatch-row" title="Light / Dark palette">
          ${p.swatchesLight.slice(0, 2).map((c) => `<span class="swatch" style="background:${c}"></span>`).join("")}
          <span style="font-size:0.7rem;color:var(--muted)">/</span>
          ${p.swatchesDark.slice(0, 2).map((c) => `<span class="swatch" style="background:${c}"></span>`).join("")}
        </div>
      </div>
      <div>
        <h2>${p.name}</h2>
        <p style="margin:0.15rem 0 0;font-size:0.84rem;color:var(--accent);font-weight:700">${p.subtitle}</p>
      </div>
      <p style="margin:0;font-size:0.84rem"><strong>Direction:</strong> ${p.tagline}</p>
      <ul>${p.psychology.map((item) => `<li>${item}</li>`).join("")}</ul>
      <div class="sub-links">
        <a href="prototype.html?proto=${p.id}&mode=${hubMode}&page=home">Home</a>
        <a href="prototype.html?proto=${p.id}&mode=${hubMode}&page=goods">Shop</a>
        <a href="prototype.html?proto=${p.id}&mode=${hubMode}&page=product&slug=coconut-milk-delight">Coconut Milk</a>
        <a href="prototype.html?proto=${p.id}&mode=${hubMode}&page=product&slug=the-true-soap">True Soap</a>
        <a href="prototype.html?proto=${p.id}&mode=${hubMode}&page=services">Services</a>
        <a href="prototype.html?proto=${p.id}&mode=${hubMode}&page=about">About</a>
        <a href="prototype.html?proto=${p.id}&mode=${hubMode}&page=cart">Cart</a>
        <a href="prototype.html?proto=${p.id}&mode=${hubMode}&page=contact">Contact</a>
      </div>
      <a class="launch" href="prototype.html?proto=${p.id}&mode=${hubMode}&page=home">Launch ${p.name} &rarr;</a>
    </article>
  `,
    )
    .join("");
}

document.querySelectorAll("[data-hub-mode]").forEach((btn) => {
  btn.addEventListener("click", () => {
    hubMode = btn.dataset.hubMode;
    document.documentElement.setAttribute("data-color-mode", hubMode);
    document.querySelectorAll("[data-hub-mode]").forEach((b) =>
      b.setAttribute("aria-pressed", String(b === btn)),
    );
    render();
  });
});

render();
