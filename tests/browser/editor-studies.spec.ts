import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const root =
  process.env["EDITOR_STUDIES_URL"] ??
  "http://127.0.0.1:4327/prototypes/editor/";
const designs = ["workbench", "guided", "variant-desk"];

test("guided gallery slot uses the improved prototype and keeps all three directions together", async ({
  page,
}) => {
  await page.goto(`${root}index.html?design=guided&mode=edit`);
  await expect(
    page.getByRole("button", { name: "01 / Shared page", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "02 / Compact preview", exact: true }),
  ).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  const directions = page.getByRole("combobox", { name: "Editor direction" });
  await expect(directions.locator("option")).toHaveCount(3);
  await expect(directions).toHaveValue("guided");
  await page
    .getByRole("button", { name: "02 / Compact preview", exact: true })
    .click();
  await expect(page.locator(".compact-card")).toBeVisible();
  for (const design of ["workbench", "variant-desk", "guided"]) {
    await page
      .getByRole("combobox", { name: "Editor direction" })
      .selectOption(design);
    await expect(page).toHaveURL(
      new RegExp(
        `/prototypes/editor/index\\.html\\?design=${design}&mode=edit`,
      ),
    );
    await expect(
      page.getByRole("combobox", { name: "Editor direction" }),
    ).toHaveValue(design);
  }
  await expect(
    page.getByRole("button", { name: "01 / Shared page", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Add product", exact: true }).click();
  await expect(page).toHaveURL(/design=guided&mode=new/);
  await expect(page.getByLabel("Product name", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    page.getByRole("combobox", { name: "Editor direction" }),
  ).toHaveValue("guided");
  await page
    .getByLabel("Product name", { exact: true })
    .fill("Keep this unsaved draft");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("combobox", { name: "Editor direction" })
    .selectOption("workbench");
  await expect(
    page.getByRole("combobox", { name: "Editor direction" }),
  ).toHaveValue("guided");
  await expect(page.getByLabel("Product name", { exact: true })).toHaveValue(
    "Keep this unsaved draft",
  );
});

test("guided gallery slot retains the mobile product-page pop-out", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${root}index.html?design=guided&mode=edit&layout=compact`);
  await expect(
    page.getByRole("combobox", { name: "Editor direction" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("guided-gallery-mobile.png"),
  });
  await page
    .getByRole("button", { name: "Preview product", exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "Customer preview" });
  await modal
    .getByRole("button", { name: "Open product page preview", exact: true })
    .click();
  await expect(modal.locator(".customer-product h2")).toHaveText(
    "Amber candle",
  );
  await modal.getByRole("button", { name: "Close preview" }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: testInfo.outputPath("guided-gallery-desktop.png"),
  });
});

test("guided gallery controls wait for their controller before accepting the first click", async ({
  page,
}) => {
  let release!: () => void;
  let requested!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await page.route("**/prototypes/guided-scroll/app.mjs", async (route) => {
    requested();
    await ready;
    await route.continue();
  });
  const navigation = page.goto(`${root}index.html?design=guided&mode=edit`);
  try {
    await started;
    await expect(page.locator("#main")).toHaveJSProperty("inert", true);
    await expect(page.locator(".flow-header")).toHaveJSProperty("inert", true);
    release();
    await navigation;
    await page
      .getByRole("button", { name: "02 / Compact preview", exact: true })
      .click();
    await expect(page.locator(".compact-card")).toBeVisible();
  } finally {
    release();
    await navigation.catch(() => {});
  }
});

test("guided gallery loading failure offers a route back to the three-design comparison", async ({
  page,
}) => {
  await page.route("**/prototypes/guided-scroll/index.html", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto(`${root}index.html?design=guided&mode=edit`);
  await expect(page.getByRole("alert")).toContainText("could not be loaded");
  await expect(
    page.getByRole("link", { name: "Back to all designs" }),
  ).toHaveAttribute("href", "index.html");
});

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
    if (design === "workbench") {
      await expect
        .poll(() =>
          page.evaluate(() => {
            const raw = localStorage.getItem(
              "true-hive:prototype:workbench:v1:edit",
            );
            return raw
              ? JSON.parse(raw).product.variants.some(
                  (v: { id: string }) => v.id === "demo-2",
                )
              : true;
          }),
        )
        .toBe(false);
    } else {
      expect(
        await page.evaluate(() => [localStorage.length, sessionStorage.length]),
      ).toEqual([0, 0]);
    }
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
    if (design === "workbench") await expect(unused).toHaveCount(0);
    else await expect(unused).toBeVisible();
  });

  test(`${design} adds a product, preserves step edits and reflows accessibly`, async ({
    page,
  }, testInfo) => {
    await page.goto(`${root}index.html?design=${design}&mode=new`);
    if (design === "guided")
      await page
        .getByRole("navigation", { name: "Editing steps" })
        .getByRole("button", { name: /Review/ })
        .click();
    await page.getByRole("button", { name: "Publish demo" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Enter a product name",
    );
    if (design === "guided")
      await page
        .getByRole("navigation", { name: "Editing steps" })
        .getByRole("button", { name: /Essentials/ })
        .click();
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
    const variant =
      design !== "variant-desk"
        ? page.locator('[data-variant="demo-1"]')
        : page.getByRole("group", {
            name: "New variant",
            exact: true,
          });
    await variant.getByLabel("Variant name").fill("Example jar");
    await variant.getByLabel(/Price \(USD\)/).fill("12.50");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(
      "Publication is unchanged",
    );
    const publication = page.locator(
      design === "guided" ? "#publication-label" : "[data-save-state]",
    );
    await expect(publication).toContainText("Draft");
    if (design === "guided")
      await page
        .getByRole("navigation", { name: "Editing steps" })
        .getByRole("button", { name: /Review/ })
        .click();
    await page.getByRole("button", { name: "Publish demo" }).click();
    if (design === "workbench")
      await page
        .getByRole("dialog", { name: "Review demo publication" })
        .getByRole("button", { name: "Confirm demo publication", exact: true })
        .click();
    await expect(page.getByRole("status")).toContainText(
      design === "guided"
        ? "real storefront did not change"
        : "real storefront was not changed",
    );
    await expect(publication).toContainText(
      design === "guided" ? "Published" : "Visible",
    );
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
  for (const name of ["Workbench", "Guided editor", "Variant desk"])
    await expect(
      page.getByRole("heading", { name: new RegExp(name) }),
    ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Previous guided refinement" }),
  ).toHaveAttribute("href", "guided-next/index.html");
  await expect(
    page.getByRole("link", { name: /Try shared page/ }),
  ).toHaveAttribute("href", "guided-scroll/index.html?layout=together");
  await expect(
    page.getByRole("link", { name: /Try compact preview/ }),
  ).toHaveAttribute("href", "guided-scroll/index.html?layout=compact");
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
