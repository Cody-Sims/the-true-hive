import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const root =
  process.env["EDITOR_STUDIES_URL"] ??
  "http://127.0.0.1:4327/prototypes/editor/";
const key = (mode = "edit") => `true-hive:prototype:workbench:v1:${mode}`;
const url = (mode = "edit") =>
  `${root}index.html?design=workbench&mode=${mode}`;

test("archived Workbench products cannot publish through review or a forged dialog confirmation", async ({
  page,
}) => {
  await page.goto(url());
  await page.locator(".product-actions summary").click();
  await page
    .getByRole("button", { name: "Archive product", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Archive product", exact: true })
    .click();
  await expect(page.locator("[data-save-state]")).toHaveText(
    "Archived in demo",
  );
  await page.getByRole("button", { name: "Review publication" }).click();
  const disabled = await page
    .getByRole("button", { name: "Confirm demo publication" })
    .isDisabled();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const dialog =
          document.querySelector<HTMLDialogElement>("#publish-review")!;
        dialog.addEventListener("close", () => resolve(), { once: true });
        dialog.close("confirm");
      }),
  );
  await expect(page.locator("[data-save-state]")).toHaveText(
    "Archived in demo",
  );
  expect(disabled).toBe(true);
  await page
    .getByRole("button", { name: "Restore product to draft", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Restore to draft", exact: true })
    .click();
  await expect(page.locator("[data-save-state]")).toHaveText(
    "Draft / not on storefront",
  );
  await page.getByRole("button", { name: "Review publication" }).click();
  await page.getByRole("button", { name: "Confirm demo publication" }).click();
  await expect(page.locator("[data-save-state]")).toHaveText(
    "Visible in this demo",
  );
});

test("Workbench autosaves incomplete text and variants, restores on reload and isolates Add/Edit drafts", async ({
  page,
}) => {
  await page.goto(url("new"));
  await page
    .getByLabel("Product name", { exact: true })
    .fill("A locally saved example");
  await page.getByLabel("Short description").fill("An unfinished description.");
  await expect
    .poll(() => page.evaluate((k) => localStorage.getItem(k), key("new")))
    .not.toBeNull();
  await page.reload();
  await expect(page.getByLabel("Product name", { exact: true })).toHaveValue(
    "A locally saved example",
  );
  await expect(page.locator("#draft-state")).toContainText("restored");
  await page
    .locator('[data-variant="demo-1"]')
    .getByLabel("Variant name")
    .fill("Example size");
  await page
    .locator('[data-variant="demo-1"]')
    .getByLabel(/Price \(USD\)/)
    .fill("12.");
  await expect
    .poll(() =>
      page.evaluate(
        (k) => JSON.parse(localStorage.getItem(k)!).product.variants[0].price,
        key("new"),
      ),
    )
    .toBe("12.");
  await page.reload();
  await expect(
    page.locator('[data-variant="demo-1"]').getByLabel(/Price \(USD\)/),
  ).toHaveValue("12.");
  await page.goto(url());
  await expect(page.getByLabel("Product name", { exact: true })).toHaveValue(
    "Amber candle",
  );
  expect(await page.evaluate((k) => localStorage.getItem(k), key())).toBeNull();
});

test("Workbench scrolls the whole page with the form and product moving together", async ({
  page,
}, testInfo) => {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 1280, height: 720 },
    { width: 1024, height: 650 },
    { width: 1440, height: 500 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(url());
    await expect(page.locator("#direction")).toBeEnabled();
    const rail = page.getByRole("complementary", {
      name: "Storefront preview",
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(
      await rail.evaluate((node) => node.scrollHeight <= node.clientHeight),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(
        `workbench-page-${viewport.width}x${viewport.height}.png`,
      ),
      fullPage: true,
    });
    await rail.hover();
    const before = await page.evaluate(() => ({
      y: scrollY,
      form: document.querySelector(".bench-pane")!.getBoundingClientRect().top,
      product: document.querySelector(".bench-preview")!.getBoundingClientRect()
        .top,
    }));
    await page.evaluate(() => {
      document.documentElement.dataset["scrolling"] = "true";
      document.addEventListener(
        "scrollend",
        () => {
          document.documentElement.dataset["scrolling"] = "false";
        },
        { once: true },
      );
    });
    await page.mouse.wheel(0, 350);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(before.y + 100);
    await expect(page.locator("html")).toHaveAttribute(
      "data-scrolling",
      "false",
    );
    const after = await page.evaluate(() => ({
      y: scrollY,
      form: document.querySelector(".bench-pane")!.getBoundingClientRect().top,
      product: document.querySelector(".bench-preview")!.getBoundingClientRect()
        .top,
    }));
    expect(after.form - before.form).toBeCloseTo(-(after.y - before.y), 0);
    expect(after.product - before.product).toBeCloseTo(
      -(after.y - before.y),
      0,
    );
    expect(
      await page
        .locator(".bench-form-scroll")
        .evaluate((node) => node.scrollTop),
    ).toBe(0);
    expect(await rail.evaluate((node) => node.scrollTop)).toBe(0);
    await page.screenshot({
      path: testInfo.outputPath(
        `workbench-scrolled-${viewport.width}x${viewport.height}.png`,
      ),
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.keyboard.press("PageDown");
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(100);
  }
  await page.getByRole("button", { name: "Variants", exact: true }).click();
  await expect(page.locator("#bench-variants h2")).toBeFocused();
  await expect(page.locator("#bench-variants h2")).toBeInViewport({ ratio: 1 });
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(300);
  expect(
    await page.locator(".bench-form-scroll").evaluate((node) => node.scrollTop),
  ).toBe(0);
});

test("Workbench mobile preview opens the product page and returns to the form", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url());
  await expect(
    page.getByRole("complementary", { name: "Storefront preview" }),
  ).toBeHidden();
  await page
    .getByLabel("Product name", { exact: true })
    .fill("Mobile local example");
  await page.screenshot({ path: testInfo.outputPath("workbench-mobile.png") });
  await page
    .getByRole("button", { name: "Preview product", exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "Customer preview" });
  await expect(page.locator("body")).toHaveCSS("overflow-y", "hidden");
  await modal
    .getByRole("button", { name: "Open product page preview", exact: true })
    .click();
  await expect(modal.locator(".customer-product h2")).toHaveText(
    "Mobile local example",
  );
  await expect(modal.locator(".customer-product h2")).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await modal.getByRole("button", { name: "Close preview" }).click();
  await expect(page.locator("body")).toHaveCSS("overflow-y", "visible");
  await expect(
    page.getByRole("button", { name: "Preview product", exact: true }),
  ).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("corrupt local drafts are not overwritten and clearing requires confirmation", async ({
  page,
}) => {
  await page.addInitScript((k) => localStorage.setItem(k, "{broken"), key());
  await page.goto(url());
  await expect(page.locator("#draft-state")).toContainText("cannot be read");
  await page
    .getByLabel("Product name", { exact: true })
    .fill("Keep my new text");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  expect(await page.evaluate((k) => localStorage.getItem(k), key())).toBe(
    "{broken",
  );
  await page
    .getByRole("button", { name: "Clear local draft", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(page.getByLabel("Product name", { exact: true })).toHaveValue(
    "Keep my new text",
  );
  await page
    .getByRole("button", { name: "Clear local draft", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Clear local draft", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate((k) => localStorage.getItem(k), key()))
    .toBeNull();
  await expect(page.getByLabel("Product name", { exact: true })).toHaveValue(
    "Amber candle",
  );
});

test("storage failure is disclosed without losing edits or claiming a local save", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Fixture quota", "QuotaExceededError");
    };
  });
  await page.goto(url());
  await page
    .getByLabel("Product name", { exact: true })
    .fill("Still visible without storage");
  await expect(page.locator("#draft-state")).toContainText("could not save");
  await expect(page.getByLabel("Product name", { exact: true })).toHaveValue(
    "Still visible without storage",
  );
  expect(await page.evaluate((k) => localStorage.getItem(k), key())).toBeNull();
});

test("another tab pauses autosave until its draft conflict is reviewed", async ({
  page,
  context,
}) => {
  await page.goto(url());
  await page
    .getByLabel("Product name", { exact: true })
    .fill("First tab draft");
  await expect
    .poll(() => page.evaluate((k) => localStorage.getItem(k), key()))
    .not.toBeNull();
  const other = await context.newPage();
  await other.goto(url());
  await expect(other.getByLabel("Product name", { exact: true })).toHaveValue(
    "First tab draft",
  );
  await page
    .getByLabel("Product name", { exact: true })
    .fill("First tab changed again");
  await expect(other.locator("#draft-state")).toContainText("another tab");
  await other
    .getByLabel("Product name", { exact: true })
    .fill("Reviewed second tab draft");
  await other
    .getByRole("button", { name: "Keep this draft", exact: true })
    .click();
  await expect
    .poll(() =>
      other.evaluate(
        (k) => JSON.parse(localStorage.getItem(k)!).product.title,
        key(),
      ),
    )
    .toBe("Reviewed second tab draft");
  await other.close();
});

test("photo restore asks for reattachment and never persists image bytes or filenames", async ({
  page,
}) => {
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") mutations.push(request.url());
  });
  await page.goto(url("new"));
  await page.getByLabel("Product name", { exact: true }).fill("Photo draft");
  await page.getByLabel("Choose a local photo").setInputFiles({
    name: "private-demo.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPd8AAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect
    .poll(() =>
      page.evaluate((k) => {
        const raw = localStorage.getItem(k);
        return raw ? JSON.parse(raw).hasPhoto : false;
      }, key("new")),
    )
    .toBe(true);
  const stored = await page.evaluate(
    (k) => localStorage.getItem(k)!,
    key("new"),
  );
  expect(stored).not.toContain("private-demo.png");
  expect(stored).not.toContain("blob:");
  expect(stored).not.toContain("data:image");
  await page.reload();
  await expect(page.getByLabel("Product name", { exact: true })).toHaveValue(
    "Photo draft",
  );
  await expect(page.locator("#draft-state")).toContainText("Reattach");
  expect(
    await page
      .getByLabel("Choose a local photo")
      .evaluate((node: HTMLInputElement) => node.files?.length),
  ).toBe(0);
  expect(mutations).toEqual([]);
});
