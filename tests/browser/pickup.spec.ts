import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const root =
  process.env["PICKUP_STUDIES_URL"] ??
  "http://127.0.0.1:4327/prototypes/pickup/";
async function open(page: Page, view = "customer") {
  await page.goto(`${root}index.html?view=${view}`);
  await expect(
    page.getByRole("button", { name: "Customer after checkout", exact: true }),
  ).toBeEnabled();
}
async function book(page: Page) {
  await page.getByRole("button", { name: "6:00 PM", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm demo pickup", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Pickup confirmed.", exact: true }),
  ).toBeVisible();
}
const customerView = (page: Page) =>
  page
    .getByRole("button", { name: "Customer after checkout", exact: true })
    .click();
const operatorView = (page: Page) =>
  page.getByRole("button", { name: "Operator hours", exact: true }).click();

test("pickup connects customer confirmation, operator queue and rescheduling without storage or API writes", async ({
  page,
}) => {
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method()))
      mutations.push(request.url());
  });
  await open(page);
  const storage = await page.evaluate(() =>
    JSON.stringify({ ...localStorage }),
  );
  await book(page);
  await expect(
    page.getByRole("heading", { name: "Pickup confirmed.", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "See operator queue", exact: true })
    .click();
  await expect(page.locator(".queue-row")).toHaveCount(1);
  await expect(page.locator(".queue-row")).toContainText("Main pickup point");
  await customerView(page);
  await page
    .getByRole("button", { name: "Change demo pickup", exact: true })
    .click();
  await page.getByRole("button", { name: /^Town meetup point/ }).click();
  await page.getByRole("button", { name: "2:00 PM", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm new demo time", exact: true })
    .click();
  const receipt = page.getByRole("region", { name: "Demo booking receipt" });
  await expect(receipt).toContainText("Town meetup point");
  await expect(receipt).toContainText("Saturday, December 12");
  await operatorView(page);
  await expect(page.locator(".queue-row")).toHaveCount(1);
  await expect(page.locator(".queue-row")).toContainText("Town meetup point");
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).toBe(
    storage,
  );
  expect(mutations).toEqual([]);
});

test("pickup pending payment and unavailable times do not fabricate bookings or help messages", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("Restart example as").selectOption("pending");
  await expect(
    page.getByText("Payment is still being verified.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm demo pickup", exact: true }),
  ).toBeDisabled();
  await operatorView(page);
  await expect(page.locator(".queue")).toContainText(
    "Payment pending / not ready to schedule.",
  );
  await expect(page.locator(".queue")).not.toContainText("1 paid sample order");
  await page.getByLabel("Restart example as").selectOption("full");
  await expect(
    page.getByText("No times available here.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ask for scheduling help", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("No message was sent.");
  await operatorView(page);
  await expect(page.locator(".queue")).toContainText(
    "Scheduling help requested in this demo.",
  );
  await expect(page.locator(".queue-row")).toHaveCount(0);
});

test("pickup last-slot conflict keeps a customer's previous appointment", async ({
  page,
}) => {
  await open(page);
  await book(page);
  await page
    .getByRole("button", { name: "Change demo pickup", exact: true })
    .click();
  await page.getByRole("button", { name: "6:30 PM", exact: true }).click();
  await page
    .getByRole("button", { name: "Test a slot conflict", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm new demo time", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Your current pickup is unchanged.",
  );
  await page
    .getByRole("button", { name: "Keep current pickup", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Demo booking receipt" }),
  ).toContainText("6:00 PM - 6:30 PM EST");
});

test("pickup operator weekly hours and date overrides change only the selected site", async ({
  page,
}) => {
  await open(page, "operator");
  await page.getByLabel("Tuesday start", { exact: true }).fill("19:00");
  page.once("dialog", (dialog) => dialog.dismiss());
  await customerView(page);
  await expect(page.getByLabel("Tuesday start", { exact: true })).toHaveValue(
    "19:00",
  );
  await page
    .getByRole("button", { name: "Apply demo hours", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Demo availability applied",
  );
  await customerView(page);
  await expect(
    page.getByRole("button", { name: "6:00 PM", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "7:00 PM", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Town meetup point/ }).click();
  await expect(
    page.getByRole("button", { name: "2:00 PM", exact: true }),
  ).toBeVisible();
  await operatorView(page);
  await page.getByLabel("Example date", { exact: true }).fill("2026-12-09");
  await page
    .getByRole("combobox", { name: "Availability", exact: true })
    .selectOption("custom");
  await page.getByLabel("Override start", { exact: true }).fill("16:00");
  await page.getByLabel("Override end", { exact: true }).fill("17:00");
  await page
    .getByRole("button", { name: "Apply date exception", exact: true })
    .click();
  await customerView(page);
  await page.getByRole("button", { name: /^Main pickup point/ }).click();
  await page
    .getByRole("button", {
      name: "Wed 9 Available, Wednesday, December 9, 2026",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "4:00 PM", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "6:00 PM", exact: true }),
  ).toHaveCount(0);
});

test("pickup closure review can be cancelled and applied without erasing an existing appointment", async ({
  page,
}) => {
  await open(page);
  await book(page);
  await operatorView(page);
  await page
    .getByRole("button", { name: "Apply date exception", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Review the affected pickups.",
  });
  await expect(dialog).toContainText("TH-DEMO-1048");
  await dialog
    .getByRole("button", { name: "Keep current hours", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".queue-row")).toContainText(
    "Scheduled / not collected",
  );
  await page
    .getByRole("button", { name: "Apply date exception", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Apply & flag for review", exact: true })
    .click();
  await expect(page.locator(".queue-row")).toContainText(
    "Needs review / original kept",
  );
  await customerView(page);
  await expect(
    page.getByRole("heading", {
      name: "Your pickup needs review.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Demo booking receipt" }),
  ).toContainText("6:00 PM - 6:30 PM EST");
});

test("pickup public plan renders as a draft with connected prototype links", async ({
  page,
}) => {
  await page.goto(new URL("../plan.html?doc=pickup", root).href);
  await expect(
    page.getByRole("heading", {
      name: "Specification: pickup scheduling after checkout",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("#plan-content")).toContainText(
    "production policies not approved",
  );
  await expect(
    page
      .locator("#plan-content")
      .getByRole("link", { name: "Customer prototype", exact: true }),
  ).toHaveAttribute("href", /pickup\/index.html\?view=customer/);
});

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
  { width: 360, height: 740 },
]) {
  test(`pickup customer and operator layouts reflow accessibly at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(viewport);
    for (const view of ["customer", "operator"]) {
      await open(page, view);
      if (view === "customer")
        await page
          .getByRole("button", { name: "6:00 PM", exact: true })
          .click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (view === "operator") {
        for (const input of await page
          .locator('input[type="time"]:enabled')
          .all())
          expect((await input.boundingBox())!.width).toBeGreaterThanOrEqual(
            110,
          );
      }
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`pickup-${view}-${viewport.width}.png`),
        fullPage: true,
      });
    }
    expect(errors).toEqual([]);
  });
}
