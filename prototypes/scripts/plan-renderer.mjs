import MarkdownIt from "../../node_modules/markdown-it/dist/browser/markdown-it.esm.min.mjs";
import { documents } from "./documents.mjs";
import { escapeHtml as e } from "./dom.mjs";

const planningOrigin = "https://planning.invalid";
const parser = new MarkdownIt({ html: false, linkify: false, typographer: false });

export function resolvePlanLink(href, currentPath) {
  if (href.startsWith("#")) return href;
  const resolved = new URL(href, `${planningOrigin}/${currentPath}`);
  if (resolved.origin !== planningOrigin) return href;
  const path = decodeURIComponent(resolved.pathname.slice(1));
  const document = documents.find((entry) => entry.path === path);
  if (document) return `plan.html?doc=${document.id}${resolved.hash}`;
  if (path.startsWith("prototypes/")) {
    return `${path.slice("prototypes/".length)}${resolved.search}${resolved.hash}`;
  }
  return `../${path}${resolved.search}${resolved.hash}`;
}

parser.renderer.rules.heading_open = (tokens, index, options, environment, renderer) => {
  const inline = tokens[index + 1];
  const title = inline.children.filter((token) => ["text", "code_inline"].includes(token.type))
    .map((token) => token.content).join("");
  const base = title.toLowerCase().trim().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
  const count = environment.ids.get(base) ?? 0;
  environment.ids.set(base, count + 1);
  const id = count ? `${base}-${count}` : base;
  tokens[index].attrSet("id", id);
  environment.headings.push({ id, title, level: Number(tokens[index].tag.slice(1)) });
  return renderer.renderToken(tokens, index, options);
};

parser.renderer.rules.link_open = (tokens, index, options, environment, renderer) => {
  const href = tokens[index].attrGet("href");
  tokens[index].attrSet("href", resolvePlanLink(href, environment.currentPath));
  if (/^https?:/i.test(href)) tokens[index].attrSet("rel", "noreferrer noopener");
  return renderer.renderToken(tokens, index, options);
};

parser.renderer.rules.table_open = () =>
  '<div class="markdown-table" role="region" aria-label="Scrollable planning table" tabindex="0"><table>\n';
parser.renderer.rules.table_close = () => "</table></div>\n";
parser.renderer.rules.image = (tokens, index, options, environment) => {
  const token = tokens[index];
  const href = resolvePlanLink(token.attrGet("src"), environment.currentPath);
  return `<a class="document-image-link" href="${e(href)}">Image: ${e(token.content || "open illustration")}</a>`;
};

export function renderPlanMarkdown(source, currentPath) {
  const environment = { currentPath, headings: [], ids: new Map() };
  const html = parser.render(source, environment);
  return { html, headings: environment.headings };
}
