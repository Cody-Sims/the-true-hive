import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import { publicationFiles } from "./publication.mjs";
import { documents, getDocument } from "../prototypes/scripts/documents.mjs";
import { getDesign } from "../prototypes/scripts/designs.mjs";
import { products, scenarios } from "../prototypes/scripts/catalog.mjs";
import { renderPlanMarkdown } from "../prototypes/scripts/plan-renderer.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const built = process.argv.includes("--built");
const directory = built ? path.join(root, "dist") : root;
const allowed = new Set(publicationFiles());
const parser = new MarkdownIt({ html: false });
const failures = [];
let checked = 0;

function exactFile(relative) {
  let current = directory;
  for (const component of relative.split("/")) {
    if (!existsSync(current) || !readdirSync(current).includes(component)) return false;
    current = path.join(current, component);
  }
  return existsSync(current);
}

function fragments(relative) {
  const source = readFileSync(path.join(directory, relative), "utf8");
  if (relative.endsWith(".md")) return new Set(renderPlanMarkdown(source, relative).headings.map((heading) => heading.id));
  return new Set([...source.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]));
}

function validate(href, from, kind = "link") {
  if (/^(?:https?:|mailto:|tel:)/i.test(href)) {
    if (kind === "asset" && /^https?:/i.test(href)) failures.push(`${from}: automatic remote asset ${href}`);
    return;
  }
  const url = new URL(href.replaceAll("&amp;", "&"), `https://preview.invalid/${from}`);
  const relative = decodeURIComponent(url.pathname.slice(1));
  const developmentDependency = !built && kind === "module" && relative.startsWith("node_modules/");
  const publishedVendor = built && relative.startsWith("prototypes/vendor/");
  if ((!allowed.has(relative) && !developmentDependency && !publishedVendor) || !exactFile(relative)) {
    failures.push(`${from}: missing/unpublished target ${href}`);
    return;
  }
  const basename = path.posix.basename(relative);
  if (["store.html", "product.html", "cart.html", "checkout.html", "inventory.html"].includes(basename)) {
    if (url.searchParams.has("design") && !getDesign(url.searchParams.get("design"))) failures.push(`${from}: unknown design in ${href}`);
    if (url.searchParams.has("scenario") && !scenarios.some((scenario) => scenario.id === url.searchParams.get("scenario"))) failures.push(`${from}: unknown inventory scenario in ${href}`);
    if (url.searchParams.has("method") && !["pickup", "shipping"].includes(url.searchParams.get("method"))) failures.push(`${from}: unknown fulfillment in ${href}`);
    if (basename === "product.html" && url.searchParams.has("product")) {
      const product = products.find((entry) => entry.key === url.searchParams.get("product"));
      if (!product) failures.push(`${from}: unknown product in ${href}`);
      else if (url.searchParams.has("variant") && !product.variants.some((variant) => variant.id === url.searchParams.get("variant"))) failures.push(`${from}: wrong product variant in ${href}`);
    }
  }
  let target = relative;
  if (basename === "plan.html" && url.searchParams.has("doc")) {
    const document = getDocument(url.searchParams.get("doc"));
    if (!document) failures.push(`${from}: unknown planning document in ${href}`);
    else target = document.path;
  }
  if (url.hash && !fragments(target).has(decodeURIComponent(url.hash.slice(1)))) {
    failures.push(`${from}: missing fragment ${href}`);
  }
  checked++;
}

function markdownLinks(tokens, file) {
  for (const token of tokens) {
    if (token.type === "link_open") validate(token.attrGet("href"), file);
    if (token.type === "image") validate(token.attrGet("src"), file, "asset");
    if (token.children) markdownLinks(token.children, file);
  }
}

for (const file of allowed) {
  const source = readFileSync(path.join(directory, file), "utf8");
  if (file.endsWith(".md")) markdownLinks(parser.parse(source, {}), file);
  if (file.endsWith(".html") || file.endsWith(".svg")) {
    for (const match of source.matchAll(/\b(href|src)=["']([^"']+)["']/g)) {
      validate(match[2], file, match[1] === "src" ? "asset" : "link");
    }
  }
  if (file.endsWith(".css")) {
    for (const match of source.matchAll(/url\(["']?([^"')]+)["']?\)/g)) validate(match[1], file, "asset");
  }
  if (file.endsWith(".mjs")) {
    for (const match of source.matchAll(/^import\s+.+?\s+from\s+["']([^"']+)["']/gm)) validate(match[1], file, "module");
  }
}
for (const document of documents) {
  if (!exactFile(document.path)) failures.push(`Missing planning source: ${document.path}`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`${checked} local links/assets/module references resolve in ${built ? "the Pages artifact" : "source"}, including case, fragments and preview parameters.`);
}
