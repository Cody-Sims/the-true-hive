import { designs } from "../prototypes/scripts/designs.mjs";
import { documents } from "../prototypes/scripts/documents.mjs";
import { products } from "../prototypes/scripts/catalog.mjs";

export function publicationFiles() {
  const pages = ["index.html", "store.html", "product.html", "cart.html", "checkout.html", "inventory.html", "plan.html"];
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
  ]);
  for (const file of files) {
    if (file.startsWith("/") || file.split("/").includes("..")
      || !/^(?:prototypes\/.+\.(?:html|css|mjs|svg)|docs\/.+\.md|README\.md|CHANGELOG\.md)$/.test(file)) {
      throw new Error(`Unexpected public artifact path: ${file}`);
    }
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
  return true;
}
