import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const root =
  process.env["PRODUCT_STUDIES_URL"] ??
  "http://127.0.0.1:4327/prototypes/product-pages/";
const products = [
  {
    key: "coconut-milk-delight",
    title: "Coconut Milk Delight",
    image: "soap-delight",
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
  },
  {
    key: "the-true-soap",
    title: "The True Soap",
    image: "soap-true",
    ingredients: [
      "Avocado Oil",
      "Distilled Water",
      "Palm Oil",
      "Coconut Oil",
      "Lye",
      "Castor Oil",
      "Beeswax ;)",
    ],
  },
];

for (const design of [
  "quick-pick",
  "formula-map",
  "format-studio",
  "label-room",
  "gallery-focus",
]) {
  test(`${design} is a new product-only composition with correct variants and accessible ingredients`, async ({
    page,
  }) => {
    const unexpected: string[] = [];
    page.on("pageerror", (error) => unexpected.push(error.message));
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        request.method() !== "GET" ||
        url.origin !== new URL(root).origin ||
        url.pathname.startsWith("/api/")
      )
        unexpected.push(`${request.method()} ${request.url()}`);
    });
    await page.goto(`${root}index.html?design=${design}`);
    const fixedHeader = await page.locator(".header-frame").innerHTML();
    const fixedFooter = await page.locator(".site-footer").innerHTML();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Coconut Milk Delight",
    );
    await expect(page.locator("[data-study]")).toHaveAttribute(
      "data-study",
      design,
    );
    await expect(page.getByText(/^AI styling references?$/)).toBeVisible();
    await expect(
      page
        .getByRole("combobox", { name: "Direction", exact: true })
        .locator("option"),
    ).toHaveCount(5);
    for (const product of products) {
      await page
        .getByRole("combobox", { name: "Product", exact: true })
        .selectOption(product.key);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        product.title,
      );
      for (const [format, suffix, price] of [
        ["wolf", "wolf", "$12.50"],
        ["single", "bar", "$10.00"],
      ] as const) {
        const choice = page.locator(
          `a[data-variant="${product.key}-4oz-${format}"]`,
        );
        await choice.focus();
        await choice.press("Enter");
        await expect(choice).toBeFocused();
        await expect(page.locator("[data-hero]")).toHaveAttribute(
          "src",
          `../next/assets/${product.image}-${suffix}.webp`,
        );
        await expect(page.locator("[data-selected-price]")).toHaveText(price);
        const disclosure = page.locator(
          "details[data-ingredients]:not([open])",
        );
        if (await disclosure.count())
          await disclosure.locator("summary").click();
        await expect(page.locator("[data-ingredients] li")).toHaveText(
          product.ingredients,
        );
        await expect(
          page.locator("[data-ingredients] li").last(),
        ).toBeVisible();
        const add = page.getByRole("button", {
          name: "Add to cart",
          exact: true,
        });
        await add.focus();
        await add.press("Enter");
        await expect(add).toBeFocused();
        await expect(page.getByRole("status")).toContainText(price);
        await expect(page.getByRole("status")).toContainText("No order");
      }
    }
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await expect(page.locator("[data-ingredients] li").last()).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    }
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "The True Soap",
    );
    await expect(page.locator("[data-hero]")).toHaveAttribute(
      "src",
      /soap-true-bar/,
    );
    expect(await page.locator(".header-frame").innerHTML()).toBe(fixedHeader);
    expect(await page.locator(".site-footer").innerHTML()).toBe(fixedFooter);
    expect(unexpected).toEqual([]);
  });
}
