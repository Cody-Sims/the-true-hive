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

test("Add to cart saves the selected active priced fixture variant, merges duplicates and survives navigation", async ({
  page,
}) => {
  let checkoutAttempts = 0;
  await page.route("**/api/checkout", async (route) => {
    checkoutAttempts++;
    await route.abort();
  });
  await page.route("**/api/catalog", (route) =>
    route.fulfill({ json: fixtureCatalog }),
  );
  await page.route("**/goods?cart-fixture=active", async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    expect(html).toContain("</main>");
    const activeProductFixture = `
      <section aria-label="Isolated active priced product fixture">
        <h2>Cart test soap</h2>
        <form data-add-to-cart>
          <label>Variant
            <select name="variantKey" required>
              <option value="cart-test-bar">Bar · $7.25</option>
              <option value="cart-test-pair">Pair · $14.00</option>
            </select>
          </label>
          <label>Quantity
            <input name="quantity" type="number" min="1" max="100" step="1" value="1" required>
          </label>
          <button type="submit">Add to cart</button>
          <p data-add-status role="status"></p>
        </form>
      </section>`;
    await route.fulfill({
      response,
      body: html.replace("</main>", `${activeProductFixture}</main>`),
    });
  });
  await page.goto("/goods?cart-fixture=active");
  const form = page.locator("[data-add-to-cart]");
  await form.getByLabel("Variant").selectOption("cart-test-pair");
  await form.getByLabel("Quantity").fill("2");
  await form.getByRole("button", { name: "Add to cart", exact: true }).click();
  await expect(form.locator("[data-add-status]")).toContainText(
    "Added to your cart",
  );
  await form.getByLabel("Variant").selectOption("cart-test-bar");
  await form.getByLabel("Quantity").fill("1");
  await form.getByRole("button", { name: "Add to cart", exact: true }).click();
  await expect(page.locator("[data-cart-count]")).toHaveText([" (3)", " (3)"]);
  await form.getByRole("button", { name: "Add to cart", exact: true }).click();
  await expect(page.locator("[data-cart-count]")).toHaveText([" (4)", " (4)"]);
  await page
    .getByRole("navigation", { name: "Store navigation" })
    .getByRole("link", { name: /Cart/ })
    .click();
  await expect(page.locator("[data-cart-subtotal]")).toHaveText("$42.50");
  await expect(page.locator("[data-cart-lines] > li")).toHaveCount(2);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("true-hive-cart")!),
    ),
  ).toEqual({
    version: 1,
    lines: [
      { variantKey: "cart-test-pair", quantity: 2 },
      { variantKey: "cart-test-bar", quantity: 2 },
    ],
  });
  await page.reload();
  await expect(page.locator("[data-cart-subtotal]")).toHaveText("$42.50");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Our Story", exact: true })
    .click();
  await expect(page.locator("[data-cart-count]")).toHaveText(" (4)");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Shop Soaps", exact: true })
    .click();
  await expect(page.locator("[data-cart-count]")).toHaveText([" (4)", " (4)"]);
  await page
    .getByRole("navigation", { name: "Store navigation" })
    .getByRole("link", { name: /^Cart/ })
    .click();
  await expect(page.locator("[data-cart-subtotal]")).toHaveText("$42.50");
  expect(checkoutAttempts).toBe(0);
});

test("return and cancel URLs cannot settle a pending test intent or replace its frozen selection", async ({
  page,
}) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.route("**/api/catalog", (route) =>
    route.fulfill({ json: fixtureCatalog }),
  );
  await page.goto("/");
  const pending = {
    version: 1,
    operationId: "10000000-0000-4000-8000-000000000001",
    lines: [{ variantKey: "cart-test-bar", quantity: 2 }],
  };
  await page.evaluate((value) => {
    sessionStorage.setItem("true-hive-checkout-pending", JSON.stringify(value));
    localStorage.setItem(
      "true-hive-cart",
      JSON.stringify({
        version: 1,
        lines: [{ variantKey: "cart-test-pair", quantity: 1 }],
      }),
    );
  }, pending);
  for (const path of [
    "/checkout/return?payment=paid",
    "/checkout/cancel?released=true",
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", {
        name: "TEST checkout — outcome not confirmed",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: "Review or retry the pending test checkout",
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        JSON.parse(sessionStorage.getItem("true-hive-checkout-pending")!),
      ),
    ).toEqual(pending);
  }
  await page
    .getByRole("link", { name: "Review or retry the pending test checkout" })
    .click();
  await expect(page.locator("[data-cart-subtotal]")).toHaveText("$14.50");
  await expect(
    page.getByRole("spinbutton", { name: "Quantity for Cart test soap Bar" }),
  ).toHaveValue("2");
  await expect(
    page.getByRole("button", { name: "Clear cart", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("true-hive-checkout-pending")!),
    ),
  ).toEqual(pending);
});

test("a server-confirmed released checkout restores the latest saved cart before edits or a new attempt", async ({
  page,
}) => {
  const pending = {
    version: 1,
    operationId: "10000000-0000-4000-8000-000000000001",
    lines: [{ variantKey: "cart-test-bar", quantity: 2 }],
  };
  await page.addInitScript((value) => {
    sessionStorage.setItem("true-hive-checkout-pending", JSON.stringify(value));
    localStorage.setItem(
      "true-hive-cart",
      JSON.stringify({ version: 1, lines: value.lines }),
    );
  }, pending);
  await page.route("**/api/catalog", (route) =>
    route.fulfill({ json: fixtureCatalog }),
  );
  await page.route("**/cart?checkout-fixture=test", async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    expect(html).toContain('data-test-enabled="false"');
    expect(html).toMatch(/<section\b[^>]*\bdata-cart-page\b[^>]*>/);
    await route.fulfill({
      response,
      body: html
        .replace('data-test-enabled="false"', 'data-test-enabled="true"')
        .replace(
          /(<section\b[^>]*\bdata-cart-page\b[^>]*>)/,
          `$1<section aria-label="Isolated TEST checkout controls">
            <button type="button" data-cart-checkout disabled>Continue to TEST checkout</button>
            <button type="button" data-cart-retry hidden>Retry the same TEST checkout</button>
            <p data-cart-checkout-status role="status" tabindex="-1"></p>
          </section>`,
        ),
    });
  });
  const requests: { operationId: string; lines: unknown[] }[] = [];
  let accessAttempts = 0;
  await page.route("**/api/checkout/access", async (route) => {
    accessAttempts++;
    expect(route.request().postData()).toBe("{}");
    await route.fulfill({ json: { ready: true, csrfToken: "A".repeat(43) } });
  });
  await page.route("**/api/checkout", async (route) => {
    expect(route.request().headers()["x-pickup-csrf"]).toBe("A".repeat(43));
    requests.push(route.request().postDataJSON());
    await route.fulfill(
      requests.length === 1
        ? {
            json: {
              terminal: {
                outcome: "released",
                operationId: pending.operationId,
                lines: pending.lines,
              },
            },
          }
        : {
            status: 400,
            json: { error: { message: "Test-only rejection" } },
          },
    );
  });
  await page.goto("/cart?checkout-fixture=test");
  await expect(page.locator("[data-cart-subtotal]")).toHaveText("$14.50");
  const otherTab = await page.context().newPage();
  await otherTab.goto("/goods");
  await otherTab.evaluate(() =>
    localStorage.setItem(
      "true-hive-cart",
      JSON.stringify({
        version: 1,
        lines: [{ variantKey: "cart-test-pair", quantity: 1 }],
      }),
    ),
  );
  await otherTab.close();
  await expect(page.locator("[data-cart-status]")).toContainText(
    "saved cart changed in another tab",
  );
  await expect(page.locator("[data-cart-subtotal]")).toHaveText("$14.50");
  const retry = page.getByRole("button", {
    name: "Retry the same TEST checkout",
    exact: true,
  });
  await expect(retry).toBeEnabled();
  await page.evaluate(() => {
    const original = Storage.prototype.getItem;
    Object.defineProperty(window, "restoreCartStorage", {
      value: () => {
        Storage.prototype.getItem = original;
      },
    });
    Storage.prototype.getItem = function (key) {
      if (key === "true-hive-cart")
        throw new DOMException("Read denied", "SecurityError");
      return original.call(this, key);
    };
  });
  await retry.click();
  await expect(page.locator("[data-cart-checkout-status]")).toContainText(
    "hold was released",
  );
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("true-hive-checkout-pending"),
    ),
  ).toBeNull();
  await expect(page.locator("[data-cart-storage]")).toContainText(
    "latest saved cart could not be read",
  );
  await expect(
    page.getByRole("button", { name: "Clear cart", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => {
    (window as unknown as { restoreCartStorage(): void }).restoreCartStorage();
  });
  await page.getByRole("button", { name: "Refresh cart" }).click();
  await expect(page.locator("[data-cart-subtotal]")).toHaveText("$14.00");
  await expect(
    page.getByRole("button", { name: "Clear cart", exact: true }),
  ).toBeEnabled();
  expect(requests).toEqual([
    { operationId: pending.operationId, lines: pending.lines },
  ]);
  const quantity = page.getByRole("spinbutton", {
    name: "Quantity for Cart test soap Pair",
  });
  await quantity.fill("2");
  await quantity.press("Enter");
  await expect(page.locator("[data-cart-subtotal]")).toHaveText("$28.00");
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("true-hive-cart")!),
    ),
  ).toEqual({
    version: 1,
    lines: [{ variantKey: "cart-test-pair", quantity: 2 }],
  });
  await page
    .getByRole("button", { name: "Continue to TEST checkout", exact: true })
    .click();
  await expect(page.locator("[data-cart-checkout-status]")).toContainText(
    "was rejected",
  );
  expect(requests).toHaveLength(2);
  expect(accessAttempts).toBe(2);
  expect(
    await page.evaluate(() =>
      JSON.stringify({ ...sessionStorage, ...localStorage }),
    ),
  ).not.toContain("A".repeat(43));
  expect(requests[1]!.operationId).not.toBe(pending.operationId);
  expect(requests[1]!.lines).toEqual([
    { variantKey: "cart-test-pair", quantity: 2 },
  ]);
});

test("blocked pending recovery keeps browse-cart editing usable without opening checkout", async ({
  page,
}) => {
  await seed(page, [{ variantKey: "cart-test-bar", quantity: 1 }]);
  await page.addInitScript(() => {
    Object.defineProperty(window, "sessionStorage", {
      get() {
        throw new DOMException("Session storage denied", "SecurityError");
      },
    });
  });
  await page.route("**/api/catalog", (route) =>
    route.fulfill({ json: fixtureCatalog }),
  );
  await page.goto("/cart");
  await expect(page.locator("[data-cart-subtotal]")).toHaveText("$7.25");
  await expect(
    page.getByText(
      /Pending session storage is invalid, changed or unavailable/,
    ),
  ).toBeVisible();
  await page
    .getByRole("spinbutton", { name: "Quantity for Cart test soap Bar" })
    .fill("2");
  await page
    .getByRole("button", { name: "Update quantity", exact: true })
    .click();
  await expect(page.locator("[data-cart-subtotal]")).toHaveText("$14.50");
  await expect(page.locator("[data-cart-checkout]")).toHaveCount(0);
});

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
  await page.getByRole("button", { name: "Refresh cart" }).click();
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
  await page.getByRole("button", { name: "Refresh cart" }).click();
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
      .getByRole("navigation", { name: "Store navigation" })
      .getByRole("link", { name: /Cart/ }),
  ).toBeVisible();
  await expect(page.locator("[data-cart-subtotal]")).toHaveText("$7.25");
  await expect(
    page.getByRole("button", {
      name: "Checkout unavailable",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(page.locator("[data-cart-checkout]")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
