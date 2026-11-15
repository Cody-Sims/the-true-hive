import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ javaScriptEnabled: false });

test("non-shopping pages have working contact navigation without placeholder channels", async ({
  page,
}) => {
  await page.goto("/");
  const contact = page.locator("#connect");
  await expect(
    contact.getByRole("link", { name: /Call.*368-2262/ }),
  ).toHaveAttribute("href", "tel:+14233682262");
  await expect(contact).not.toContainText(
    /not published|will appear|not open|future beekeeping/i,
  );
  await expect(
    contact.locator(
      'a[href*="facebook.com"],a[href*="instagram.com"],a[href^="mailto:"]',
    ),
  ).toHaveCount(0);
  await expect(page.locator("form")).toHaveCount(0);
  for (const path of ["/about", "/privacy", "/accessibility"]) {
    await page.goto(path);
    await expect(page.locator("main")).not.toContainText(
      /planned paths|future directions|when it's ready|may still be pending|reviewed before public launch|public showcase/i,
    );
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
