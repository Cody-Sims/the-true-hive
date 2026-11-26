import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { render, root } from "../site/barcode-test-helper.ts";

test("verified workspace navigation stays separate from the public header and remains usable on phones", async ({
  page,
}) => {
  const css = (
    await Promise.all([
      readFile(new URL("src/styles/site.css", root), "utf8"),
      readFile(new URL("src/styles/golden.css", root), "utf8"),
    ])
  ).join("\n");
  for (const signedIn of [false, true]) {
    const html = await render(
      "src/layouts/SiteLayout.astro",
      { title: "Navigation fixture", description: "Navigation fixture" },
      {
        request: new Request("http://127.0.0.1:4325/"),
        locals: {
          nonce: "navigation-fixture",
          ...(signedIn
            ? { admin: { uid: "fixture", actorId: "fixture" } }
            : {}),
        },
      },
    );
    await page.route("**/navigation-fixture", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: html.replace("</head>", `<style>${css}</style></head>`),
      }),
    );
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/navigation-fixture");
      await expect(
        page
          .getByRole("navigation", { name: "Main navigation" })
          .getByRole("link"),
      ).toHaveText(["Store", "Services", "About us"]);
      const workspace = page.getByRole("navigation", {
        name: "Administrator navigation",
      });
      if (signedIn) {
        await expect(workspace).toBeVisible();
        await expect(workspace.locator("xpath=ancestor::header")).toHaveCount(
          0,
        );
        await expect(workspace.getByRole("link")).toHaveText([
          "Inventory",
          "Team board",
          "Studio",
          "Planning",
        ]);
        for (const link of await workspace.getByRole("link").all()) {
          const box = await link.boundingBox();
          expect(box?.height).toBeGreaterThanOrEqual(44);
        }
      } else {
        await expect(workspace).toHaveCount(0);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    }
    await page.unroute("**/navigation-fixture");
  }
});

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

test("Golden Apothecary reflows without horizontal overflow at all required widths", async ({
  page,
}) => {
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      /Small-batch soaps.*everyday luxury/i,
    );
    await expect(
      page.getByRole("link", { name: /Shop the collection/ }),
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
    .getByRole("link", { name: "Store" })
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
  expect((await request.get("/api/health/ready")).status()).toBe(503);
  expect((await request.get("/api/health/live")).status()).toBe(200);
  for (const path of [
    "/prototypes/market.html",
    "/docs/09-local-business-launch-plan.md",
    "/team-sprint",
    "/prototypes/editor/",
    "/prototypes/workbench-next/",
    "/prototypes/next/assets/soap-true-bar.webp",
    "/prototypes/pickup/app.mjs",
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(503);
    expect(response.headers()["cache-control"], path).toBe("private, no-store");
    expect(await response.text(), path).not.toMatch(/<html|export |RIFF/);
  }
  for (const path of [
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
  expect(await page.text()).toMatch(/catalog is temporarily unavailable/i);
  expect(await page.text()).not.toContain("Everyday soap");
});

test("keyboard entry, confirmed phone contact and local email drafts remain intact", async ({
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
    .getByRole("link", { name: "Services", exact: true })
    .click();
  await page.getByRole("link", { name: "Prepare a service inquiry" }).click();
  await expect(page).toHaveURL(/\/contact#inquiry$/);
  await expect(
    page.locator("#connect").getByRole("link", { name: /Call.*368-2262/ }),
  ).toHaveAttribute("href", "tel:+14233682262");
  await expect(page.locator("#connect")).not.toContainText(
    /not published|will appear/i,
  );
  await expect(page.locator("[data-inquiry-form]")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open email draft", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Email loganstakely18@gmail.com" }),
  ).toHaveAttribute("href", "mailto:loganstakely18@gmail.com");
  await expect(page.locator("#inquiry")).toContainText(
    "Nothing is sent by this website.",
  );
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
    "/contact",
    "/about",
    "/privacy",
    "/accessibility",
    "/not-a-published-page",
  ]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations, path).toEqual([]);
  }
});
