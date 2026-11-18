import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const fixtureOrigin = "http://127.0.0.1:4327";
const preview = `${fixtureOrigin}/prototypes/team-sprint/index.html`;

const cards = [
  [
    "Make shopping guidance consistent",
    "Website & office",
    "Ready",
    /collection/i,
  ],
  ["Verify soap format details", "Hands-on", "Ready", /net weight/i],
  [
    "Check which products are ready for review",
    "Hands-on",
    "Ready",
    /future concept/i,
  ],
  ["Take real product photos", "Hands-on", "Ready", /approved sample/i],
  [
    "Update the soap listings",
    "Website & office",
    "Waiting",
    /verified weights/i,
  ],
  [
    "Write simple pickup instructions",
    "Website & office",
    "Waiting",
    /staffed pickup/i,
  ],
] as const;

test("each sprint card opens its own details and returns keyboard focus when closed", async ({
  page,
}) => {
  await page.goto(preview);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  for (const [title, owner, status, step] of cards) {
    const trigger = page.getByRole("button", { name: title, exact: true });
    await trigger.press("Enter", { timeout: 2500 });

    const detail = page.getByRole("dialog", { name: title, exact: true });
    await expect(detail).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(
      detail.getByText(`${owner} · ${status}`, { exact: true }),
    ).toBeVisible();
    await expect(
      detail.getByRole("heading", { name: "Checklist" }),
    ).toBeVisible();
    await expect(
      detail.getByRole("listitem").filter({ hasText: step }),
    ).toBeVisible();
    await expect(
      detail.getByRole("heading", { name: "Handoff" }),
    ).toBeVisible();
    await expect(
      detail.getByRole("heading", { name: "Done when" }),
    ).toBeVisible();

    const close = detail.getByRole("button", { name: "Close", exact: true });
    await expect(close).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(detail).not.toBeVisible();
    await expect(trigger).toBeFocused();
  }
});

test("a waiting card's details can be read and dismissed by touch on a small screen", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 320, height: 480 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    await page.goto(preview);
    const title = "Write simple pickup instructions";
    await page
      .getByText("After the arrival walkthrough and schedule review", {
        exact: false,
      })
      .tap({ timeout: 2500 });

    const detail = page.getByRole("dialog", { name: title, exact: true });
    await expect(detail).toBeVisible();
    const box = await detail.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    await detail
      .getByRole("heading", { name: "Done when" })
      .scrollIntoViewIfNeeded();
    await expect(
      detail.getByRole("heading", { name: "Done when" }),
    ).toBeInViewport();

    const close = detail.getByRole("button", { name: "Close", exact: true });
    await expect(close).toBeInViewport();
    await close.tap();
    await expect(detail).not.toBeVisible();
  } finally {
    await context.close();
  }
});

test("the main-site sprint board is available by direct link and supports keyboard review", async ({
  page,
}) => {
  const response = await page.goto(`${fixtureOrigin}/team-sprint`);
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Team sprint board" }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: /sprint/i }),
  ).toHaveCount(0);

  const title = "Verify soap format details";
  const card = page.locator("summary").filter({ hasText: title });
  await card.press("Enter");
  const detail = page.getByRole("dialog", { name: title, exact: true });
  await expect(
    detail.getByRole("heading", { name: "Checklist" }),
  ).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Handoff" })).toBeVisible();
  await expect(
    detail.getByRole("heading", { name: "Done when" }),
  ).toBeVisible();
  await expect(
    detail.getByRole("button", { name: "Close", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(detail).not.toBeVisible();
  await expect(card).toBeFocused();
});

test("the main-site board and an open detail fit a narrow phone with touch controls", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: fixtureOrigin,
    viewport: { width: 320, height: 480 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    await page.goto("/team-sprint");
    const status = page.getByRole("navigation", { name: "Sprint status" });
    await status.getByRole("link", { name: /waiting/i }).tap();
    await expect(page).toHaveURL(/#waiting$/);
    await expect(
      page.getByRole("heading", { name: "Waiting", exact: true }),
    ).toBeInViewport();

    const title = "Write simple pickup instructions";
    await page.locator("summary").filter({ hasText: title }).tap();
    const detail = page.getByRole("dialog", { name: title, exact: true });
    await expect(detail).toBeVisible();
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(scan.violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
    const box = await detail.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    const done = detail.getByRole("heading", { name: "Done when" });
    await done.scrollIntoViewIfNeeded();
    await expect(done).toBeInViewport();
    const close = detail.getByRole("button", { name: "Close", exact: true });
    await expect(close).toBeInViewport();
    await close.tap();
    await expect(detail).not.toBeVisible();
  } finally {
    await context.close();
  }
});

test("main-site task details remain readable when JavaScript is unavailable", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: fixtureOrigin,
    javaScriptEnabled: false,
  });
  try {
    const page = await context.newPage();
    await page.goto("/team-sprint");
    const summary = page
      .locator("summary")
      .filter({ hasText: "Verify soap format details" });
    const card = page.locator("details").filter({ has: summary });
    const checklist = card.getByRole("heading", { name: "Checklist" });
    await expect(checklist).not.toBeVisible();
    await summary.click();
    await expect(checklist).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } finally {
    await context.close();
  }
});
