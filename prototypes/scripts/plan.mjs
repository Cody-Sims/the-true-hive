import { documents, getDocument } from "./documents.mjs";
import { renderPlanMarkdown } from "./plan-renderer.mjs";
import { escapeHtml as e } from "./dom.mjs";

class DocumentLoadError extends Error {}

const article = document.querySelector("#plan-content");
const nav = document.querySelector("#document-nav");
const outline = document.querySelector("#document-outline");
const feedback = document.querySelector("#document-feedback");
const copyButton = document.querySelector("#copy-workbook");
let controller;
let loadedSource = "";
let activeDocument;

const groups = [...new Set(documents.map((document) => document.group))];
nav.innerHTML = groups.map((group) => `<section class="nav-group" data-document-group><h2>${e(group)}</h2><ul>
  ${documents.filter((document) => document.group === group).map((document) => `<li data-document-item><a
    href="plan.html?doc=${e(document.id)}" data-document="${e(document.id)}">${e(document.title)}</a></li>`).join("")}
  </ul></section>`).join("");

if (matchMedia("(max-width: 800px)").matches) document.querySelector("#document-browser").open = false;

function showFeedback(message, error = false) {
  feedback.hidden = false;
  feedback.setAttribute("role", error ? "alert" : "status");
  feedback.textContent = message;
}

function scrollToHeading(hash) {
  if (!hash) return;
  const heading = document.getElementById(decodeURIComponent(hash.slice(1)));
  if (heading) heading.scrollIntoView();
}

function updateNavigation(document) {
  for (const link of nav.querySelectorAll("[data-document]")) {
    if (link.dataset.document === document.id) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  const index = documents.findIndex((entry) => entry.id === document.id);
  for (const [selector, neighbor, label] of [
    ["#previous-document", documents[index - 1], "Previous"],
    ["#next-document", documents[index + 1], "Next"],
  ]) {
    const link = window.document.querySelector(selector);
    link.hidden = !neighbor;
    if (neighbor) {
      link.href = `plan.html?doc=${neighbor.id}`;
      link.textContent = `${label}: ${neighbor.title}`;
    }
  }
}

function unknownDocument() {
  article.setAttribute("aria-busy", "false");
  article.innerHTML = `<h1>That planning document is not in the library.</h1>
    <p>Choose an entry from the navigation or <a href="plan.html?doc=overview">return to the project overview</a>.</p>`;
  outline.replaceChildren();
  copyButton.hidden = true;
  document.querySelector("#document-source").hidden = true;
  document.querySelector("#previous-document").hidden = true;
  document.querySelector("#next-document").hidden = true;
}

async function loadDocument(id, { focus = false, hash = location.hash } = {}) {
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  const selected = getDocument(id);
  loadedSource = "";
  activeDocument = selected;
  feedback.hidden = true;
  copyButton.hidden = true;
  if (!selected) {
    unknownDocument();
    return;
  }
  article.setAttribute("aria-busy", "true");
  document.querySelector("#document-group").textContent = selected.group;
  const sourceLink = document.querySelector("#document-source");
  sourceLink.hidden = false;
  sourceLink.href = `../${selected.path}`;
  updateNavigation(selected);
  try {
    const response = await fetch(`../${selected.path}`, { signal, cache: "no-store" });
    if (!response.ok) throw new DocumentLoadError(`The document could not be loaded (HTTP ${response.status}).`);
    const source = await response.text();
    if (signal.aborted) return;
    const rendered = renderPlanMarkdown(source, selected.path);
    article.innerHTML = rendered.html;
    article.setAttribute("aria-busy", "false");
    for (const block of article.querySelectorAll("pre")) {
      block.tabIndex = 0;
      block.setAttribute("aria-label", "Scrollable code or diagram");
    }
    outline.innerHTML = rendered.headings.filter((heading) => heading.level === 2)
      .map((heading) => `<a href="#${e(heading.id)}">${e(heading.title)}</a>`).join("");
    loadedSource = source;
    copyButton.hidden = selected.id !== "questions";
    document.title = `${selected.title} | The True Hive planning hub`;
    if (focus) {
      const heading = article.querySelector("h1");
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      article.scrollIntoView({ behavior: "auto" });
    }
    scrollToHeading(hash);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    if (!(error instanceof DocumentLoadError) && !(error instanceof TypeError)) throw error;
    article.setAttribute("aria-busy", "false");
    article.innerHTML = `<h1>This document could not be opened.</h1><p>The actual source is still available through the Markdown source link.
      Reload this page after the local preview server is available.</p>`;
    outline.replaceChildren();
    showFeedback(error instanceof DocumentLoadError ? error.message
      : "The local planning document could not be fetched. This viewer needs the project HTTP preview, not a file:// URL.", true);
  }
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("a");
  if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === "_blank") return;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin || url.pathname !== location.pathname || !url.searchParams.has("doc")) return;
  event.preventDefault();
  history.pushState(null, "", url);
  if (activeDocument?.id === url.searchParams.get("doc") && loadedSource) {
    scrollToHeading(url.hash);
  } else {
    loadDocument(url.searchParams.get("doc"), { focus: true, hash: url.hash });
  }
});

document.querySelector("#document-filter").addEventListener("input", (event) => {
  const term = event.target.value.trim().toLowerCase();
  let matches = 0;
  for (const item of nav.querySelectorAll("[data-document-item]")) {
    item.hidden = !item.textContent.toLowerCase().includes(term);
    if (!item.hidden) matches++;
  }
  for (const group of nav.querySelectorAll("[data-document-group]")) {
    group.hidden = ![...group.querySelectorAll("[data-document-item]")].some((item) => !item.hidden);
  }
  document.querySelector("#document-filter-status").textContent = `${matches} planning documents match.`;
});

copyButton.addEventListener("click", async () => {
  if (!loadedSource || activeDocument?.id !== "questions") return;
  if (!navigator.clipboard) {
    showFeedback("Clipboard access is unavailable. Select the workbook text below or open its Markdown source to copy it.");
    return;
  }
  try {
    await navigator.clipboard.writeText(loadedSource);
    showFeedback("The partner workbook text was copied. It was not sent anywhere.");
  } catch (error) {
    if (!(error instanceof DOMException) || !["NotAllowedError", "SecurityError"].includes(error.name)) throw error;
    showFeedback("Clipboard access was blocked. Select the workbook text below or open its Markdown source to copy it.");
  }
});

document.querySelector("#print-plan").addEventListener("click", () => window.print());
window.addEventListener("popstate", () => loadDocument(new URLSearchParams(location.search).get("doc") ?? "overview"));
loadDocument(new URLSearchParams(location.search).get("doc") ?? "overview");
