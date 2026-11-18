import { expect, test } from "@playwright/test";

const preview = new URL(
  "../../dist/prototypes/team-sprint/index.html",
  import.meta.url,
).href;

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
