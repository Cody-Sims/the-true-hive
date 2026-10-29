import test from "node:test";
import assert from "node:assert/strict";
import { renderPlanMarkdown, resolvePlanLink } from "../scripts/plan-renderer.mjs";

test("the planning viewer renders real headings, tables, lists and code rather than raw Markdown", () => {
  const source = "# Project plan\n\n## Launch gate\n\n| Need | Owner |\n| --- | --- |\n| Stock | Business |\n\n- First step\n\n```ts\nconst safe = '<script>';\n```";
  const result = renderPlanMarkdown(source, "README.md");
  assert.match(result.html, /<h1 id="project-plan">Project plan<\/h1>/);
  assert.match(result.html, /class="markdown-table"/);
  assert.match(result.html, /<table>/);
  assert.match(result.html, /<li>First step<\/li>/);
  assert.match(result.html, /&lt;script&gt;/);
  assert.deepEqual(result.headings, [
    { id: "project-plan", title: "Project plan", level: 1 },
    { id: "launch-gate", title: "Launch gate", level: 2 },
  ]);
});

test("links to other registered Markdown files stay inside the planning UI", () => {
  assert.equal(resolvePlanLink("../README.md", "docs/03-architecture.md"), "plan.html?doc=overview");
  assert.equal(resolvePlanLink("../04-data-and-integrations.md#ownership-by-stage", "docs/phases/04-commerce-and-inventory.md"),
    "plan.html?doc=data#ownership-by-stage");
  const result = renderPlanMarkdown("[Requirements](docs/00-project-brief.md)", "README.md");
  assert.match(result.html, /href="plan.html\?doc=requirements"/);
});

test("prototype and external source links keep their intended destinations", () => {
  assert.equal(resolvePlanLink("../../prototypes/meadow.html", "docs/designs/01-meadow-and-amber.md"), "meadow.html");
  assert.equal(resolvePlanLink("https://developers.google.com/search/docs", "README.md"), "https://developers.google.com/search/docs");
  assert.equal(resolvePlanLink("#objective", "docs/00-project-brief.md"), "#objective");
});

test("raw HTML and unsafe link protocols cannot become active content", () => {
  const result = renderPlanMarkdown("<script>alert('no')</script>\n\n[bad](javascript:alert(1))", "README.md");
  assert.doesNotMatch(result.html, /<script>/i);
  assert.doesNotMatch(result.html, /href="javascript:/i);
  assert.match(result.html, /&lt;script&gt;/);
});

test("duplicate headings get unique targets and external images are not auto-loaded", () => {
  const result = renderPlanMarkdown("# Notes\n\n## Gate\n\n## Gate\n\n![External image](https://example.com/tracker.png)", "README.md");
  assert.deepEqual(result.headings.map((heading) => heading.id), ["notes", "gate", "gate-1"]);
  assert.doesNotMatch(result.html, /<img[^>]+https:/);
  assert.match(result.html, /https:\/\/example.com\/tracker.png/);
});
