import { designs } from "../prototypes/scripts/designs.mjs";
import { documents } from "../prototypes/scripts/documents.mjs";
import { products } from "../prototypes/scripts/catalog.mjs";
import { concepts, reviewAssets, reviewFiles } from "../prototypes/next/manifest.mjs";
import { studies, productPageFiles } from "../prototypes/product-pages/manifest.mjs";
import { editorDesigns, editorFiles } from "../prototypes/editor/manifest.mjs";
import { guidedFiles } from "../prototypes/guided-next/manifest.mjs";

export function publicationFiles() {
  const pages = ["index.html", "archive.html", "store.html", "product.html", "cart.html", "checkout.html", "inventory.html", "plan.html"];
  const styles = ["shared.css", "index.css", "commerce.css", "plan.css"];
  const modules = ["catalog", "commerce-model", "commerce-views", "commerce", "designs", "documents", "dom",
    "gallery-view", "gallery", "plan-renderer", "plan"];
  const files = new Set([
    ...pages.map((file) => `prototypes/${file}`),
    ...styles.map((file) => `prototypes/${file}`),
    ...modules.map((file) => `prototypes/scripts/${file}.mjs`),
    ...designs.flatMap((design) => [
      `prototypes/${design.home}`,
      `prototypes/${design.home.replace(/\.html$/, ".css")}`,
      `prototypes/${design.image}`,
    ]),
    ...products.map((product) => `prototypes/${product.image}`),
    "prototypes/assets/favicon.svg",
    ...documents.map((document) => document.path),
    ...reviewFiles.map((file) => `prototypes/next/${file}`),
    ...productPageFiles.map((file) => `prototypes/product-pages/${file}`),
    ...editorFiles.map((file) => `prototypes/editor/${file}`),
    ...guidedFiles.map((file) => `prototypes/guided-next/${file}`),
  ]);
  for (const file of files) {
    if (file.startsWith("/") || file.split("/").includes("..")
      || !/^(?:prototypes\/.+\.(?:html|css|mjs|svg)|prototypes\/next\/assets\/.+\.webp|docs\/.+\.md|README\.md|CHANGELOG\.md)$/.test(file)) {
      throw new Error(`Unexpected public artifact path: ${file}`);
    }
    if (file.endsWith(".webp") && !reviewAssets.includes(file.slice("prototypes/next/".length)))
      throw new Error(`Unexpected concept asset: ${file}`);
  }
  return [...files].sort();
}

function assertAllowlist(actual, expected, label) {
  if (!Array.isArray(actual) || new Set(actual).size !== actual.length
    || [...actual].sort().join("\n") !== [...expected].sort().join("\n")) {
    throw new Error(`The approved ${label} allowlist does not match the current project. Review publication scope before deploying.`);
  }
}

export function validatePublicationApproval(approval) {
  if (approval.public !== true) throw new Error("Public publication has not been approved.");
  if (approval.scope !== "full-current-planning-hub") throw new Error("The publication scope is not supported by this preview build.");
  if (!/^[\w.-]+\/[\w.-]+$/.test(approval.repository) || !/^\d{4}-\d{2}-\d{2}$/.test(approval.approvedOn)) {
    throw new Error("Publication repository/date metadata is invalid.");
  }
  assertAllowlist(approval.approvedDesigns, designs.map((design) => design.id), "design");
  assertAllowlist(approval.approvedDocuments, documents.map((document) => document.id), "document");
  const review = approval.storefrontConcepts;
  if (!review || review.public !== true || review.scope !== "public-products-and-reference-images"
    || !/^\d{4}-\d{2}-\d{2}$/.test(review.approvedOn))
    throw new Error("The new storefront concepts require explicit public review approval.");
  assertAllowlist(review.approvedConcepts, concepts.map((concept) => concept.id), "concept");
  assertAllowlist(review.approvedAssets, reviewAssets, "concept asset");
  const productPages = approval.productPageConcepts;
  if (!productPages || productPages.public !== true || productPages.scope !== "product-page-only"
    || !/^\d{4}-\d{2}-\d{2}$/.test(productPages.approvedOn))
    throw new Error("The new product-page studies require explicit public review approval.");
  assertAllowlist(productPages.approvedDesigns, studies.map((study) => study.id), "product-page design");
  const editors = approval.editorConcepts;
  if (!editors || editors.public !== true || editors.scope !== "fictional-add-edit-product"
    || !/^\d{4}-\d{2}-\d{2}$/.test(editors.approvedOn))
    throw new Error("The new editor studies require explicit public, fictional-data review approval.");
  assertAllowlist(editors.approvedDesigns, editorDesigns.map((entry) => entry.id), "editor design");
  const refinement = approval.guidedRefinement;
  if (!refinement || refinement.public !== true || refinement.scope !== "fictional-guided-editor-refinement"
    || !/^\d{4}-\d{2}-\d{2}$/.test(refinement.approvedOn))
    throw new Error("The guided editor refinement requires explicit fictional-data preview approval.");
  return true;
}
