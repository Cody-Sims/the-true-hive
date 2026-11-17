import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const root =
  process.env["EDITOR_STUDIES_URL"] ??
  "http://127.0.0.1:4327/prototypes/editor/";
const designs = ["workbench", "guided", "variant-desk"];

for (const design of designs) {
  test(`${design} clearly archives, restores and safely deletes variants without real writes`, async ({
    page,
  }) => {
    const unexpected: string[] = [];
    page.on("pageerror", (error) => unexpected.push(error.message));
    page.on("request", (request) => {
      if (
        request.method() !== "GET" ||
        new URL(request.url()).origin !== new URL(root).origin ||
        new URL(request.url()).pathname.startsWith("/api/")
      )
        unexpected.push(`${request.method()} ${request.url()}`);
    });
    await page.goto(`${root}index.html?design=${design}&mode=edit`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Edit your product.",
    );
    if (design === "guided")
      await page
        .getByRole("navigation", { name: "Editing steps" })
        .getByRole("button", { name: /Variants/ })
        .click();
    const stocked = page.getByRole("group", {
      name: "Amber / 8 oz",
      exact: true,
    });
    await stocked
      .getByRole("button", { name: "Archive variant", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel" })
      .click();
    await expect(stocked.locator(".status")).toHaveText("Active");
    await stocked
      .getByRole("button", { name: "Delete variant", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("Stock or history");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Archive variant instead" })
      .click();
    await expect(stocked.locator(".status")).toHaveText("Archived");
    await expect(stocked).toContainText("8");
    await expect(stocked).toContainText("history retained");
    await stocked
      .getByRole("button", { name: "Restore variant", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Restore variant", exact: true })
      .click();
    await expect(stocked.locator(".status")).toHaveText("Active");
    if (design === "variant-desk")
      await page
        .getByRole("navigation", { name: "Choose a variant" })
        .getByRole("button", { name: /Amber \/ 12 oz/ })
        .click();
    const unused = page.getByRole("group", {
      name: "Amber / 12 oz",
      exact: true,
    });
    await unused
      .getByRole("button", { name: "Delete variant", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete variant", exact: true })
      .click();
    await expect(unused).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText(
      "Variant deleted in this demo",
    );
    await stocked
      .getByRole("button", { name: "Archive variant", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "last active priced variant",
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Keep variant" })
      .click();
    await expect(stocked.locator(".status")).toHaveText("Active");
    expect(
      await page.evaluate(() => [localStorage.length, sessionStorage.length]),
    ).toEqual([0, 0]);
    expect(unexpected).toEqual([]);
    await page.reload();
    if (design === "guided")
      await page
        .getByRole("navigation", { name: "Editing steps" })
        .getByRole("button", { name: /Variants/ })
        .click();
    if (design === "variant-desk")
      await page
        .getByRole("navigation", { name: "Choose a variant" })
        .getByRole("button", { name: /Amber \/ 12 oz/ })
        .click();
    await expect(unused).toBeVisible();
  });

  test(`${design} adds a product, preserves step edits and reflows accessibly`, async ({
    page,
  }, testInfo) => {
    await page.goto(`${root}index.html?design=${design}&mode=new`);
    await page.getByRole("button", { name: "Publish demo" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Enter a product name",
    );
    await page
      .getByLabel("Product name", { exact: true })
      .fill("An example honey jar");
    await page
      .getByLabel("Short description")
      .fill("Fictional description for the design review.");
    await page.getByLabel("Category", { exact: true }).selectOption("honey");
    if (design === "guided")
      await page
        .getByRole("navigation", { name: "Editing steps" })
        .getByRole("button", { name: /Variants/ })
        .click();
    const variant = page.getByRole("group", {
      name: "New variant",
      exact: true,
    });
    await variant.getByLabel("Variant name").fill("Example jar");
    await variant.getByLabel(/Price \(USD\)/).fill("12.50");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(
      "Publication is unchanged",
    );
    await expect(page.locator("[data-save-state]")).toContainText("Draft");
    await page.getByRole("button", { name: "Publish demo" }).click();
    await expect(page.getByRole("status")).toContainText(
      "real storefront was not changed",
    );
    await expect(page.locator("[data-save-state]")).toContainText("Visible");
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize({ width: 320, height: 1000 });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`${design}-new-mobile.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.screenshot({
      path: testInfo.outputPath(`${design}-new-desktop.png`),
      fullPage: true,
    });
    if (design === "guided")
      await page
        .getByRole("navigation", { name: "Editing steps" })
        .getByRole("button", { name: /Essentials/ })
        .click();
    await expect(page.getByLabel("Product name", { exact: true })).toHaveValue(
      "An example honey jar",
    );
    await expect(page.getByLabel("Short description")).toHaveValue(
      "Fictional description for the design review.",
    );
  });
}

test("the current preview landing prioritizes editor studies and moves old galleries into an archive", async ({
  page,
}) => {
  await page.goto(new URL("../index.html", root).href);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Less form.",
  );
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(4);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page
    .getByRole("navigation", { name: "Review navigation" })
    .getByRole("link", { name: /Older studies/ })
    .click();
  await expect(
    page.getByRole("link", { name: "Review the storefront archive" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "five product-page studies" }),
  ).toBeVisible();
});

test("photo selection stays local and switching away warns about unsaved edits", async ({
  page,
}) => {
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") mutations.push(request.url());
  });
  await page.goto(`${root}index.html?design=workbench&mode=new`);
  await page.getByLabel("Choose a local photo").setInputFiles({
    name: "example.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPd8AAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.getByRole("status")).toContainText("file was not uploaded");
  await expect(
    page
      .getByRole("complementary", { name: "Storefront preview" })
      .locator("img"),
  ).toHaveAttribute("src", /^blob:/);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("combobox", { name: "Editor direction" })
    .selectOption("guided");
  await expect(
    page.getByRole("combobox", { name: "Editor direction" }),
  ).toHaveValue("workbench");
  await expect(page).toHaveURL(/design=workbench/);
  expect(mutations).toEqual([]);
});
