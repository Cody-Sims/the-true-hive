import { expect, test, type Page } from "@playwright/test";

const fixtureCatalog = {
  source: "database",
  products: [
    {
      key: "cart-test-soap",
      slug: "cart-test-soap",
      title: "Cart test soap",
      summary: "Isolated browser fixture, never inventory",
      details: [],
      category: "soap",
      imageKey: "soap",
      kind: "active",
      variants: [
        {
          key: "cart-test-bar",
          label: "Bar",
          priceMinor: 725,
          currency: "USD",
          stock: { state: "low_stock", remaining: 3 },
        },
        {
          key: "cart-test-pair",
          label: "Pair",
          priceMinor: 1400,
          currency: "USD",
          stock: { state: "available" },
        },
      ],
    },
  ],
};

async function seed(page: Page, lines: unknown[]) {
  await page.addInitScript((saved) => {
    if (localStorage.getItem("true-hive-cart") === null)
      localStorage.setItem(
        "true-hive-cart",
        JSON.stringify({ version: 1, lines: saved }),
      );
  }, lines);
}

test("cart uses current prices, persists only identities, and supports keyboard quantity/remove/clear", async ({
  page,
}) => {
  await seed(page, [
    {
      variantKey: "cart-test-bar",
      quantity: 2,
      priceMinor: 1,
      customer: "never store",
    },
    { variantKey: "cart-test-pair", quantity: 1 },
  ]);
  let price = 725;
  await page.route("**/api/catalog", async (route) => {
    const catalog = structuredClone(fixtureCatalog);
    catalog.products[0]!.variants[0]!.priceMinor = price;
    await route.fulfill({ json: catalog });
  });
  await page.goto("/cart");
  await expect(page.locator("[data-cart-subtotal]")).toHaveText("$28.50");
  await expect(page.getByText("Only 3 left", { exact: true })).toBeVisible();
  const quantity = page.getByRole("spinbutton", {
    name: "Quantity for Cart test soap Bar",
  });
  await quantity.fill("3");
  await quantity.press("Enter");
  await expect(page.locator("[data-cart-subtotal]")).toHaveText("$35.75");
  await page.reload();
  await expect(page.locator("[data-cart-subtotal]")).toHaveText("$35.75");
  price = 800;
  await page
    .getByRole("button", { name: "Refresh prices and availability" })
    .click();
  await expect(page.locator("[data-cart-subtotal]")).toHaveText("$38.00");
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("true-hive-cart")!),
    ),
  ).toEqual({
    version: 1,
    lines: [
      { variantKey: "cart-test-bar", quantity: 3 },
      { variantKey: "cart-test-pair", quantity: 1 },
    ],
  });
  await page
    .getByRole("button", { name: "Remove Cart test soap Pair" })
    .click();
  await expect(page.locator("[data-cart-subtotal]")).toHaveText("$24.00");
  await page.getByRole("button", { name: "Clear cart", exact: true }).click();
  await expect(page.locator("[data-cart-empty]")).toBeVisible();
  await expect(page.locator("[data-cart-subtotal]")).toHaveText("$0.00");
});

test("missing and unavailable catalog lines are retained without invented totals or unsafe markup", async ({
  page,
}) => {
  await seed(page, [
    { variantKey: "cart-test-bar", quantity: 1 },
    { variantKey: "removed-variant", quantity: 1 },
  ]);
  let unavailable = true;
  await page.route("**/api/catalog", async (route) => {
    if (unavailable)
      await route.fulfill({ status: 503, json: { error: "Unavailable" } });
    else {
      const catalog = structuredClone(fixtureCatalog);
      catalog.products[0]!.title = '<img src=x onerror="window.cartXss=true">';
      await route.fulfill({ json: catalog });
    }
  });
  await page.goto("/cart");
  await expect(page.locator("[data-cart-status]")).toContainText(
    "catalog is unavailable",
  );
  await expect(page.locator("[data-cart-lines] > li")).toHaveCount(2);
  unavailable = false;
  await page
    .getByRole("button", { name: "Refresh prices and availability" })
    .click();
  await expect(
    page.getByText(/This variant is no longer published/),
  ).toBeVisible();
  await expect(page.locator("[data-cart-subtotal]")).toContainText(
    "Unavailable",
  );
  await expect(page.locator("[data-cart-lines] img")).toHaveCount(0);
  await expect(page.locator("[data-cart-lines]")).toContainText("<img src=x");
});

test("cart navigation and controls fit a narrow viewport without offering real checkout", async ({
  page,
}) => {
  await seed(page, [{ variantKey: "cart-test-bar", quantity: 1 }]);
  await page.route("**/api/catalog", (route) =>
    route.fulfill({ json: fixtureCatalog }),
  );
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/cart");
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: /Cart/ }),
  ).toBeVisible();
  await expect(page.locator("[data-cart-subtotal]")).toHaveText("$7.25");
  await expect(
    page.getByRole("heading", {
      name: "Online ordering isn't open yet.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("[data-cart-checkout]")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
