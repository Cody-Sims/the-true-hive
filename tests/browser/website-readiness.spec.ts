import { test, expect } from "@playwright/test";

test.use({ javaScriptEnabled: false });

test("skip navigation transfers actual keyboard focus into the main content", async ({
  page,
}) => {
  await page.goto("/goods");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
});

test("accessibility guidance is reachable without a new contact collection workflow", async ({
  page,
}) => {
  const response = await page.goto("/accessibility");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /accessibility/i,
  );
  await expect(page.getByText(/WCAG 2\.2 AA/)).toBeVisible();
  await expect(page.getByText(/not.*certification/i)).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("link", { name: /contact channels/i }),
  ).toHaveAttribute("href", "/contact");
  expect(await page.locator("form").count()).toBe(0);
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Footer navigation" })
    .getByRole("link", { name: "Accessibility", exact: true })
    .click();
  await expect(page).toHaveURL(/\/accessibility$/);
});

test("privacy guidance explains the actual URL-based collection search", async ({
  page,
}) => {
  await page.goto("/privacy");
  await expect(
    page.getByRole("heading", { name: /collection search/i }),
  ).toBeVisible();
  await expect(page.getByText(/browser history/i)).toBeVisible();
  await expect(page.getByText(/avoid.*sensitive information/i)).toBeVisible();
  expect(await page.locator('input[type="email"],form').count()).toBe(0);
});

test("search and error responses are not presented as canonical indexable pages", async ({
  page,
}) => {
  for (const [url, status] of [
    ["/goods?q=soap", 200],
    ["/goods?category=unrecognized", 400],
    ["http://127.0.0.1:4326/goods", 503],
  ] as const) {
    const response = await page.goto(url);
    expect(response?.status()).toBe(status);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, follow",
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  }
});

test("a genuinely missing page offers stable recovery routes without a redirect", async ({
  page,
}) => {
  const response = await page.goto("/not-a-published-page");
  expect(response?.status()).toBe(404);
  await expect(page).toHaveURL(/\/not-a-published-page$/);
  const main = page.getByRole("main");
  await expect(
    main.getByRole("link", { name: "Back home", exact: true }),
  ).toHaveAttribute("href", "/");
  await expect(
    main.getByRole("link", { name: "Explore the goods", exact: true }),
  ).toHaveAttribute("href", "/goods");
  await expect(
    main.getByRole("link", { name: "Beekeeping", exact: true }),
  ).toHaveAttribute("href", "/services");
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});
