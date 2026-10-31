import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { spawnSync } from "node:child_process";

test("packaged startup refuses an unconfigured database before serving", () => {
  const result = spawnSync(
    process.execPath,
    ["--env-file-if-exists=.env", "scripts/start-site.mjs"],
    {
      cwd: new URL("../../", import.meta.url),
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: "0",
        SITE_URL: "http://127.0.0.1:4325",
        SITE_INDEXABLE: "false",
        CATALOG_SOURCE: "database",
        DATABASE_URL: "",
        DATABASE_TLS: "verify-full",
      },
      encoding: "utf8",
      timeout: 10000,
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Startup checks failed.");
  expect(result.stdout).not.toContain("Server listening");
});

test("Apiary Market reflows without horizontal overflow at all required widths", async ({
  page,
}) => {
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      /GOOD THINGS/,
    );
    await expect(
      page.getByRole("link", { name: /Explore the collection/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
});

test("the collection, product, breadcrumbs and genuine missing-product response are usable", async ({
  page,
}) => {
  await page.goto("/goods");
  await page
    .getByRole("heading", { name: "Everyday soap" })
    .getByRole("link")
    .click();
  await expect(page).toHaveURL(/\/goods\/everyday-soap$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Everyday soap",
  );
  await expect(
    page.getByText("Concept product", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "The goods" })
    .click();
  await expect(page).toHaveURL(/\/goods$/);
  const missing = await page.goto("/goods/not-published");
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /isn.t on the shelf/,
  );
});

test("read-only APIs expose explicit concepts but no real count, SKU, audit or purchase action", async ({
  request,
}) => {
  const response = await request.get("/api/catalog");
  expect(response.status()).toBe(200);
  const catalog = await response.json();
  expect(catalog.source).toBe("showcase");
  expect(catalog.products).toHaveLength(3);
  expect(
    catalog.products.every(
      (product: { kind: string; variants: { priceMinor: number | null }[] }) =>
        product.kind === "concept" &&
        product.variants.every((variant) => variant.priceMinor === null),
    ),
  ).toBe(true);
  const body = JSON.stringify(catalog);
  expect(body).not.toMatch(/on_hand|committed|actor_id|"sku"/);
  expect(
    (await request.post("/api/inventory", { data: { delta: 100 } })).status(),
  ).toBe(404);
  expect(
    (await request.post("/api/catalog", { data: { stock: 100 } })).status(),
  ).toBeGreaterThanOrEqual(400);
  const ready = await (await request.get("/api/health/ready")).json();
  expect(ready.inventoryConnected).toBe(false);
  expect(ready.checkoutEnabled).toBe(false);
  for (const path of [
    "/prototypes/market.html",
    "/docs/09-local-business-launch-plan.md",
    "/server/entry.mjs",
    "/migrations/001_inventory.sql",
    "/.env",
    "/.neon",
  ]) {
    expect((await request.get(path)).status()).toBe(404);
  }
});

test("unsafe query keys are rejected and unavailable database mode never falls back", async ({
  request,
}) => {
  expect(
    (
      await request.get("/api/availability?variant=%27%3Bdrop&location=pickup")
    ).status(),
  ).toBe(400);
  expect((await request.get("/api/products/not-published")).status()).toBe(404);
  const response = await request.get("http://127.0.0.1:4326/api/catalog");
  expect(response.status()).toBe(503);
  expect((await response.json()).error.code).toBe("NOT_CONFIGURED");
  const page = await request.get("http://127.0.0.1:4326/goods");
  expect(page.status()).toBe(503);
  expect(await page.text()).toMatch(/no fictional stock/i);
  expect(await page.text()).not.toContain("Everyday soap");
});

test("keyboard entry, clear contact placeholders and no email collection remain intact", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: /Connect/ })
    .click();
  await expect(
    page.getByText("Phone and profile details are not published yet."),
  ).toBeVisible();
  expect(await page.locator("form").count()).toBe(0);
  expect(await page.locator('a[href^="mailto:"]').count()).toBe(0);
});

test("the draft is non-indexable and publishes no fake product offers or rating data", async ({
  page,
  request,
}) => {
  const response = await page.goto("/goods/everyday-soap");
  expect(response?.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, follow",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "http://127.0.0.1:4325/goods/everyday-soap",
  );
  const structured = await page
    .locator('script[type="application/ld+json"]')
    .textContent();
  expect(JSON.parse(structured ?? "{}")["@type"]).toBe("Organization");
  expect(structured).not.toMatch(/Offer|aggregateRating|price/);
  expect((await request.get("/sitemap.xml")).status()).toBe(404);
  expect(await (await request.get("/robots.txt")).text()).not.toContain(
    "Sitemap:",
  );
});

test("core customer pages meet the automated accessibility gate", async ({
  page,
}) => {
  for (const path of [
    "/",
    "/goods",
    "/goods/everyday-soap",
    "/services",
    "/about",
  ]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations, path).toEqual([]);
  }
});
