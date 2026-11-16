import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const origin = "http://127.0.0.1:4327";
const root = `${origin}/prototypes/next/`;

for (const failure of ["read", "write"] as const) {
  test(`preview cart survives ${failure} storage failures and stays isolated by direction`, async ({
    page,
  }) => {
    await page.addInitScript((blockedOperation) => {
      if (blockedOperation === "write")
        sessionStorage.setItem(
          "true-hive-design-review-atelier",
          JSON.stringify([
            { variantKey: "coconut-milk-delight-4oz-single", quantity: 1 },
          ]),
        );
      Object.defineProperty(
        Storage.prototype,
        blockedOperation === "read" ? "getItem" : "setItem",
        {
          value() {
            throw new DOMException("Storage blocked", "SecurityError");
          },
        },
      );
    }, failure);
    await page.goto(`${root}concept.html?design=atelier&view=product`);
    await page.getByRole("button", { name: "Add to preview cart" }).click();
    await page
      .getByRole("navigation", { name: "Store navigation" })
      .getByRole("link", { name: /Preview cart/ })
      .click();
    const total = failure === "write" ? "$20.00" : "$10.00";
    await expect(page.locator(".preview-cart > .product-price")).toContainText(
      total,
    );
    await page
      .getByRole("combobox", { name: "Direction", exact: true })
      .selectOption("honeyglass");
    await expect(page.locator(".preview-cart")).toContainText(
      "Your preview cart is empty.",
    );
    await page
      .getByRole("combobox", { name: "Direction", exact: true })
      .selectOption("atelier");
    await expect(page.locator(".preview-cart > .product-price")).toContainText(
      total,
    );
  });
}

test("preview cart keeps keyboard focus through additions, quantity changes and removal", async ({
  page,
}) => {
  await page.goto(`${root}concept.html?design=atelier&view=product`);
  const add = page.getByRole("button", { name: "Add to preview cart" });
  await add.focus();
  await add.press("Enter");
  await expect(add).toBeFocused();
  await page
    .getByRole("navigation", { name: "Store navigation" })
    .getByRole("link", { name: /Preview cart/ })
    .click();
  const quantity = page.getByLabel("Quantity", { exact: true });
  await quantity.focus();
  await quantity.press("ArrowUp");
  await expect(quantity).toHaveValue("2");
  await expect(quantity).toBeFocused();
  await quantity.press("ArrowUp");
  await expect(quantity).toHaveValue("3");
  await expect(quantity).toBeFocused();
  await page.getByRole("button", { name: "Remove", exact: true }).focus();
  await page
    .getByRole("button", { name: "Remove", exact: true })
    .press("Enter");
  await expect(
    page.getByRole("link", { name: "Keep exploring", exact: true }),
  ).toBeFocused();
});

test("Night Apiary focus indicators remain visible on light review and ingredient panels", async ({
  page,
}) => {
  await page.goto(`${root}concept.html?design=night-apiary&view=product`);
  for (const [controlSelector, surfaceSelector] of [
    [".review-bar select", ".review-bar"],
    [".ingredient-panel summary", ".ingredient-panel"],
  ] as const) {
    const control = page.locator(controlSelector);
    await control.focus();
    const contrast = await control.evaluate((element, selector) => {
      const luminance = (color: string) => {
        const [r, g, b] = color
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number)
          .map((channel) => {
            const value = channel / 255;
            return value <= 0.04045
              ? value / 12.92
              : ((value + 0.055) / 1.055) ** 2.4;
          });
        if (r === undefined || g === undefined || b === undefined)
          throw new Error(`Expected an RGB color, received ${color}`);
        return r * 0.2126 + g * 0.7152 + b * 0.0722;
      };
      const outline = luminance(getComputedStyle(element).outlineColor);
      const surface = luminance(
        getComputedStyle(document.querySelector(selector)!).backgroundColor,
      );
      return (
        (Math.max(outline, surface) + 0.05) /
        (Math.min(outline, surface) + 0.05)
      );
    }, surfaceSelector);
    expect.soft(contrast, controlSelector).toBeGreaterThanOrEqual(3);
  }
});

test("the new review hub links five complete directions without replacing the original studio", async ({
  page,
}) => {
  await page.goto(`${root}index.html`);
  await expect(page.locator(".concept-tile")).toHaveCount(5);
  for (const tile of await page.locator(".concept-tile").all()) {
    await expect(
      tile.getByRole("link", { name: "Home", exact: true }),
    ).toBeVisible();
    await expect(
      tile.getByRole("link", { name: "Store", exact: true }),
    ).toBeVisible();
    await expect(
      tile.getByRole("link", { name: "Product & ingredients", exact: true }),
    ).toBeVisible();
  }
  await page.getByRole("link", { name: "Original design studio" }).click();
  await expect(page.locator("#concept-grid [data-concept]")).toHaveCount(10);
});

for (const [design, mode] of [
  ["atelier", "overlay"],
  ["honeyglass", "ribbon"],
  ["field-notes", "ledger"],
  ["soft-geometry", "card"],
  ["night-apiary", "drawer"],
] as const) {
  test(`${design} supports distinct ingredient presentation, separate variants and a local-only cart`, async ({
    page,
  }) => {
    const errors: string[] = [];
    const mutations: string[] = [];
    const apiRequests: string[] = [];
    const origins = new Set<string>();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      origins.add(new URL(request.url()).origin);
      if (new URL(request.url()).pathname.startsWith("/api/"))
        apiRequests.push(request.url());
      if (request.method() !== "GET") mutations.push(request.method());
    });
    await page.goto(`${root}concept.html?design=${design}`);
    await expect(
      page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link"),
    ).toHaveText(["Store", "Services", "About us"]);
    await expect(
      page.getByRole("navigation", { name: "Store navigation" }),
    ).toHaveCount(0);
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Store", exact: true })
      .click();
    await page
      .locator('.format-links a[href*="coconut-milk-delight-4oz-wolf"]')
      .click();
    await expect(page.locator(".product-stage .hero-image")).toHaveAttribute(
      "src",
      /soap-delight-wolf/,
    );
    const ingredients = page.locator("[data-ingredient-mode]");
    await expect(ingredients).toHaveAttribute("data-ingredient-mode", mode);
    if (mode === "drawer") await ingredients.locator("summary").click();
    await expect(ingredients.locator("li")).toHaveText([
      "Avocado Oil",
      "Coconut Oil",
      "Distilled Water",
      "Coconut Milk",
      "Lye",
      "Shea Butter",
      "Mango Butter",
      "Castor Oil",
      "Sweet Almond Oil",
    ]);
    await expect(
      ingredients.getByText("Sweet Almond Oil", { exact: true }),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page
      .getByRole("navigation", { name: "Product formats" })
      .getByRole("link", { name: /Single 4oz bar/ })
      .click();
    await expect(page.locator(".product-stage .hero-image")).toHaveAttribute(
      "src",
      /soap-delight-bar/,
    );
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Store", exact: true })
      .click();
    await page
      .locator('.format-links a[href*="the-true-soap-4oz-wolf"]')
      .click();
    await expect(page.locator(".product-stage .hero-image")).toHaveAttribute(
      "src",
      /soap-true-wolf/,
    );
    await expect(page.locator(".ingredient-list li")).toHaveCount(7);
    await page
      .getByRole("button", { name: "Add to preview cart", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "No order has been placed",
    );
    await page
      .getByRole("navigation", { name: "Store navigation" })
      .getByRole("link", { name: /Preview cart/ })
      .click();
    await expect(page.locator(".preview-cart")).toContainText("$12.50");
    await page.getByLabel("Quantity", { exact: true }).fill("2");
    await page.getByLabel("Quantity", { exact: true }).press("Tab");
    await expect(page.locator(".preview-cart > .product-price")).toContainText(
      "$25.00",
    );
    await page.reload();
    await expect(page.locator(".preview-cart > .product-price")).toContainText(
      "$25.00",
    );

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const view of ["home", "store", "product", "services", "about"]) {
        await page.goto(`${root}concept.html?design=${design}&view=${view}`);
        await expect(page.locator(".concept-header")).toBeVisible();
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
          `${design}/${view}/${width}`,
        ).toBeLessThanOrEqual(width);
      }
    }
    await page.goto(`${root}concept.html?design=${design}&view=product`);
    const mobileIngredients = page.locator("[data-ingredient-mode]");
    if (mode === "drawer") await mobileIngredients.locator("summary").click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect([...origins]).toEqual([origin]);
    expect(mutations).toEqual([]);
    expect(apiRequests).toEqual([]);
    expect(errors).toEqual([]);
  });
}
