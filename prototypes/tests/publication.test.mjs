import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { publicationFiles, validatePublicationApproval } from "../../scripts/publication.mjs";
import { privateStudioFiles, validateStudioApproval } from "../../scripts/private-studio.mjs";
import { designs } from "../scripts/designs.mjs";
import { documents } from "../scripts/documents.mjs";

const approval = JSON.parse(readFileSync(new URL("../../publishing.json", import.meta.url), "utf8"));

test("Pages cannot publish any private studio or planning source", () => {
  assert.deepEqual(publicationFiles(), []);
});

test("the private manifest preserves the complete approved studio without including repository internals", () => {
  const files = privateStudioFiles();
  for (const design of designs) {
    assert(files.includes(`prototypes/${design.home}`), design.id);
    assert(files.includes(`prototypes/${design.image}`), design.id);
  }
  for (const document of documents) assert(files.includes(document.path), document.path);
  for (const file of ["store.html", "product.html", "cart.html", "checkout.html", "inventory.html", "plan.html"])
    assert(files.includes(`prototypes/${file}`), file);
  assert(files.includes("prototypes/scripts/plan-renderer.mjs"));
  assert.equal(new Set(files).size, files.length);
  assert(files.every((file) => !file.startsWith("/") && !file.split("/").includes("..")));
  assert(files.every((file) => !/node_modules|\.git\/|\.env|prototypes\/tests|package-lock|\.github\/|publishing\.json/.test(file)));
  assert.equal(validateStudioApproval(approval), true);
  assert.throws(() => validateStudioApproval({ ...approval, studioAccess: "public" }), /authentication/i);
  assert.throws(() => validateStudioApproval({ ...approval, approvedDesigns: ["meadow"] }), /design/i);
  assert.throws(() => validateStudioApproval({ ...approval, approvedDocuments: ["overview"] }), /document/i);
});

test("publishing requires redirect-only approval and rejects the former public planning scope", () => {
  assert.equal(validatePublicationApproval(approval), true);
  assert.throws(() => validatePublicationApproval({ ...approval, public: false }), /public/i);
  assert.throws(() => validatePublicationApproval({ ...approval, scope: "anything" }), /scope/i);
  assert.throws(() => validatePublicationApproval({ ...approval, scope: "full-current-planning-hub" }), /scope/i);
  assert.throws(() => validatePublicationApproval({ ...approval, destination: "https://evil.example" }), /destination/i);
});

test("the five-concept review is explicitly approved and publishes only its bounded public sources", () => {
  const files = privateStudioFiles();
  for (const file of ["index.html", "concept.html", "styles.css", "app.mjs", "model.mjs", "data.mjs", "manifest.mjs"])
    assert(files.includes(`prototypes/next/${file}`), file);
  for (const name of ["soap-delight-bar", "soap-delight-wolf", "soap-true-bar", "soap-true-wolf"])
    assert(files.includes(`prototypes/next/assets/${name}.webp`), name);
  assert.throws(() => validateStudioApproval({ ...approval, storefrontConcepts: undefined }), /concept/i);
  assert.throws(() => validateStudioApproval({ ...approval, storefrontConcepts: { ...approval.storefrontConcepts, public: false } }), /concept/i);
  assert.throws(() => validateStudioApproval({ ...approval, storefrontConcepts: { ...approval.storefrontConcepts, approvedConcepts: ["atelier"] } }), /concept/i);
  assert.throws(() => validateStudioApproval({ ...approval, storefrontConcepts: { ...approval.storefrontConcepts, approvedAssets: ["../../.env"] } }), /asset/i);
});

test("new product-page-only studies require separate approval without adding home or store prototypes", () => {
  const files = privateStudioFiles().filter((file) => file.startsWith("prototypes/product-pages/"));
  assert.deepEqual(files, ["app.mjs", "index.html", "manifest.mjs", "model.mjs", "styles.css"].map((file) => `prototypes/product-pages/${file}`));
  assert.throws(() => validateStudioApproval({ ...approval, productPageConcepts: undefined }), /product.page/i);
  assert.throws(() => validateStudioApproval({ ...approval, productPageConcepts: { ...approval.productPageConcepts, public: false } }), /product.page/i);
  assert.throws(() => validateStudioApproval({ ...approval, productPageConcepts: { ...approval.productPageConcepts, scope: "whole-site" } }), /product.page/i);
  assert.throws(() => validateStudioApproval({ ...approval, productPageConcepts: { ...approval.productPageConcepts, approvedDesigns: ["quick-pick"] } }), /product.page/i);
});

test("editor studies and the archive are explicitly scoped to fictional product management", () => {
  const files = privateStudioFiles();
  for (const file of ["index.html", "styles.css", "app.mjs", "model.mjs", "manifest.mjs"])
    assert(files.includes(`prototypes/editor/${file}`), file);
  assert(files.includes("prototypes/archive.html"));
  assert.throws(() => validateStudioApproval({ ...approval, editorConcepts: undefined }), /editor/i);
  assert.throws(() => validateStudioApproval({ ...approval, editorConcepts: { ...approval.editorConcepts, scope: "private-inventory" } }), /editor/i);
  assert.throws(() => validateStudioApproval({ ...approval, editorConcepts: { ...approval.editorConcepts, approvedDesigns: ["workbench"] } }), /editor/i);
});

test("guided refinement publishes only approved fictional review files", () => {
  const files = privateStudioFiles().filter((file) => file.startsWith("prototypes/guided-next/"));
  assert.deepEqual(files, ["app.mjs", "index.html", "manifest.mjs", "preview.mjs", "styles.css"].map((file) => `prototypes/guided-next/${file}`));
  assert.throws(() => validateStudioApproval({ ...approval, guidedRefinement: undefined }), /guided/i);
  assert.throws(() => validateStudioApproval({ ...approval, guidedRefinement: { ...approval.guidedRefinement, public: false } }), /guided/i);
  assert.throws(() => validateStudioApproval({ ...approval, guidedRefinement: { ...approval.guidedRefinement, scope: "live-editor" } }), /guided/i);
});

test("scroll comparisons publish only the two approved fictional layouts", () => {
  const files = privateStudioFiles().filter((file) => file.startsWith("prototypes/guided-scroll/"));
  assert.deepEqual(files, ["app.mjs", "index.html", "manifest.mjs", "styles.css"].map((file) => `prototypes/guided-scroll/${file}`));
  assert.throws(() => validateStudioApproval({ ...approval, guidedScrollConcepts: undefined }), /scroll/i);
  assert.throws(() => validateStudioApproval({ ...approval, guidedScrollConcepts: { ...approval.guidedScrollConcepts, public: false } }), /scroll/i);
  assert.throws(() => validateStudioApproval({ ...approval, guidedScrollConcepts: { ...approval.guidedScrollConcepts, approvedLayouts: ["compact"] } }), /scroll/i);
});

test("Workbench autosave review requires explicit scoped publication approval", () => {
  const files = privateStudioFiles().filter((file) => file.startsWith("prototypes/workbench-next/"));
  assert.deepEqual(files, ["app.mjs", "drafts.mjs", "index.html", "manifest.mjs", "styles.css"].map((file) => `prototypes/workbench-next/${file}`));
  assert.throws(() => validateStudioApproval({ ...approval, workbenchRefinement: undefined }), /Workbench/i);
  assert.throws(() => validateStudioApproval({ ...approval, workbenchRefinement: { ...approval.workbenchRefinement, public: false } }), /Workbench/i);
});

test("the public sprint review publishes only an approved, read-only snapshot", () => {
  const path = "prototypes/team-sprint/index.html";
  assert.deepEqual(privateStudioFiles().filter((file) => file.startsWith("prototypes/team-sprint/")), [path]);
  assert.throws(() => validateStudioApproval({ ...approval, teamSprintPreview: undefined }), /sprint/i);
  assert.throws(() => validateStudioApproval({ ...approval, teamSprintPreview: { ...approval.teamSprintPreview, scope: "private-backlog" } }), /sprint/i);

  const html = readFileSync(new URL("../../" + path, import.meta.url), "utf8");
  assert.match(html, /name="robots"\s+content="noindex,nofollow"/, "label the public review as non-indexable");
  assert.match(html, /read-only/i);
  assert.doesNotMatch(html, /<(?:script|form|iframe)\b/i, "do not ship an editor or load the private queue");
});

test("pickup studies publish only scoped fictional sources and their draft plan", () => {
  assert.deepEqual(privateStudioFiles().filter((file) => file.startsWith("prototypes/pickup/")),
    ["app.mjs", "index.html", "manifest.mjs", "model.mjs", "styles.css"].map((file) => `prototypes/pickup/${file}`));
  assert.ok(privateStudioFiles().includes("docs/21-pickup-scheduling-plan.md"));
  assert.throws(() => validateStudioApproval({ ...approval, pickupScheduling: undefined }), /pickup/i);
  assert.throws(() => validateStudioApproval({ ...approval, pickupScheduling: { ...approval.pickupScheduling, scope: "real-customer-bookings" } }), /pickup/i);
});
