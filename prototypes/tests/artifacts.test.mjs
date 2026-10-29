import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { designs } from "../scripts/designs.mjs";
import { documents } from "../scripts/documents.mjs";

const root = new URL("../../", import.meta.url);
const prototypeRoot = new URL("../", import.meta.url);

test("all ten actual homepage files connect to their store and the planning UI", () => {
  for (const design of designs) {
    const home = new URL(design.home, prototypeRoot);
    assert(existsSync(home), `Missing homepage for ${design.name}: ${fileURLToPath(home)}`);
    const html = readFileSync(home, "utf8");
    assert.equal((html.match(/<h1(?:\s|>)/gi) ?? []).length, 1, `${design.id}: one H1`);
    assert.equal((html.match(/<main(?:\s|>)/gi) ?? []).length, 1, `${design.id}: one main`);
    assert.match(html, /Madisonville/i, `${design.id}: honest locality`);
    assert(html.includes(`store.html?design=${design.id}`), `${design.id}: coordinated shop link`);
    assert(html.includes("plan.html"), `${design.id}: in-UI planning access`);
    assert.match(html, /name="robots"\s+content="noindex/i, `${design.id}: noindex review`);
    assert.doesNotMatch(html, /application\/ld\+json/i, `${design.id}: no sample offer markup`);
    assert(existsSync(new URL(design.image, prototypeRoot)), `${design.id}: original illustration`);
    for (const stylesheet of [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map((match) => match[1])) {
      assert(existsSync(new URL(stylesheet, home)), `${design.id}: missing stylesheet ${stylesheet}`);
    }
  }
});

test("the planning UI's registered documents all contain actual readable source", () => {
  assert.equal(new Set(documents.map((document) => document.id)).size, documents.length);
  assert.equal(new Set(documents.map((document) => document.path)).size, documents.length);
  for (const document of documents) {
    const source = new URL(document.path, root);
    assert(existsSync(source), `Missing planning source: ${document.path}`);
    const text = readFileSync(source, "utf8");
    assert.match(text, /^# .+/m, document.path);
    assert(text.trim().length > 200, `${document.path}: not an empty placeholder`);
  }
});

test("each shared commerce surface is explicitly a non-indexable review with a real entry module", () => {
  for (const file of ["store.html", "product.html", "cart.html", "checkout.html", "inventory.html"]) {
    const html = readFileSync(new URL(file, prototypeRoot), "utf8");
    assert.match(html, /name="robots"\s+content="noindex/i, file);
    assert.match(html, /scripts\/commerce\.mjs/, file);
    assert.match(html, /id="commerce-content"/, file);
    assert.doesNotMatch(html, /application\/ld\+json/i, file);
  }
});
