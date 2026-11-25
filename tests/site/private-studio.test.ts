import assert from "node:assert/strict";
import test from "node:test";
import { serveStudio } from "../../src/server/auth/studio.ts";
import { isPublicPath } from "../../src/server/auth/paths.ts";
import { readFileSync } from "node:fs";

const sources = {
  "prototypes/index.html": "<h1>Private designs</h1>",
  "prototypes/scripts/plan-renderer.mjs":
    'import MarkdownIt from "../../node_modules/markdown-it/dist/browser/markdown-it.esm.min.mjs";',
  "prototypes/vendor/markdown-it.esm.min.mjs":
    "export default class MarkdownIt {}",
  "docs/09-local-business-launch-plan.md": "# Private business plan",
  "docs/19-product-photos.md": "# Private photo operations",
  "prototypes/inventory-products/index.html":
    '<link href="/admin.css"><script src="/app.mjs"></script>',
  "prototypes/inventory-products/app.mjs": '<img src="/assets/soap.svg">',
};
const admin = { uid: "fixture-admin", actorId: "fixture-actor" };

test("current storefront remains public while sprint and every latest preview stay private", async () => {
  for (const path of ["/cart", "/cart/", "/contact", "/contact/"])
    assert.equal(isPublicPath(path), true, path);
  for (const path of [
    "/team-sprint",
    "/prototypes/editor/",
    "/prototypes/workbench-next/",
    "/docs/21-pickup-scheduling-plan.md",
  ])
    assert.equal(isPublicPath(path), false, path);
});

test("latest preview pages, modules and binary images render only for authenticated administrators", async () => {
  const paths = [
    "prototypes/archive.html",
    "prototypes/next/index.html",
    "prototypes/product-pages/index.html",
    "prototypes/editor/app.mjs",
    "prototypes/guided-next/preview.mjs",
    "prototypes/guided-scroll/index.html",
    "prototypes/workbench-next/drafts.mjs",
    "prototypes/pickup/index.html",
    "prototypes/redesign-2026/index.html",
    "prototypes/redesign-2026/prototype.html",
    "prototypes/redesign-2026/app.mjs",
    "prototypes/team-sprint/index.html",
    "docs/21-pickup-scheduling-plan.md",
    "docs/22-customer-website-redesign-plan.md",
    "prototypes/next/assets/soap-true-bar.webp",
  ];
  for (const path of paths) {
    const bytes = readFileSync(new URL("../../" + path, import.meta.url));
    const bundled = {
      [path]: path.endsWith(".webp") ? bytes : bytes.toString("utf8"),
    };
    const request = new Request("https://thetruehive.com/" + path);
    assert.equal(serveStudio(request, {}, bundled).status, 401, path);
    const response = serveStudio(request, { admin }, bundled);
    assert.equal(response.status, 200, path);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes, path);
    if (path.endsWith(".webp"))
      assert.equal(response.headers.get("content-type"), "image/webp");
  }
});

test("studio serves authenticated documents and dependent assets without public static copies", async () => {
  for (const [path, contentType, content] of [
    ["/prototypes/", "text/html", "Private designs"],
    [
      "/docs/09-local-business-launch-plan.md",
      "text/plain",
      "Private business plan",
    ],
    [
      "/prototypes/scripts/plan-renderer.mjs",
      "text/javascript",
      "../vendor/markdown-it.esm.min.mjs",
    ],
    [
      "/prototypes/vendor/markdown-it.esm.min.mjs",
      "text/javascript",
      "class MarkdownIt",
    ],
    ["/docs/19-product-photos.md", "text/plain", "Private photo operations"],
    [
      "/prototypes/inventory-products/",
      "text/html",
      'href="/prototypes/inventory-products/admin.css"',
    ],
    [
      "/prototypes/inventory-products/app.mjs",
      "text/javascript",
      'src="/prototypes/assets/soap.svg"',
    ],
  ]) {
    const response = serveStudio(
      new Request(`https://thetruehive.com${path}`),
      { admin },
      sources,
    );
    assert.equal(response.status, 200, path);
    assert.match(
      response.headers.get("content-type")!,
      new RegExp(contentType!),
    );
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.match(response.headers.get("vary")!, /Cookie/);
    assert((await response.text()).includes(content!), path);
  }
  const head = serveStudio(
    new Request("https://thetruehive.com/prototypes/", { method: "HEAD" }),
    { admin },
    sources,
  );
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});

test("studio denies missing identity, unregistered source, traversal aliases and mutations", () => {
  for (const [path, locals, method, status] of [
    ["/prototypes/", {}, "GET", 401],
    ["/docs/09-local-business-launch-plan.md", {}, "GET", 401],
    ["/prototypes/", { admin }, "POST", 405],
    ["/prototypes/tests/private.test.mjs", { admin }, "GET", 404],
    ["/.env", { admin }, "GET", 404],
    ["/docs%2f09-local-business-launch-plan.md", { admin }, "GET", 400],
  ] as const) {
    assert.equal(
      serveStudio(
        new Request(`https://thetruehive.com${path}`, { method }),
        locals,
        sources,
      ).status,
      status,
      path,
    );
  }
});
