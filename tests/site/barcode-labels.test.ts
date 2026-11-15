import assert from "node:assert/strict";
import test from "node:test";
import type { Browser } from "@playwright/test";
import type { AdminProduct } from "../../src/domain/admin.ts";
import {
  moduleUrl,
  render,
  renderResponse,
  root,
  styles,
} from "./barcode-test-helper.ts";

const product: AdminProduct = {
  key: "fixture-product",
  slug: "fixture-product",
  title: "<Fixture product>",
  summary: "Not label content",
  details: ["Size: not shared across molds", "Ingredients: never infer this"],
  ingredients: ["Fixture oil", "<b>Fixture water</b>"],
  category: "soap",
  imageKey: "soap",
  kind: "draft",
  status: "draft",
  revision: 1,
  variants: [
    {
      key: "fixture-oval",
      sku: '  EXACT<&"  ',
      label: "Actual oval",
      priceMinor: null,
      currency: "USD",
      active: false,
      levels: [],
    },
    {
      key: "fixture-round",
      sku: "ROUND",
      label: "Actual round",
      priceMinor: 12345,
      currency: "USD",
      active: true,
      levels: [],
    },
  ],
};
const component = "src/components/admin/BarcodeLabels.astro";
const domTest =
  process.env["INVENTORY_UI_BROWSER_TESTS"] === "1" ? test : test.skip;
let browser: Browser | undefined;
const originalTmpDir = process.env["TMPDIR"];
test.before(async () => {
  if (process.env["INVENTORY_UI_BROWSER_TESTS"] !== "1") return;
  process.env["TMPDIR"] = root.pathname;
  const { chromium } = await import("@playwright/test");
  browser = await chromium.launch({ env: process.env, timeout: 10000 });
});
test.after(async () => {
  await browser?.close();
  if (originalTmpDir === undefined) delete process.env["TMPDIR"];
  else process.env["TMPDIR"] = originalTmpDir;
});

test("labels contain only current authored ingredients and actual variant identities with private stored-SKU images", async () => {
  const html = await render(component, { product });
  assert.match(html, /&lt;Fixture product&gt;/);
  assert.match(html, /Actual oval/);
  assert.match(html, /Actual round/);
  assert.match(
    html,
    /Ingredients: Fixture oil, &lt;b&gt;Fixture water&lt;\/b&gt;/,
  );
  assert.match(html, /\/api\/admin\/variants\/fixture-oval\/barcode.svg/);
  assert.match(html, /\/api\/admin\/variants\/fixture-round\/barcode.svg/);
  assert.doesNotMatch(
    html,
    /12345|not shared across molds|never infer this|<b>Fixture water/,
  );
  assert.match(html, /not\s+retail.*GTIN/i);
  assert.match(html, /not\s+a\s+compliance certification/i);
  assert.match(html, /browser.*print/i);
});

test("empty ingredients stay absent, unsupported SKUs are explained, and long identities warn without mutation", async () => {
  const html = await render(component, {
    product: {
      ...product,
      ingredients: [],
      variants: [
        { ...product.variants[0], sku: "café" },
        { ...product.variants[1], sku: "L".repeat(128) },
      ],
    },
  });

  assert.doesNotMatch(html, /Ingredients:/);
  assert.match(html, /printable\s+ASCII/i);
  assert.match(html, /long SKU/i);
  assert.match(html, new RegExp("L".repeat(128)));
  assert.doesNotMatch(html, /\/fixture-oval\/barcode.svg/);
});

test("the product-label page requires trusted session locals and rejects invalid product keys without a database", async () => {
  const path = "src/pages/inventory/products/[key]/labels.astro";
  const denied = await renderResponse(path, {
    params: { key: "fixture-product" },
    request: new Request(
      "https://inventory.example.invalid/inventory/products/fixture-product/labels",
    ),
    locals: {},
  });
  assert.equal(denied.status, 403);
  assert.doesNotMatch(
    await denied.text(),
    /Fixture product|barcode.svg|Fixture oil/,
  );
  const invalid = await renderResponse(path, {
    params: { key: "invalid key" },
    request: new Request(
      "https://inventory.example.invalid/inventory/products/invalid%20key/labels",
    ),
    locals: {
      admin: { uid: "fixture-owner", actorId: "fixture-owner" },
      csrfToken: "fixture-only",
    },
  });
  assert.equal(invalid.status, 404);
  assert.doesNotMatch(await invalid.text(), /barcode.svg|postgres|SELECT/);
});

domTest(
  "print is explicit, waits for readable label images and hides private chrome on paper",
  async () => {
    const page = await browser!.newPage({
      viewport: { width: 375, height: 900 },
    });
    page.setDefaultTimeout(3000);
    try {
      const html = await render(component, { product });
      const css = styles.get(new URL(component, root).href)?.join("\n") ?? "";
      await page.route(
        "https://inventory.example.invalid/api/admin/**",
        async (route) =>
          route.fulfill({
            contentType: "image/svg+xml",
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><rect width="100" height="40" fill="white"/><path d="M20 5v30" stroke="black" stroke-width="4"/></svg>',
          }),
      );
      await page.setContent(
        `<base href="https://inventory.example.invalid/"><style>${css}</style><header class="admin-header"><span class="admin-identity">private@example.invalid</span><nav>Private navigation</nav></header><main><h1>Private title</h1>${html}</main><footer class="admin-footer">Private footer</footer>`,
      );
      await page.evaluate(() => {
        (window as unknown as { prints: number }).prints = 0;
        window.print = () => {
          (window as unknown as { prints: number }).prints++;
        };
      });
      await page.addScriptTag({
        type: "module",
        content: `import ${JSON.stringify(await moduleUrl(new URL("src/client/admin.ts", root)))}; window.printReady = true;`,
      });
      await page.waitForFunction(
        () => (window as unknown as { printReady?: boolean }).printReady,
      );
      assert.equal(
        await page.evaluate(
          () => (window as unknown as { prints: number }).prints,
        ),
        0,
      );
      assert.ok(
        await page
          .locator("[data-barcode-labels]")
          .evaluate(
            (node) => node.scrollWidth <= document.documentElement.clientWidth,
          ),
      );
      assert.equal(
        await page.locator(".label-sku code").first().textContent(),
        product.variants[0]!.sku,
      );
      await page.locator("[data-print-labels]").click();
      await page.waitForFunction(
        () => (window as unknown as { prints: number }).prints === 1,
      );
      await page.emulateMedia({ media: "print" });
      assert.equal(await page.locator(".admin-header").isVisible(), false);
      assert.equal(await page.locator(".admin-footer").isVisible(), false);
      assert.equal(
        await page.locator("[data-print-labels]").isVisible(),
        false,
      );
      assert.equal(await page.locator("[data-barcode-label]").count(), 2);
      assert.equal(
        await page.locator("[data-barcode-label]").first().isVisible(),
        true,
      );
      await page.emulateMedia({ media: "screen" });
      await page
        .locator("img")
        .first()
        .evaluate((node: HTMLImageElement) => {
          node.src = "data:image/svg+xml,broken";
        });
      await page.waitForFunction(() =>
        [...document.querySelectorAll("img")].some(
          (image) => image.complete && image.naturalWidth === 0,
        ),
      );
      await page.locator("[data-print-labels]").click();
      assert.match(
        await page.locator("[data-print-label-status]").innerText(),
        /unavailable|not ready/i,
      );
      assert.equal(
        await page.evaluate(
          () => (window as unknown as { prints: number }).prints,
        ),
        1,
      );
    } finally {
      await page.close();
    }
  },
);

domTest(
  "labels remain readable and printable with JavaScript disabled",
  async () => {
    const context = await browser!.newContext({
      javaScriptEnabled: false,
      viewport: { width: 375, height: 900 },
    });
    try {
      const page = await context.newPage();
      const html = await render(component, { product });
      const css = styles.get(new URL(component, root).href)?.join("\n") ?? "";
      await page.setContent(
        `<style>${css}</style><header class="admin-header">Private identity</header><main>${html}</main>`,
      );
      assert.equal(
        await page.locator("[data-print-labels]").isVisible(),
        false,
      );
      assert.match(
        await page.locator(".label-controls").innerText(),
        /browser's Print.*JavaScript off/s,
      );
      await page.emulateMedia({ media: "print" });
      assert.equal(await page.locator(".admin-header").isVisible(), false);
      assert.equal(
        await page.locator("[data-barcode-label]").first().isVisible(),
        true,
      );
      assert.equal(
        await page.locator(".label-sku code").first().textContent(),
        product.variants[0]!.sku,
      );
      assert.equal(await page.locator(".label-ingredients").count(), 2);
    } finally {
      await context.close();
    }
  },
);
