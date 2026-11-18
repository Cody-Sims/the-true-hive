import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ javaScriptEnabled: false });

test("global navigation stays focused while shopping links stay in the store", async ({
  page,
}) => {
  for (const path of [
    "/",
    "/services",
    "/about",
    "/contact",
    "/goods",
    "/goods/everyday-soap",
    "/cart",
    "/checkout/return",
  ]) {
    await page.goto(path);
    const header = page.getByRole("navigation", { name: "Main navigation" });
    await expect(header.getByRole("link")).toHaveText([
      "Store",
      "Services",
      "About us",
    ]);
    expect(
      await header
        .getByRole("link")
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href"))),
    ).toEqual(["/goods", "/services", "/about"]);
    const footer = page.getByRole("navigation", { name: "Footer navigation" });
    await expect(footer.getByRole("link")).toHaveText([
      "Contact us",
      "Privacy",
      "Accessibility",
    ]);
    const store = page.getByRole("navigation", { name: "Store navigation" });
    if (
      path === "/goods" ||
      path.startsWith("/goods/") ||
      path === "/cart" ||
      path.startsWith("/checkout/")
    ) {
      await expect(store.getByRole("link", { name: /^Cart/ })).toHaveAttribute(
        "href",
        "/cart",
      );
      await expect(
        header.getByRole("link", { name: "Store", exact: true }),
      ).toHaveAttribute("aria-current", "page");
      const contact = page.getByRole("main").locator('a[href="/contact"]');
      if (path === "/checkout/return")
        await expect(contact).toHaveText("Contact the shop");
      else await expect(contact).toHaveCount(0);
    } else {
      await expect(store).toHaveCount(0);
      await expect(page.locator('a[href="/cart"]')).toHaveCount(0);
    }
  }
});

test("contact navigation opens its own page with a no-JavaScript email fallback", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.locator("#connect, #pickup, [data-inquiry-form]"),
  ).toHaveCount(0);
  const footerNavigation = page.getByRole("navigation", {
    name: "Footer navigation",
  });
  await expect(
    footerNavigation.getByRole("link", { name: "Contact us" }),
  ).toHaveAttribute("href", "/contact");
  await footerNavigation.getByRole("link", { name: "Contact us" }).click();
  await expect(page).toHaveURL(/\/contact$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(
    page
      .getByRole("navigation", { name: "Footer navigation" })
      .getByRole("link", { name: "Contact us" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "http://127.0.0.1:4325/contact",
  );
  const contact = page.locator("#connect");
  await expect(
    contact.getByRole("link", { name: /Call.*368-2262/ }),
  ).toHaveAttribute("href", "tel:+14233682262");
  await expect(contact).not.toContainText(
    /not published|will appear|not open|future beekeeping/i,
  );
  await expect(
    contact.locator('a[href*="facebook.com"],a[href*="instagram.com"]'),
  ).toHaveCount(0);
  await expect(page.locator("[data-inquiry-form]")).toBeHidden();
  await expect(
    contact.getByRole("link", { name: "Email loganstakely18@gmail.com" }),
  ).toHaveAttribute("href", "mailto:loganstakely18@gmail.com");
  for (const path of ["/about", "/services", "/privacy", "/accessibility"]) {
    await page.goto(path);
    await expect(page.locator("[data-inquiry-form]")).toHaveCount(0);
    await expect(
      page.locator(
        'a[href="/#connect"], a[href="/#inquiry"], a[href="/#pickup"]',
      ),
    ).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText(
      /planned paths|future directions|when it's ready|may still be pending|reviewed before public launch|public showcase/i,
    );
  }
});

test("pickup details stay with the store and cart rather than a homepage section", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("main")).not.toContainText("7031 New Highway 68");
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Local pickup", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Store", exact: true })
    .click();
  const pickupLink = page
    .getByRole("navigation", { name: "Store navigation" })
    .getByRole("link", { name: "Pickup", exact: true });
  await expect(pickupLink).toHaveAttribute("href", "/goods#pickup");
  await pickupLink.click();
  await expect(page).toHaveURL(/\/goods#pickup$/);
  await expect(page.locator("#pickup")).toBeVisible();
  for (const path of ["/goods", "/cart"]) {
    await page.goto(path);
    const pickup = page.getByRole("complementary", { name: "Pickup location" });
    await expect(pickup).toHaveCount(1);
    await expect(pickup).toContainText("7031 New Highway 68");
    await expect(pickup).toContainText("Madisonville, TN 37354");
    await expect(pickup).toContainText("wait for confirmation before visiting");
    await expect(pickup).toContainText("not a walk-in shop");
    await expect(page.locator("main")).not.toContainText("Find your direction");
  }
});

test.describe("automated accessibility", () => {
  test.use({ javaScriptEnabled: true });

  test("the full non-shopping public experience passes automated accessibility checks", async ({
    page,
  }) => {
    for (const path of [
      "/",
      "/about",
      "/services",
      "/contact",
      "/privacy",
      "/accessibility",
    ]) {
      await page.goto(path);
      expect(
        (await new AxeBuilder({ page }).analyze()).violations,
        path,
      ).toEqual([]);
    }
  });
});
