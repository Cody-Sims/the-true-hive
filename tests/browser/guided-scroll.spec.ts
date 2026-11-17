import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const root =
  process.env["GUIDED_SCROLL_URL"] ??
  "http://127.0.0.1:4327/prototypes/guided-scroll/";

test("shared page uses one scrollbar that moves the form and product by the same amount", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${root}?layout=together`);
  await expect(page.getByLabel("Product name", { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("shared-essentials-desktop.png"),
  });
  await page
    .getByRole("navigation", { name: "Editing steps" })
    .getByRole("button", { name: /Variants/ })
    .click();
  const form = page.locator(".workflow");
  const product = page.locator(".desktop-preview");
  const formBefore = await form.boundingBox();
  const productBefore = await product.boundingBox();
  await page.screenshot({ path: testInfo.outputPath("shared-desktop.png") });
  await page.mouse.move(formBefore!.x + 150, 500);
  await page.mouse.wheel(0, 240);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(150);
  const scroll = await page.evaluate(() => window.scrollY);
  const formAfter = await form.boundingBox();
  const productAfter = await product.boundingBox();
  expect(Math.abs(formBefore!.y - formAfter!.y - scroll)).toBeLessThanOrEqual(
    1,
  );
  expect(
    Math.abs(productBefore!.y - productAfter!.y - scroll),
  ).toBeLessThanOrEqual(1);
  expect(
    await page.locator(".step-scroll").evaluate((node) => node.scrollTop),
  ).toBe(0);
  expect(await product.evaluate((node) => node.scrollTop)).toBe(0);
  const beforePreviewWheel = await page.evaluate(() => window.scrollY);
  await page.mouse.move(
    productAfter!.x + 100,
    Math.max(50, productAfter!.y + 150),
  );
  await page.mouse.wheel(0, 200);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(beforePreviewWheel);
  await page.screenshot({
    path: testInfo.outputPath("shared-desktop-scrolled.png"),
  });
});

test("compact preview fits the viewport and wheel over it scrolls only the form", async ({
  page,
}, testInfo) => {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 1280, height: 720 },
    { width: 1024, height: 650 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`${root}?layout=compact`);
    if (viewport.width === 1280) {
      await expect(
        page.getByLabel("Product name", { exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("compact-essentials-1280x720.png"),
      });
    }
    await page
      .getByRole("navigation", { name: "Editing steps" })
      .getByRole("button", { name: /Variants/ })
      .click();
    const preview = page.locator(".desktop-preview");
    const position = await preview.boundingBox();
    expect(position!.y).toBeGreaterThanOrEqual(0);
    expect(position!.y + position!.height).toBeLessThanOrEqual(viewport.height);
    expect(
      (await preview.locator(".customer-card-image img").boundingBox())!.height,
    ).toBeLessThanOrEqual(180);
    expect(
      await preview.evaluate((node) => node.scrollHeight <= node.clientHeight),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(
        `compact-${viewport.width}x${viewport.height}.png`,
      ),
    });
    await preview.hover();
    await page.mouse.wheel(0, 420);
    await expect
      .poll(() =>
        page.locator(".step-scroll").evaluate((node) => node.scrollTop),
      )
      .toBeGreaterThan(100);
    expect(await preview.evaluate((node) => node.scrollTop)).toBe(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect((await preview.boundingBox())!.y).toBe(position!.y);
  }
  await page.locator(".desktop-preview .customer-card-image").focus();
  await page.keyboard.press("Home");
  await expect
    .poll(() => page.locator(".step-scroll").evaluate((node) => node.scrollTop))
    .toBe(0);
  await page.keyboard.press("PageDown");
  await expect
    .poll(() => page.locator(".step-scroll").evaluate((node) => node.scrollTop))
    .toBeGreaterThan(100);
});

test("changing layouts retains the draft and full-page preview scroll stays inside its modal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${root}?layout=together`);
  await page
    .getByLabel("Product name", { exact: true })
    .fill("An edited example candle");
  await page
    .getByRole("button", { name: "02 / Compact preview", exact: true })
    .click();
  await expect(page.getByLabel("Product name", { exact: true })).toHaveValue(
    "An edited example candle",
  );
  await expect(page).toHaveURL(/layout=compact/);
  await page
    .getByRole("navigation", { name: "Editing steps" })
    .getByRole("button", { name: /Variants/ })
    .click();
  await page.locator(".step-scroll").evaluate((node) => {
    node.scrollTop = 300;
  });
  const editorScroll = await page
    .locator(".step-scroll")
    .evaluate((node) => node.scrollTop);
  await page
    .locator(".desktop-preview")
    .getByRole("button", { name: "Open product page preview", exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "Customer preview" });
  await expect(modal.locator(".customer-product h2")).toHaveText(
    "An edited example candle",
  );
  await modal.locator(".preview-stage").hover();
  await page.mouse.wheel(0, 500);
  await expect
    .poll(() =>
      modal.locator(".preview-stage").evaluate((node) => node.scrollTop),
    )
    .toBeGreaterThan(100);
  expect(
    await page.locator(".step-scroll").evaluate((node) => node.scrollTop),
  ).toBe(editorScroll);
  await modal.getByRole("button", { name: "Close preview" }).click();
  const variant = page.locator('[data-variant="demo-1"]');
  await variant
    .getByRole("button", { name: "Archive variant", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Archive variant", exact: true })
    .click();
  await expect(page.locator(".compact-card-meta")).toContainText(
    "1 active format",
  );
  await expect(page.locator(".compact-card-meta")).toContainText("$24.00");
});

for (const layout of ["together", "compact"]) {
  test(`${layout} stays usable on mobile with a pop-out preview and no real writes`, async ({
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
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${root}?layout=${layout}`);
    await page
      .getByLabel("Product name", { exact: true })
      .fill("A mobile example candle");
    const next = page.getByRole("button", { name: "Next step", exact: true });
    const before = await next.boundingBox();
    await next.click();
    await expect(page.locator("[data-step-panel]:visible h2")).toHaveText(
      "Photo & details",
    );
    expect(
      Math.abs((await next.boundingBox())!.y - before!.y),
    ).toBeLessThanOrEqual(1);
    await page
      .getByRole("button", { name: "Previous step", exact: true })
      .click();
    await expect(page.getByLabel("Product name", { exact: true })).toHaveValue(
      "A mobile example candle",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator(".desktop-preview")).toBeHidden();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`${layout}-mobile-390.png`),
    });
    await page.setViewportSize({ width: 320, height: 667 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Preview product", exact: true })
      .click();
    const modal = page.getByRole("dialog", { name: "Customer preview" });
    await modal
      .getByRole("button", { name: "Open product page preview", exact: true })
      .click();
    await expect(modal.locator(".customer-product h2")).toHaveText(
      "A mobile example candle",
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`${layout}-mobile-product-320.png`),
    });
    await modal.getByRole("button", { name: "Close preview" }).click();
    expect(
      await page.evaluate(() => [localStorage.length, sessionStorage.length]),
    ).toEqual([0, 0]);
    expect(unexpected).toEqual([]);
  });
}

test("compact preview contains long titles without growing into a second scroll pane", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${root}?layout=compact`);
  const title = "A deliberately long example candle name "
    .repeat(4)
    .slice(0, 160);
  await page.getByLabel("Product name", { exact: true }).fill(title);
  const preview = page.locator(".desktop-preview");
  const box = await preview.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(720);
  await preview
    .getByRole("button", { name: "Open product page preview", exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "Customer preview" });
  await expect(modal.locator(".customer-product h2")).toHaveText(title);
});
