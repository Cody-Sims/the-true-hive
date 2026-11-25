import { designs } from "../prototypes/scripts/designs.mjs";
import { documents } from "../prototypes/scripts/documents.mjs";
import { products } from "../prototypes/scripts/catalog.mjs";
import { concepts, reviewAssets, reviewFiles } from "../prototypes/next/manifest.mjs";
import { studies, productPageFiles } from "../prototypes/product-pages/manifest.mjs";
import { editorDesigns, editorFiles } from "../prototypes/editor/manifest.mjs";
import { guidedFiles } from "../prototypes/guided-next/manifest.mjs";
import { scrollLayouts, scrollFiles } from "../prototypes/guided-scroll/manifest.mjs";
import { workbenchFiles } from "../prototypes/workbench-next/manifest.mjs";
import { pickupFiles } from "../prototypes/pickup/manifest.mjs";
import { redesignPrototypes, redesignFiles } from "../prototypes/redesign-2026/manifest.mjs";

export function privateStudioFiles() {
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
    ...scrollFiles.map((file) => `prototypes/guided-scroll/${file}`),
    ...workbenchFiles.map((file) => `prototypes/workbench-next/${file}`),
    ...pickupFiles.map((file) => `prototypes/pickup/${file}`),
    ...redesignFiles.map((file) => `prototypes/redesign-2026/${file}`),
    "prototypes/team-sprint/index.html",
  ]);
  for (const file of files) {
    if (file.startsWith("/") || file.split("/").includes("..")
      || !/^(?:prototypes\/.+\.(?:html|css|mjs|svg)|prototypes\/next\/assets\/.+\.webp|docs\/.+\.md|README\.md|CHANGELOG\.md)$/.test(file)) {
      throw new Error(`Unexpected private studio path: ${file}`);
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

export function validateStudioApproval(approval) {
  if (approval.studioAccess !== "authenticated-administrator") throw new Error("Studio access must require administrator authentication.");
  if (approval.scope !== "redirect-only") throw new Error("Only redirect-only publication is supported.");
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
  const scrolling = approval.guidedScrollConcepts;
  if (!scrolling || scrolling.public !== true || scrolling.scope !== "fictional-guided-scroll-comparison"
    || !/^\d{4}-\d{2}-\d{2}$/.test(scrolling.approvedOn))
    throw new Error("The guided scrolling studies require explicit fictional-data preview approval.");
  assertAllowlist(scrolling.approvedLayouts, scrollLayouts, "scroll layout");
  const workbench = approval.workbenchRefinement;
  if (!workbench || workbench.public !== true || workbench.scope !== "fictional-workbench-local-drafts"
    || !/^\d{4}-\d{2}-\d{2}$/.test(workbench.approvedOn))
    throw new Error("Workbench local-draft previews require explicit publication approval.");
  const teamSprint = approval.teamSprintPreview;
  if (!teamSprint || teamSprint.public !== true || teamSprint.scope !== "sanitized-read-only-sprint"
    || !/^\d{4}-\d{2}-\d{2}$/.test(teamSprint.approvedOn))
    throw new Error("The team sprint requires approval for a sanitized read-only preview.");
  const pickup = approval.pickupScheduling;
  if (!pickup || pickup.public !== true || pickup.scope !== "fictional-post-checkout-pickup"
    || !/^\d{4}-\d{2}-\d{2}$/.test(pickup.approvedOn))
    throw new Error("Pickup scheduling studies require explicit fictional-data preview approval.");
  const redesign = approval.redesign2026;
  if (!redesign || redesign.public !== true || redesign.scope !== "customer-website-redesign-prototypes"
    || !/^\d{4}-\d{2}-\d{2}$/.test(redesign.approvedOn))
    throw new Error("Customer website redesign prototypes require explicit preview approval.");
  assertAllowlist(redesign.approvedPrototypes, redesignPrototypes, "redesign prototype");
  return true;
}

const privateFiles = new Set(privateStudioFiles());

export function isPrivateStudioFile(file) {
  return privateFiles.has(file) ||
    /^docs\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.md$/.test(file) ||
    /^prototypes\/inventory-products\/(?:index\.html|styles\.css|admin\.css|app\.mjs|model\.mjs)$/.test(file);
}

export function isStudioPath(path) {
  const file = path.slice(1) + (path.endsWith("/") ? "index.html" : "");
  return privateFiles.has(`${file}/index.html`) ||
    path === "/prototypes" || path === "/prototypes/inventory-products" ||
    isPrivateStudioFile(file) ||
    file === "prototypes/vendor/markdown-it.esm.min.mjs" ||
    /^prototypes\/vendor\/licenses\/[a-zA-Z0-9._-]+$/.test(file);
}
