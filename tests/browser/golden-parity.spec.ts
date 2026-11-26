import { expect, test } from "@playwright/test";
import { render, styles } from "../site/barcode-test-helper.ts";

test("the prototype bee helper keeps uncertain identification safe and updates only the chosen advice", async ({
  page,
}) => {
  await page.goto("/services");
  const helper = page.locator("[data-bee-helper]");
  await helper.getByRole("button", { name: /^Not sure/ }).click();
  await expect(helper.getByRole("status")).toContainText("Stay back");
  await expect(helper.getByRole("status").getByRole("link")).toHaveAttribute(
    "href",
    "tel:+14233682262",
  );
  await helper.getByRole("button", { name: /^Smooth/ }).click();
  await expect(helper.getByRole("status")).toContainText("Wasps");
  await expect(helper.getByRole("status")).not.toContainText("Stay back");
  await expect(helper.getByRole("button", { name: /^Smooth/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("quick formats update each real card independently and preserve PDP selection and canonical cart writes", async ({
  page,
}) => {
  const products = ["coconut-milk-delight", "the-true-soap"].map((key) => ({
    key,
    slug: key,
    title: key,
    summary: "Isolated parity fixture",
    category: "soap",
    kind: "active",
    imageKey: "soap",
    details: [],
    variants: [
      {
        key: `${key}-4oz-single`,
        label: "Single 4oz bar",
        priceMinor: 1000,
        currency: "USD",
        stock: { state: "available" },
      },
      {
        key: `${key}-4oz-wolf`,
        label: "Single 1oz Wolf Mold",
        priceMinor: 1250,
        currency: "USD",
        stock: { state: "available" },
      },
      {
        key: `${key}-sold`,
        label: "Unavailable batch",
        priceMinor: 500,
        currency: "USD",
        stock: { state: "out_of_stock" },
      },
      {
        key: `${key}-unknown`,
        label: "Unverified format",
        priceMinor: 1500,
        currency: "USD",
        stock: { state: "unverified" },
      },
    ],
  }));
  await page.route("**/api/catalog", (route) =>
    route.fulfill({ json: { source: "database", products } }),
  );
  let mutations = 0;
  page.on("request", (request) => {
    if (request.method() !== "GET") mutations++;
  });
  let fixtureCss = "";
  await page.route("**/parity-fixture.css", (route) =>
    route.fulfill({ contentType: "text/css", body: fixtureCss }),
  );
  await page.route("**/goods?parity-fixture=cards", async (route) => {
    const response = await route.fetch();
    const cards = await Promise.all(
      products.map((product) =>
        render("src/components/ProductCard.astro", { product }),
      ),
    );
    const gallery = await render("src/components/ProductGallery.astro", {
      product: products[0],
    });
    const form = await render("src/components/AddToCart.astro", {
      product: products[0],
    });
    fixtureCss = [...styles.values()].flat().join("\n");
    const html = (await response.text())
      .replace(
        "</main>",
        `${cards.join("")}<div data-product-detail>${gallery}<span data-detail-price>$10.00</span><span data-detail-format>Single 4oz bar</span>${form}</div></main>`,
      )
      .replace(
        "</head>",
        '<link rel="stylesheet" href="/parity-fixture.css"></head>',
      );
    await route.fulfill({ response, body: html });
  });
  await page.goto("/goods?parity-fixture=cards");
  const first = page
    .locator("[data-catalog-card]")
    .filter({ hasText: "coconut-milk-delight" });
  const second = page
    .locator("[data-catalog-card]")
    .filter({ hasText: "the-true-soap" });
  const detail = page.locator("[data-product-detail]");
  await expect(
    detail.getByRole("spinbutton", { name: "Quantity", exact: true }),
  ).toBeVisible();
  await expect(first.locator("[data-quick-add]")).toBeVisible();
  const unknown = first
    .locator(".format-option")
    .filter({ hasText: "Unverified format" });
  await unknown.locator("input").focus();
  expect(
    await unknown.evaluate((node) => getComputedStyle(node).outlineStyle),
  ).toBe("solid");
  await unknown.click();
  await expect(first.locator(".card-stock")).not.toContainText("In Stock");
  await first
    .locator(".format-option")
    .filter({ hasText: "Single 1oz Wolf Mold" })
    .click();
  await expect(first.locator("[data-card-price]")).toHaveText("$12.50");
  await expect(first.locator("[data-card-image-display] img")).toHaveAttribute(
    "src",
    /soap-delight-wolf/,
  );
  await expect(first.locator("[data-card-link]").first()).toHaveAttribute(
    "href",
    /variant=coconut-milk-delight-4oz-wolf/,
  );
  await expect(second.locator("[data-card-price]")).toHaveText("$10.00");
  await expect(
    first.getByRole("radio", { name: /Unavailable batch/ }),
  ).toBeDisabled();
  await detail
    .getByRole("button", { name: "View Single 1oz Wolf Mold", exact: true })
    .click();
  await expect(
    detail.getByRole("radio", { name: /Single 1oz Wolf Mold/ }),
  ).toBeChecked();
  await expect(detail.locator("[data-detail-price]")).toHaveText("$12.50");
  await expect(detail.locator("[data-gallery-note]")).toContainText(
    "wolf-shaped soap",
  );
  await second
    .locator(".format-option")
    .filter({ hasText: "Single 1oz Wolf Mold" })
    .click();
  await expect(detail.locator("[data-gallery-art] img")).toHaveAttribute(
    "src",
    /soap-delight-wolf/,
  );
  await first.getByRole("button", { name: /Add to Cart/ }).click();
  await expect(first.locator("[data-add-status]")).toContainText(
    "Added to your cart",
  );
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("true-hive-cart")!),
    ),
  ).toEqual({
    version: 1,
    lines: [{ variantKey: "coconut-milk-delight-4oz-wolf", quantity: 1 }],
  });
  expect(mutations).toBe(0);
  await detail.evaluate((node) => node.remove());
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      `active soap cards/${width}/200%`,
    ).toBeLessThanOrEqual(width);
  }
});

test("Golden appearance icons follow Auto OS changes and explicit light/dark choices", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const appearance = page.getByRole("button", { name: /^Appearance:/ });
  await expect(
    appearance.locator("[data-appearance-icon='moon']"),
  ).toBeVisible();
  await expect(appearance.locator("[data-appearance-icon='sun']")).toBeHidden();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(
    appearance.locator("[data-appearance-icon='sun']"),
  ).toBeVisible();
  await appearance.focus();
  await appearance.press("Enter");
  await expect(appearance).toBeFocused();
  await expect(
    appearance.locator("[data-appearance-icon='sun']"),
  ).toBeVisible();
  await appearance.press("Enter");
  await expect(
    appearance.locator("[data-appearance-icon='moon']"),
  ).toBeVisible();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(
    appearance.locator("[data-appearance-icon='moon']"),
  ).toBeVisible();
});

test("Golden public chrome matches the prototype navigation and footer groups", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }).getByRole("link"),
  ).toHaveText(["Home", "Shop Soaps", "Bee Services", "Our Story", "Contact"]);
  await expect(page.locator(".market-mark")).toHaveText("TH");
  for (const heading of ["Shop", "Beekeeping", "US-411 Pickup Spots"]) {
    await expect(
      page
        .locator(".site-footer")
        .getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  }
});

test("Contact matches the prototype's phone-left and draft-right layout without changing submission behavior", async ({
  page,
}) => {
  await page.goto("/contact");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Keep it local. Start a conversation.",
  );
  const layout = page.locator("[data-contact-layout]");
  const phone = layout.locator("[data-contact-phone]");
  const draft = layout.locator("[data-contact-draft]");
  await expect(
    phone.getByRole("link", { name: /Call.*368-2262/ }),
  ).toBeVisible();
  await expect(draft.locator("[data-inquiry-form]")).toBeVisible();
  const left = (await phone.boundingBox())!;
  const right = (await draft.boundingBox())!;
  expect(left.x + left.width).toBeLessThanOrEqual(right.x);
  await draft
    .getByRole("button", { name: "Open email draft", exact: true })
    .click();
  await expect(draft.locator("[data-error='name']")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("the shop exposes prototype collection pills and keeps real server filtering", async ({
  page,
}) => {
  await page.goto("/goods");
  const filters = page.getByRole("navigation", {
    name: "Apothecary collections",
  });
  await expect(filters.getByRole("link", { name: /^All Goods/ })).toBeVisible();
  await filters.getByRole("link", { name: /^In-Stock Soaps/ }).click();
  await expect(page).toHaveURL(/view=in-stock/);
  await expect(page.locator(".shelf-product")).toHaveCount(0);
  await filters.getByRole("link", { name: /^Seasonal Radar/ }).click();
  await expect(page.locator("[data-seasonal-radar]")).toBeVisible();
  await expect(page.locator("[data-seasonal-radar] img")).toHaveCount(0);
  await expect(
    page.locator("[data-seasonal-radar] .shelf-product"),
  ).toHaveCount(3);
  await expect(
    page
      .locator("[data-seasonal-radar]")
      .getByRole("heading", { name: "Seasonal honey", exact: true })
      .getByRole("link"),
  ).toHaveAttribute("href", "/goods/seasonal-honey");
});

test("Golden home retains the prototype's trust strip and shopping-to-pickup-to-apiary order", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: /Compare the Bars/ }),
  ).toHaveAttribute("href", "#goods");
  await expect(page.locator("[data-golden-trust]")).toBeVisible();
  await expect(page.locator("[data-pickup-steps]")).toBeVisible();
  await expect(page.locator(".home-story")).toHaveCount(0);
  const positions = await page
    .locator("#goods, [data-pickup-steps], .home-services")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().top),
    );
  expect(positions.length).toBe(3);
  expect(positions[0]).toBeLessThan(positions[1]!);
  expect(positions[1]).toBeLessThan(positions[2]!);
});

test("Golden About, Services and Cart expose their coordinated prototype layouts", async ({
  page,
}) => {
  await page.goto("/about");
  const about = page.locator("[data-golden-about]");
  await expect(about.getByRole("heading", { level: 1 })).toHaveText(
    "Local roots. Real beeswax. Connected by bees.",
  );
  await expect(
    about.getByRole("link", { name: "Shop the Soaps" }),
  ).toBeVisible();
  const aboutText = (await about.locator(".about-grid > div").boundingBox())!;
  const aboutPhoto = (await about.locator("figure").boundingBox())!;
  expect(aboutText.x + aboutText.width).toBeLessThanOrEqual(aboutPhoto.x);
  await page.goto("/services");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Free honeybee rescue. Research-backed farm pollination.",
  );
  await expect(
    page.locator("#farm-pollination").getByRole("link", { name: /2016 study/ }),
  ).toHaveAttribute("href", "https://doi.org/10.1126/science.aac7287");
  await expect(page.locator("[data-bee-helper]")).toBeVisible();
  await page.goto("/cart");
  await expect(
    page.locator("[data-golden-cart] [data-cart-items-column]"),
  ).toBeVisible();
  await expect(
    page.locator("[data-golden-cart] [data-cart-pickup-column]"),
  ).toBeVisible();
  const items = (await page.locator("[data-cart-items-column]").boundingBox())!;
  const pickup = (await page
    .locator("[data-cart-pickup-column]")
    .boundingBox())!;
  expect(items.x + items.width).toBeLessThanOrEqual(pickup.x);
  await expect(
    page.locator("[data-cart-pickup-column] [data-cart-subtotal]"),
  ).toBeVisible();
});

test("all Golden public pages keep their mobile layout in light and dark appearance", async ({
  page,
}, testInfo) => {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      for (const path of [
        "/",
        "/goods",
        "/goods/everyday-soap",
        "/about",
        "/services",
        "/contact",
        "/cart",
      ]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
          `${path}/${colorScheme}/${width}`,
        ).toBeLessThanOrEqual(width);
        await expect(page.locator(".header-cart")).toBeVisible();
        if (width === 390 && ["/goods", "/contact", "/cart"].includes(path))
          await page.screenshot({
            path: testInfo.outputPath(`${path.slice(1)}-${colorScheme}.png`),
            fullPage: true,
          });
      }
    }
  }
});
