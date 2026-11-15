import assert from "node:assert/strict";
import test from "node:test";
import type { Browser } from "@playwright/test";
import type { AdminProduct } from "../../src/domain/admin.ts";
import { moduleUrl, render, root } from "./barcode-test-helper.ts";

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

test("draft variant markup exposes explicit blank-only suggestions without changing saved identity", async () => {
  const draft = await render("src/components/admin/VariantFields.astro", {});
  assert.match(draft, /data-suggest-sku/);
  assert.match(draft, /never overwrite/i);
  const saved = await render("src/components/admin/VariantFields.astro", {
    variant: {
      key: "fixture-oval",
      sku: '  Manual<&"  ',
      label: "Oval",
      active: false,
      priceMinor: null,
    },
  });
  assert.doesNotMatch(saved, /data-suggest-sku/);
  assert.match(saved, /readonly/);
  assert.match(saved, /Manual<&amp;&quot;/);
});

domTest(
  "actual admin bundle keeps manual/saved values and initializes dynamically added variant suggestions",
  async () => {
    const page = await browser!.newPage({
      viewport: { width: 375, height: 900 },
    });
    page.setDefaultTimeout(3000);
    try {
      const html = await render("src/components/admin/ProductForm.astro", {});
      await page.setContent(html);
      await page.addScriptTag({
        type: "module",
        content: `import ${JSON.stringify(await moduleUrl(new URL("src/client/admin.ts", root)))}; window.skuReady = true;`,
      });
      await page.waitForFunction(
        () => (window as unknown as { skuReady?: boolean }).skuReady,
      );
      await page.locator('[name="key"]').fill("fixture-soap");
      const first = page.locator("[data-admin-variant]").first();
      await first.locator('[name="label"]').fill("Oval mold");
      assert.equal(await first.locator('[name="sku"]').inputValue(), "");
      await first.locator("[data-suggest-sku]").click();
      assert.match(
        await first.locator('[name="sku"]').inputValue(),
        /^TH-FIXTURE-SOAP-OVAL-MOLD-/,
      );
      const generated = await first.locator('[name="variantKey"]').inputValue();
      await first.locator('[name="sku"]').fill("Manual-KEEP");
      await page.locator('[name="ingredients"]').fill("Fixture owner text");
      await first.locator('[name="label"]').fill("Changed actual name");
      await first.locator("[data-suggest-sku]").click();
      assert.equal(
        await first.locator('[name="sku"]').inputValue(),
        "Manual-KEEP",
      );
      assert.equal(
        await first.locator('[name="variantKey"]').inputValue(),
        generated,
      );
      await page.locator("[data-admin-add-variant]").click();
      const second = page.locator("[data-admin-variant]").nth(1);
      await second.locator('[name="label"]').fill("Oval mold");
      await second.locator("[data-suggest-sku]").click();
      assert.match(
        await second.locator("[data-sku-status]").innerText(),
        /collision/i,
      );
      assert.equal(await second.locator('[name="sku"]').inputValue(), "");
      await second.locator('[name="label"]').fill("Round mold");
      await second.locator("[data-suggest-sku]").click();
      assert.match(
        await second.locator('[name="sku"]').inputValue(),
        /ROUND-MOLD/,
      );
      await second
        .locator('[name="sku"]')
        .evaluate((node: HTMLInputElement) => {
          node.value = "";
          node.readOnly = true;
        });
      await second
        .locator('[name="variantKey"]')
        .evaluate((node: HTMLInputElement) => {
          node.value = "";
          node.readOnly = true;
        });
      await second.locator("[data-suggest-sku]").click();
      assert.equal(await second.locator('[name="sku"]').inputValue(), "");
      assert.equal(
        await second.locator('[name="variantKey"]').inputValue(),
        "",
      );
    } finally {
      await page.close();
    }
  },
);

domTest(
  "saving ingredient edits preserves the exact saved readonly SKU in the actual request",
  async () => {
    const sku = '  Manual<&" keep spaces  ';
    const product: AdminProduct = {
      key: "fixture-soap",
      slug: "fixture-soap",
      title: "Fixture soap",
      summary: "Fixture summary",
      details: [],
      ingredients: ["Fixture oil"],
      category: "soap",
      imageKey: "soap",
      kind: "draft",
      status: "draft",
      revision: 1,
      variants: [
        {
          key: "fixture-oval",
          sku,
          label: "Oval mold",
          active: false,
          priceMinor: null,
          currency: "USD",
          levels: [],
        },
      ],
    };
    const page = await browser!.newPage();
    page.setDefaultTimeout(3000);
    try {
      const html = await render("src/components/admin/ProductForm.astro", {
        product,
      });
      let payload: { variants: { sku: string }[] } | undefined;
      await page.route(
        "https://inventory.example.invalid/**",
        async (route) => {
          if (route.request().isNavigationRequest())
            return route.fulfill({
              contentType: "text/html",
              body: `<meta name="csrf-token" content="fixture-only">${html}`,
            });
          payload = route.request().postDataJSON();
          return route.fulfill({
            status: 400,
            contentType: "application/json",
            body: '{"error":{"message":"Fixture intentionally does not save"}}',
          });
        },
      );
      await page.goto(
        "https://inventory.example.invalid/inventory/products/fixture-soap",
      );
      await page.addScriptTag({
        type: "module",
        content: `import ${JSON.stringify(await moduleUrl(new URL("src/client/admin.ts", root)))}; window.skuReady = true;`,
      });
      await page.waitForFunction(
        () => (window as unknown as { skuReady?: boolean }).skuReady,
      );
      await page
        .locator('[name="ingredients"]')
        .fill("Fixture oil\nFixture water");
      await page.locator('[name="label"]').fill("Owner revised label");
      assert.equal(await page.locator('[name="sku"]').inputValue(), sku);
      assert.equal(await page.locator("[data-suggest-sku]").count(), 0);
      const request = page.waitForRequest(
        (request) => request.method() === "PUT",
      );
      await page.locator('button[value="save"]').click();
      await request;
      await page
        .locator("[data-admin-status]")
        .filter({ hasText: "Fixture intentionally" })
        .waitFor();
      assert.equal(payload?.variants[0]?.sku, sku);
    } finally {
      await page.close();
    }
  },
);
