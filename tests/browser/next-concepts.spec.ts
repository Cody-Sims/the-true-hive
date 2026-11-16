import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const origin = "http://127.0.0.1:4327";
const root = `${origin}/prototypes/next/`;

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
