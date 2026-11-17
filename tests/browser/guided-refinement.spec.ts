import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const root =
  process.env["GUIDED_REFINEMENT_URL"] ??
  "http://127.0.0.1:4327/prototypes/guided-next/";

test("mobile Previous and Next stay anchored while steps and scroll positions change", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(root);
  const next = page.getByRole("button", { name: "Next step", exact: true });
  const previous = page.getByRole("button", {
    name: "Previous step",
    exact: true,
  });
  await expect(next).toBeVisible();
  const anchor = await next.boundingBox();
  const prevAnchor = await previous.boundingBox();
  await page
    .getByLabel("Product name", { exact: true })
    .fill("A candle with a longer example name");
  await page.locator(".step-scroll").evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  const scroll = await page
    .locator(".step-scroll")
    .evaluate((node) => node.scrollTop);
  for (const title of ["Photo & details", "Variants", "Review your product"]) {
    await next.click();
    await expect(
      page.locator("[data-step-panel]:visible h2").first(),
    ).toHaveText(title);
    const position = await next.boundingBox();
    expect(Math.abs(position!.y - anchor!.y)).toBeLessThanOrEqual(1);
    expect(
      Math.abs((await previous.boundingBox())!.y - prevAnchor!.y),
    ).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(position!.y + position!.height).toBeLessThanOrEqual(844);
  }
  await previous.click();
  await previous.click();
  await previous.click();
  await expect(page.getByLabel("Product name", { exact: true })).toHaveValue(
    "A candle with a longer example name",
  );
  expect(
    await page.locator(".step-scroll").evaluate((node) => node.scrollTop),
  ).toBe(scroll);
  await page.screenshot({
    path: testInfo.outputPath("guided-refined-mobile-editor.png"),
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: testInfo.outputPath("guided-refined-desktop-editor.png"),
  });
});

test("a new draft keeps edits across steps and can be previewed and published only in memory", async ({
  page,
}) => {
  await page.goto(`${root}?mode=new`);
  await page
    .getByLabel("Product name", { exact: true })
    .fill("An example honey jar");
  await page
    .getByLabel("Short description")
    .fill("A fictional description, not a real product.");
  await page.getByLabel("Category", { exact: true }).selectOption("honey");
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await page.getByLabel("Ingredients or materials").fill("Example ingredient");
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await page
    .locator('[data-variant="demo-1"]')
    .getByLabel("Variant name")
    .fill("Example jar");
  await page
    .locator('[data-variant="demo-1"]')
    .getByLabel(/Price \(USD\)/)
    .fill("12.50");
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Publication is unchanged",
  );
  await expect(page.locator("#publication-label")).toContainText("Draft");
  await page.getByRole("button", { name: "Publish demo", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "real storefront did not change",
  );
  await page
    .getByRole("button", { name: "Preview product", exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "Customer preview" });
  await modal
    .getByRole("button", { name: "Open product page preview", exact: true })
    .click();
  await expect(modal.locator(".customer-product h2")).toHaveText(
    "An example honey jar",
  );
  await expect(modal.locator("[data-customer-price]")).toHaveText("$12.50");
  await expect(modal).toContainText("Example ingredient");
});

test("variant archival changes both preview views without erasing its history", async ({
  page,
}) => {
  await page.goto(root);
  await page
    .getByRole("navigation", { name: "Editing steps" })
    .getByRole("button", { name: /Variants/ })
    .click();
  const variant = page.locator('[data-variant="demo-1"]');
  await variant
    .getByRole("button", { name: "Delete variant", exact: true })
    .click();
  const action = page.getByRole("dialog", {
    name: "Keep this variant's records.",
  });
  await action
    .getByRole("button", { name: "Archive variant instead", exact: true })
    .click();
  await expect(variant.locator(".status")).toHaveText("Archived");
  await expect(variant).toContainText("Demo history retained");
  await page
    .getByRole("button", { name: "Preview product", exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "Customer preview" });
  await expect(modal.locator(".customer-formats")).not.toContainText(
    "Amber / 8 oz",
  );
  await modal
    .getByRole("button", { name: "Open product page preview", exact: true })
    .click();
  await expect(modal.getByRole("radio")).toHaveCount(1);
  await modal.getByRole("button", { name: "Close preview" }).click();
  await variant
    .getByRole("button", { name: "Restore variant", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Restore variant", exact: true })
    .click();
  await expect(variant.locator(".status")).toHaveText("Active");
});

test("mobile preview is a modal that opens the card's product page and returns without losing editing context", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(root);
  await expect(page.locator(".desktop-preview")).toBeHidden();
  const preview = page.getByRole("button", {
    name: "Preview product",
    exact: true,
  });
  const before = await preview.boundingBox();
  await preview.click();
  const modal = page.getByRole("dialog", { name: "Customer preview" });
  await expect(modal).toBeVisible();
  await modal
    .getByRole("button", { name: "Open product page preview", exact: true })
    .click();
  await expect(modal.locator(".customer-product h2")).toHaveText(
    "Amber candle",
  );
  await expect(modal.getByRole("radio")).toHaveCount(2);
  await modal.getByRole("radio", { name: /Amber \/ 12 oz/ }).check();
  await expect(modal.locator("[data-customer-price]")).toHaveText("$24.00");
  await expect(
    modal.getByRole("button", { name: "Add to cart" }),
  ).toBeDisabled();
  await expect(modal).not.toContainText("Earlier tin");
  await modal.getByRole("button", { name: "Back to card" }).click();
  await expect(modal.locator(".customer-card")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).not.toBeVisible();
  await expect(preview).toBeFocused();
  expect(await preview.boundingBox()).toEqual(before);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("desktop preview reflects current text, photo, ingredients and format changes on a fuller page", async ({
  page,
}) => {
  await page.goto(root);
  await page
    .getByLabel("Product name", { exact: true })
    .fill("Example <b>candle</b>");
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await page
    .getByLabel("Product details", { exact: true })
    .fill("Care: a fictional example.\nSize: example only.");
  await page
    .getByLabel("Ingredients or materials")
    .fill("Example wax\nExample cotton wick");
  await page.getByLabel("Choose a local photo").setInputFiles({
    name: "example.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPd8AAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await page
    .locator('[data-variant="demo-2"]')
    .getByLabel(/Price \(USD\)/)
    .fill("26.50");
  await page
    .locator(".desktop-preview")
    .getByRole("button", { name: "Open product page preview", exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "Customer preview" });
  await expect(modal.locator(".customer-product h2")).toHaveText(
    "Example <b>candle</b>",
  );
  await expect(modal.locator(".customer-hero img")).toHaveAttribute(
    "src",
    /^blob:/,
  );
  await expect(modal).toContainText("Example cotton wick");
  await expect(modal).toContainText("Care: a fictional example.");
  await modal.getByRole("radio", { name: /Amber \/ 12 oz/ }).check();
  await expect(modal.locator("[data-customer-price]")).toHaveText("$26.50");
  expect(await modal.locator("b").count()).toBe(0);
  await modal.getByRole("button", { name: "Close preview" }).click();
  await page
    .getByRole("button", { name: "Previous step", exact: true })
    .click();
  expect(
    await page
      .getByLabel("Choose a local photo")
      .evaluate((node: HTMLInputElement) => node.files?.[0]?.name),
  ).toBe("example.png");
});

test("refined flow remains accessible on small screens and never writes to inventory or storage", async ({
  page,
}, testInfo) => {
  const unexpected: string[] = [];
  page.on("pageerror", (error) => unexpected.push(error.message));
  page.on("request", (request) => {
    if (
      request.method() !== "GET" ||
      new URL(request.url()).origin !== new URL(root).origin ||
      new URL(request.url()).pathname.startsWith("/api/")
    )
      unexpected.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 667 });
  await page.goto(root);
  for (let index = 0; index < 4; index++) {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    if (index < 3)
      await page
        .getByRole("button", { name: "Next step", exact: true })
        .click();
  }
  await page
    .getByRole("button", { name: "Preview product", exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "Customer preview" });
  await modal
    .getByRole("button", { name: "Open product page preview", exact: true })
    .click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("guided-refined-mobile-product.png"),
    fullPage: true,
  });
  await modal.getByRole("button", { name: "Close preview" }).click();
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
  expect(unexpected).toEqual([]);
});
