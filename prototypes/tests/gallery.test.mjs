import test from "node:test";
import assert from "node:assert/strict";
import { designs } from "../scripts/designs.mjs";
import { selectDesigns, renderGalleryCards } from "../scripts/gallery-view.mjs";

test("the comparison covers ten unique homepage and coordinated store directions", () => {
  assert.equal(designs.length, 10);
  assert.equal(new Set(designs.map((design) => design.id)).size, 10);
  assert.equal(new Set(designs.map((design) => design.home)).size, 10);
  const html = renderGalleryCards(designs);
  assert.equal((html.match(/data-concept=/g) ?? []).length, 10);
  for (const design of designs) {
    assert(html.includes(`href="${design.home}"`), design.id);
    assert(html.includes(`store.html?design=${design.id}`), design.id);
    assert(html.includes(`plan.html?doc=${design.brief}`), design.id);
  }
});

test("gallery filters distinguish sales-led, service-forward and editorial ideas", () => {
  assert.equal(selectDesigns(designs, { emphasis: "all", search: "" }).length, 10);
  assert.equal(selectDesigns(designs, { emphasis: "retail", search: "" }).length, 5);
  assert.deepEqual(selectDesigns(designs, { emphasis: "all", search: "blue ridge" }).map((design) => design.id), ["ridge"]);
  assert.deepEqual(selectDesigns(designs, { emphasis: "services", search: "" }).map((design) => design.id), ["fieldwork"]);
  assert.equal(selectDesigns(designs, { emphasis: "all", search: "not-a-design" }).length, 0);
});
