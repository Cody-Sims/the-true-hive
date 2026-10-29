import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { publicationFiles, validatePublicationApproval } from "../../scripts/publication.mjs";
import { designs } from "../scripts/designs.mjs";
import { documents } from "../scripts/documents.mjs";

const approval = JSON.parse(readFileSync(new URL("../../publishing.json", import.meta.url), "utf8"));

test("the Pages manifest includes complete approved UI and planning sources, not a repository-root upload", () => {
  const files = publicationFiles();
  for (const design of designs) {
    assert(files.includes(`prototypes/${design.home}`), design.id);
    assert(files.includes(`prototypes/${design.image}`), design.id);
  }
  for (const document of documents) assert(files.includes(document.path), document.path);
  for (const file of ["store.html", "product.html", "cart.html", "checkout.html", "inventory.html", "plan.html"]) {
    assert(files.includes(`prototypes/${file}`), file);
  }
  assert(files.includes("prototypes/scripts/plan-renderer.mjs"));
  assert.equal(new Set(files).size, files.length);
  assert(files.every((file) => !file.startsWith("/") && !file.split("/").includes("..")));
  assert(files.every((file) => !/node_modules|\.git\/|\.env|prototypes\/tests|package-lock|\.github\/|publishing\.json/.test(file)));
});

test("publishing requires the approved public scope and complete design/document allowlists", () => {
  assert.equal(validatePublicationApproval(approval), true);
  assert.throws(() => validatePublicationApproval({ ...approval, public: false }), /public/i);
  assert.throws(() => validatePublicationApproval({ ...approval, scope: "anything" }), /scope/i);
  assert.throws(() => validatePublicationApproval({ ...approval, approvedDesigns: ["meadow"] }), /design/i);
  assert.throws(() => validatePublicationApproval({ ...approval, approvedDocuments: ["overview"] }), /document/i);
});
