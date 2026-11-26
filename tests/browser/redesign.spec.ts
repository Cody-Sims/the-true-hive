import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const root =
  process.env["REDESIGN_STUDIES_URL"] ??
  "http://127.0.0.1:4327/prototypes/redesign-2026/";
const profiles = [
  {
    slug: "coconut-milk-delight",
    title: "Coconut Milk Delight",
    values: [95, 78, 84],
  },
  {
    slug: "the-true-soap",
    title: "The True Soap",
    values: [82, 94, 92],
  },
];
const labels = ["Creaminess", "Scent Warmth", "Bar Firmness"];

test("Golden Apothecary leads with stocked soap and keeps bees in a separate lower section", async ({
  page,
}) => {
  await page.goto(`${root}prototype.html?proto=golden-apothecary&page=home`);
  const hero = page.locator(".ga-hero");
  await expect(hero.locator("img").first()).toHaveAttribute("src", /soap-/);
  await expect(hero.locator('img[src*="hive"]')).toHaveCount(0);
  await expect(hero).not.toContainText(/rescue|pollination/i);
  await expect(
    hero.getByRole("link", { name: /Shop In-Stock Soaps/ }),
  ).toBeVisible();
  await expect(hero.locator("a[data-slug]")).toHaveCount(3);
  for (const image of await hero.locator("img").all()) {
    expect(
      await image.evaluate((element: HTMLImageElement) => element.naturalWidth),
    ).toBeGreaterThan(0);
  }

  const services = page.getByRole("region", {
    name: "For the bees. And our neighbors.",
  });
  await expect(services.locator('img[src*="hive"]')).toHaveCount(1);
  await expect(services).toContainText("Live Honeybee Colony Rescue");
  await expect(services).toContainText("East Tennessee Farm Pollination");
  const goodsBottom = await page
    .getByRole("region", { name: "Pick your scent. Pick your shape." })
    .evaluate((element) => element.getBoundingClientRect().bottom);
  expect(
    await services.evaluate((element) => element.getBoundingClientRect().top),
  ).toBeGreaterThan(goodsBottom);

  await page.locator(".ga-collage a").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Coconut Milk Delight",
  );
  await page.goBack();
  await expect(hero).toBeVisible();
});

test("hero tiles preserve the advertised soap format through navigation, reload and cart", async ({
  page,
}) => {
  await page.goto(`${root}prototype.html?proto=golden-apothecary&page=home`);
  for (const [index, slug, image, price, format] of [
    [2, "the-true-soap", "soap-true-wolf.webp", "$12.50", "wolf"],
    [1, "the-true-soap", "soap-true-bar.webp", "$10.00", "single"],
    [0, "coconut-milk-delight", "soap-delight-bar.webp", "$10.00", "single"],
  ] as const) {
    const variant = `${slug}-4oz-${format}`;
    const tile = page.locator(".ga-collage a").nth(index);
    await expect(tile).toHaveAttribute(
      "href",
      new RegExp(`variant=${variant}`),
    );
    await tile.click();
    await expect(page).toHaveURL(new RegExp(`variant=${variant}`));
    const productImage = page.locator("#main figure > img");
    const add = page.locator(`[data-add-cart="${slug}|${variant}"]`);
    await expect(productImage).toHaveAttribute(
      "src",
      `../next/assets/${image}`,
    );
    await expect(add).toContainText(price);
    await page.reload();
    await expect(productImage).toHaveAttribute(
      "src",
      `../next/assets/${image}`,
    );
    await expect(add).toContainText(price);
    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "Home", exact: true })
      .click();
  }

  await page.locator(".ga-collage a").nth(2).click();
  await page
    .locator('[data-add-cart="the-true-soap|the-true-soap-4oz-wolf"]')
    .click();
  await page
    .getByRole("link", { name: "Cart with 1 items", exact: true })
    .click();
  await expect(page.locator(".cart-line")).toHaveCount(1);
  await expect(page.locator(".cart-line")).toContainText("Sculpted Wolf Mold");
  await expect(page.locator(".cart-line")).toContainText("$12.50");
  await page.goBack();
  await expect(page.locator("#main figure > img")).toHaveAttribute(
    "src",
    "../next/assets/soap-true-wolf.webp",
  );
  await page
    .getByRole("group", { name: "Choose format for The True Soap" })
    .getByRole("button", { name: /4oz Everyday Bar/ })
    .click();
  await expect(page).toHaveURL(/variant=the-true-soap-4oz-single/);
  await page.reload();
  await expect(page.locator("#main figure > img")).toHaveAttribute(
    "src",
    "../next/assets/soap-true-bar.webp",
  );
  await page.goto(
    `${root}prototype.html?proto=golden-apothecary&page=product&slug=coconut-milk-delight&variant=the-true-soap-4oz-wolf`,
  );
  await expect(page.locator("#main figure > img")).toHaveAttribute(
    "src",
    "../next/assets/soap-delight-bar.webp",
  );
});

test("Golden Apothecary shows each recipe's sensory stats on home, shop and product pages", async ({
  page,
}) => {
  for (const view of ["home", "goods", "product"]) {
    for (const profile of profiles) {
      await page.goto(
        `${root}prototype.html?proto=golden-apothecary&page=${view}&slug=${profile.slug}`,
      );
      const guide = page.getByRole("group", {
        name: `${profile.title} sensory profile`,
        exact: true,
      });
      await expect(guide).toContainText(/illustrative.*not lab/i);
      for (const [index, label] of labels.entries()) {
        const meter = guide.getByRole("meter", { name: label, exact: true });
        await expect(meter).toHaveAttribute(
          "aria-valuenow",
          String(profile.values[index]),
        );
        await expect(guide).toContainText(`${profile.values[index]}/100`);
      }
      expect(
        (
          await new AxeBuilder({ page })
            .include(".ga-sensory-profile")
            .analyze()
        ).violations,
      ).toEqual([]);
      const format = page
        .getByRole("group", { name: `Choose format for ${profile.title}` })
        .getByRole("button", { name: /Sculpted Wolf Mold/ });
      await format.focus();
      await format.press("Enter");
      await expect(format).toBeFocused();
      await expect(format).toHaveAttribute("aria-pressed", "true");
      await expect(
        guide.getByRole("meter", { name: "Creaminess", exact: true }),
      ).toHaveAttribute("aria-valuenow", String(profile.values[0]));
      const add = page.locator(
        `[data-add-cart="${profile.slug}|${profile.slug}-4oz-wolf"]`,
      );
      await expect(add).toContainText("$12.50");
    }
  }
});

test("Golden Apothecary ends with all common questions and working disclosure accordions", async ({
  page,
}) => {
  await page.goto(`${root}prototype.html?proto=golden-apothecary&page=home`);
  const lastSection = page.locator("#main > section").last();
  await expect(lastSection.locator(".faq-item")).toHaveCount(5);
  const disclosure = lastSection.locator("details").filter({
    has: page.getByText(
      "Why are some product photos labeled 'AI styling reference'?",
      {
        exact: true,
      },
    ),
  });
  await disclosure.locator("summary").focus();
  await disclosure.locator("summary").press("Enter");
  await expect(disclosure).toHaveAttribute("open", "");
  await expect(disclosure.locator("p")).toBeVisible();
});

test("the selected design preserves automatic and manual appearance without mobile overflow", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const mode of ["light", "dark", "system"]) {
      await page.emulateMedia({ colorScheme: "dark" });
      await page.goto(
        `${root}prototype.html?proto=golden-apothecary&page=home&mode=${mode}`,
      );
      await expect(page.locator("html")).toHaveAttribute(
        "data-color-mode",
        mode,
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await expect(page.locator(".ga-hero img").first()).toBeInViewport();
      expect(
        await page
          .locator("body")
          .evaluate((element) => getComputedStyle(element).backgroundColor),
      ).toBe(mode === "light" ? "rgb(255, 251, 244)" : "rgb(17, 18, 16)");
      for (const view of ["goods", "product"]) {
        await page.goto(
          `${root}prototype.html?proto=golden-apothecary&page=${view}&mode=${mode}`,
        );
        await expect(
          page.getByRole("group", {
            name: "Coconut Milk Delight sensory profile",
          }),
        ).toBeVisible();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width);
      }
    }
  }
  await page.goto(`${root}prototype.html?proto=golden-apothecary&page=home`);
  await page
    .getByRole("button", { name: "02 Cinematic Craft", exact: true })
    .click();
  await expect(page.locator(".sf-cine-hero")).toBeVisible();
  await page
    .getByRole("button", { name: "05 Studio Minimal", exact: true })
    .click();
  await expect(page.locator(".gm-hero")).toBeVisible();
  expect(errors).toEqual([]);
});
