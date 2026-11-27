import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Product } from "../../src/domain/catalog.ts";
import {
  renderCatalogFixture,
  root,
  styles,
} from "../site/barcode-test-helper.ts";

const products: Product[] = [
  {
    key: "coconut-milk-delight",
    slug: "coconut-milk-delight",
    title: "Coconut Milk Delight",
    category: "soap",
    kind: "active",
    imageKey: "soap",
    summary:
      "A Teawood scented soap made with coconut milk to give a luxurious lather.",
    details: ["Size: 4oz"],
    ingredients: [
      "Avocado Oil",
      "Coconut Oil",
      "Distilled Water",
      "Coconut Milk",
      "Lye",
      "Shea Butter",
      "Mango Butter",
      "Castor Oil",
      "Sweet Almond Oil",
    ],
    variants: [
      {
        key: "coconut-milk-delight-4oz-single",
        label: "Single 4oz bar",
        priceMinor: 1000,
        currency: "USD",
        stock: { state: "available" },
      },
      {
        key: "coconut-milk-delight-4oz-wolf",
        label: "Single 1oz Wolf Mold",
        priceMinor: 1250,
        currency: "USD",
        stock: { state: "available" },
      },
    ],
  },
  {
    key: "the-true-soap",
    slug: "the-true-soap",
    title: "The True Soap",
    category: "soap",
    kind: "active",
    imageKey: "soap",
    summary: "A vanilla and tonka bean soap.",
    details: ["Size: 4oz"],
    ingredients: [
      "Avocado Oil",
      "Distilled Water",
      "Palm Oil",
      "Coconut Oil",
      "Lye",
      "Castor Oil",
      "Beeswax ;)",
    ],
    variants: [
      {
        key: "the-true-soap-4oz-single",
        label: "Single 4oz bar",
        priceMinor: 1000,
        currency: "USD",
        stock: { state: "available" },
      },
      {
        key: "the-true-soap-4oz-wolf",
        label: "Single 1oz Wolf Mold",
        priceMinor: 1250,
        currency: "USD",
        stock: { state: "available" },
      },
    ],
  },
  {
    key: "wildflower-honey",
    slug: "wildflower-honey",
    title: "Wildflower Honey",
    category: "honey",
    kind: "active",
    imageKey: "honey",
    summary: "Seasonal honey.",
    details: [],
    variants: [
      {
        key: "honey-jar",
        label: "Single 3 pound jar",
        priceMinor: 1500,
        currency: "USD",
        stock: { state: "out_of_stock" },
      },
    ],
  },
  {
    key: "nile-crocodile",
    slug: "nile-crocodile",
    title: "Nile Crocodile",
    category: "candles",
    kind: "active",
    imageKey: "candle",
    summary: "Seasonal candle.",
    details: [],
    variants: [
      {
        key: "candle-single",
        label: "Single 10oz candle",
        priceMinor: 1000,
        currency: "USD",
        stock: { state: "out_of_stock" },
      },
    ],
  },
];

const pages = [
  { path: "/", file: "src/pages/index.astro", page: "home" },
  { path: "/goods", file: "src/pages/goods/index.astro", page: "goods" },
  {
    path: "/goods/coconut-milk-delight",
    file: "src/pages/goods/[slug].astro",
    page: "product",
    slug: "coconut-milk-delight",
  },
  {
    path: "/goods/the-true-soap",
    file: "src/pages/goods/[slug].astro",
    page: "product",
    slug: "the-true-soap",
  },
  { path: "/services", file: "src/pages/services.astro", page: "services" },
  { path: "/about", file: "src/pages/about.astro", page: "about" },
  { path: "/contact", file: "src/pages/contact.astro", page: "contact" },
  { path: "/cart", file: "src/pages/cart.astro", page: "cart" },
];

test("all Golden pages are compared with the rendered prototype on desktop and mobile in light and dark", async ({
  page,
}, testInfo) => {
  test.setTimeout(180000);
  const context = page.context();
  let css = "";
  await context.route("**/golden-render-fixture.css", (route) =>
    route.fulfill({ contentType: "text/css", body: css }),
  );
  await context.route("**/api/catalog", (route) =>
    route.fulfill({ json: { source: "database", products } }),
  );
  const assets = [
    new URL("src/assets/", root).pathname,
    new URL("prototypes/assets/", root).pathname,
  ];
  await context.route(
    (url) => assets.some((prefix) => url.pathname.startsWith(prefix)),
    async (route) => {
      const file = new URL(route.request().url()).pathname;
      if (!/\.(webp|svg|png)$/.test(file)) return route.abort();
      await route.fulfill({
        body: await readFile(file),
        contentType: file.endsWith(".svg")
          ? "image/svg+xml"
          : file.endsWith(".png")
            ? "image/png"
            : "image/webp",
      });
    },
  );
  for (const entry of pages) {
    await context.route(`http://127.0.0.1:4325${entry.path}`, async (route) => {
      const response = await route.fetch();
      const native = await renderCatalogFixture(
        entry.file,
        route.request().url(),
        products,
      );
      const body = native.match(/<body\b[^>]*>([\s\S]*?)<\/body>/)?.[1];
      expect(body, entry.path).toBeTruthy();
      css = [...styles.values()].flat().join("\n");
      const original = await response.text();
      const clients = [
        ...original.matchAll(
          /<script\b[^>]*src="[^"]+"[^>]*>[\s\S]*?<\/script>/g,
        ),
      ]
        .map((match) => match[0])
        .join("");
      expect(clients, "retain the real bundled public controllers").not.toBe(
        "",
      );
      const html = original
        .replace(
          /<body\b[^>]*>[\s\S]*?<\/body>/,
          `<body>${body}${clients}</body>`,
        )
        .replace(
          "</head>",
          '<link rel="stylesheet" href="/golden-render-fixture.css"></head>',
        );
      await route.fulfill({ response, status: 200, body: html });
    });
  }
  const reference = await context.newPage();
  try {
    for (const mode of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: mode });
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await reference.setViewportSize({ width, height: 1000 });
        for (const entry of pages) {
          await page.goto(entry.path);
          await reference.goto(
            `http://127.0.0.1:4327/prototypes/redesign-2026/prototype.html?proto=golden-apothecary&page=${entry.page}&mode=${mode}${entry.slug ? `&slug=${entry.slug}` : ""}`,
          );
          await reference.addStyleTag({
            content:
              ".studio-bar {display:none!important} .site-header {top:0!important}",
          });
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          if (entry.page === "home") {
            const copy = (await page.locator(".home-hero-copy").boundingBox())!;
            const scene = (await page.locator(".home-scene").boundingBox())!;
            const originalCopy = (await reference
              .locator(".ga-hero-grid > div")
              .first()
              .boundingBox())!;
            const originalScene = (await reference
              .locator(".ga-collage")
              .boundingBox())!;
            expect(width === 1440 ? copy.x < scene.x : scene.y < copy.y).toBe(
              width === 1440
                ? originalCopy.x < originalScene.x
                : originalScene.y < originalCopy.y,
            );
          }
          if (width === 1440)
            await expect(
              page.getByRole("button", { name: /^Appearance:/ }),
            ).toBeVisible();
          else
            await expect(
              page.getByRole("button", { name: "Menu", exact: true }),
            ).toBeVisible();
          if (entry.page === "contact")
            await expect(page.locator("[data-inquiry-form]")).toBeVisible();
          if (entry.page === "cart")
            await expect(page.locator("[data-cart-subtotal]")).toHaveText(
              "$0.00",
            );
          if (["home", "goods"].includes(entry.page))
            await expect(
              page.locator("[data-quick-add]").first(),
            ).toBeVisible();
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
            `${entry.path}/${mode}/${width}`,
          ).toBeLessThanOrEqual(width);
          for (const recipe of products.slice(0, 2)) {
            const guide = page.getByRole("group", {
              name: `${recipe.title} sensory profile`,
              exact: true,
            });
            const prototypeGuide = reference.getByRole("group", {
              name: `${recipe.title} sensory profile`,
              exact: true,
            });
            if (await prototypeGuide.count()) {
              await expect(guide).toHaveCount(1);
              for (const label of [
                "Creaminess",
                "Scent Warmth",
                "Bar Firmness",
              ])
                await expect(
                  guide.getByRole("meter", { name: label, exact: true }),
                ).toHaveAttribute(
                  "aria-valuenow",
                  (await prototypeGuide
                    .getByRole("meter", { name: label, exact: true })
                    .getAttribute("aria-valuenow"))!,
                );
            }
          }
          for (const target of [page, reference]) {
            for (const image of await target.locator("main img").all()) {
              await image.scrollIntoViewIfNeeded();
              await expect
                .poll(
                  () =>
                    image.evaluate(
                      (node: HTMLImageElement) => node.naturalWidth,
                    ),
                  { timeout: 10000 },
                )
                .toBeGreaterThan(0);
            }
            await target.evaluate(() =>
              window.scrollTo({ top: 0, behavior: "instant" }),
            );
          }
          const label = `${entry.page}-${entry.slug ?? "index"}-${mode}-${width}.png`;
          await page.screenshot({
            fullPage: true,
            path: testInfo.outputPath(`native-${label}`),
          });
          await reference.screenshot({
            fullPage: true,
            path: testInfo.outputPath(`prototype-${label}`),
          });
        }
      }
    }
  } finally {
    await reference.close();
  }
});
