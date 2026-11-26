import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("the production theme follows the OS and preserves explicit appearance across public pages", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute(
    "data-site-design",
    "golden-apothecary",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-color-mode",
    "system",
  );
  expect(
    await page
      .locator("body")
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe("rgb(17, 18, 16)");
  const appearance = page.getByRole("button", { name: /^Appearance:/ });
  await appearance.focus();
  await appearance.press("Enter");
  await expect(page.locator("html")).toHaveAttribute(
    "data-color-mode",
    "light",
  );
  await expect(appearance).toBeFocused();
  await appearance.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-color-mode", "dark");
  for (const path of [
    "/goods",
    "/goods/everyday-soap",
    "/services",
    "/about",
    "/contact",
    "/cart",
  ]) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute(
      "data-color-mode",
      "dark",
    );
    expect(
      await page
        .locator("body")
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    ).toBe("rgb(17, 18, 16)");
    await expect(page.locator(".header-cart")).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations, path).toEqual(
      [],
    );
  }
});

test("production mobile navigation keeps cart access and keyboard focus without overlapping enlarged text", async ({
  page,
}) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const menu = page.getByRole("button", { name: "Menu", exact: true });
    const panel = page.locator("#site-header-panel");
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();
    await expect(page.locator(".header-cart")).toBeVisible();
    await menu.focus();
    await menu.press("Enter");
    await menu.press("Tab");
    await expect(
      panel.getByRole("link", { name: "Store", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeFocused();
    await expect(panel).toBeHidden();
    await menu.click();
    await panel.getByRole("link", { name: "Store", exact: true }).click();
    await expect(page).toHaveURL(/\/goods$/);
    await expect(panel).toBeHidden();
    await menu.click();
    await page.getByRole("heading", { level: 1 }).click();
    await expect(panel).toBeHidden();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    expect(
      await page
        .locator(".site-header-frame")
        .evaluate((element) => element.scrollWidth),
    ).toBeLessThanOrEqual(width);
    const brand = (await page.locator(".brand-name").boundingBox())!;
    const button = (await menu.boundingBox())!;
    expect(
      brand.y + brand.height <= button.y || brand.x + brand.width <= button.x,
    ).toBe(true);
    await menu.click();
    const appearance = panel.getByRole("button", { name: /^Appearance:/ });
    await appearance.focus();
    await appearance.press("Enter");
    await expect(appearance).toBeFocused();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    expect(
      (await new AxeBuilder({ page }).include(".site-header-frame").analyze())
        .violations,
    ).toEqual([]);
  }
});

test("the production homepage puts product imagery first and services and FAQs below shopping", async ({
  page,
}) => {
  await page.goto("/");
  const hero = page.locator(".home-hero");
  await expect(hero.locator("img").first()).toHaveAttribute("alt", /soap/i);
  await expect(hero.getByRole("img", { name: /Honeybees/ })).toHaveCount(0);
  await expect(hero).not.toContainText(/In stock|From \$10/i);
  const services = page.locator(".home-services");
  await expect(services.getByRole("img", { name: /Honeybees/ })).toHaveCount(1);
  await expect(services).toContainText("Colony Rescue");
  await expect(services).toContainText("Farm Pollination");
  const order = await page
    .locator("main section")
    .evaluateAll((sections) =>
      sections.map((section) => section.id || section.className),
    );
  expect(
    order.findIndex((value) => value.includes("home-services")),
  ).toBeGreaterThan(order.indexOf("goods"));
  const faq = page.getByRole("region", { name: "Commonly asked questions" });
  await expect(faq.locator("details")).toHaveCount(5);
  const disclosure = faq
    .locator("details")
    .filter({ hasText: /AI styling reference/ });
  await disclosure.locator("summary").focus();
  await disclosure.locator("summary").press("Enter");
  await expect(disclosure.locator("p")).toBeVisible();
  expect(await page.locator('script[src*="/prototypes/"]').count()).toBe(0);
});

test("public navigation and appearance remain usable without browser storage", async ({
  page,
}) => {
  await page.addInitScript(() => {
    for (const name of ["getItem", "setItem"]) {
      Object.defineProperty(Storage.prototype, name, {
        value() {
          throw new DOMException("Storage blocked", "SecurityError");
        },
      });
    }
  });
  await page.goto("/");
  const appearance = page.getByRole("button", { name: /^Appearance:/ });
  await appearance.click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-color-mode",
    "light",
  );
  await expect(appearance).toBeVisible();
});

test("the public shell degrades safely without JavaScript or a verified catalog", async ({
  browser,
  page,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
    colorScheme: "dark",
  });
  try {
    const noJs = await context.newPage();
    await noJs.goto("http://127.0.0.1:4325/");
    await expect(
      noJs.getByRole("navigation", { name: "Main navigation" }),
    ).toBeVisible();
    await expect(noJs.locator(".header-cart")).toBeVisible();
    await expect(
      noJs.getByRole("button", { name: "Menu", exact: true }),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
  const response = await page.goto("http://127.0.0.1:4326/");
  expect(response?.status()).toBe(503);
  await expect(page.getByRole("main")).toContainText(
    "The collection is temporarily unavailable.",
  );
  await expect(page.locator(".home-hero")).not.toContainText(/In stock|\$\d/);
  await expect(page.locator(".home-hero a[href*='variant=']")).toHaveCount(0);
});
