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

test("desktop appearance changes keep focus on the visible header control", async ({
  page,
}) => {
  await page.goto(
    `${root}prototype.html?proto=golden-apothecary&page=home&mode=dark`,
  );
  const appearance = page.locator(".header-actions [data-cycle-mode]");
  for (const mode of ["system", "light", "dark"]) {
    await appearance.focus();
    await appearance.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-color-mode", mode);
    await expect(appearance).toBeFocused();
  }
});

test("returning to Golden Apothecary on mobile focuses the collapsed tools toggle", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${root}prototype.html?proto=story-flagship&page=home`);
  const golden = page.getByRole("button", {
    name: "01 Golden Apothecary",
    exact: true,
  });
  await golden.focus();
  await golden.press("Enter");
  await expect(page.locator("#studio-controls")).toBeHidden();
  await expect(
    page.getByRole("button", { name: /Preview tools/ }),
  ).toBeFocused();
});

test("the mobile header accommodates enlarged text without overlapping controls", async ({
  page,
}) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${root}prototype.html?proto=golden-apothecary&page=home`);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    const brand = (await page.locator(".brand-text").boundingBox())!;
    const menu = page.getByRole("button", { name: "Menu", exact: true });
    const button = (await menu.boundingBox())!;
    expect(
      brand.y + brand.height <= button.y || brand.x + brand.width <= button.x,
    ).toBe(true);
    expect(
      await page
        .locator(".site-header")
        .evaluate((element) => element.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await menu.click();
    const call = page
      .locator("#primary-nav")
      .getByRole("link", { name: "Call (423) 368-2262", exact: true });
    await call.focus();
    await expect(call).toBeInViewport();
    await page.keyboard.press("Escape");
    await expect(menu).toBeFocused();
  }
});

test("mobile hamburger navigation is compact, keyboard-accessible and closes after navigation", async ({
  page,
}) => {
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${root}prototype.html?proto=golden-apothecary&page=home`);
    const menu = page.getByRole("button", { name: "Menu", exact: true });
    const nav = page.locator("#primary-nav");
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(nav).toBeHidden();
    await expect(
      page.getByRole("link", { name: "Cart 0 items" }),
    ).toBeVisible();
    expect((await menu.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(
      (await page.locator(".header-inner").boundingBox())!.height,
    ).toBeLessThanOrEqual(80);
    await expect(page.locator(".ga-hero img").first()).toBeInViewport();

    await menu.focus();
    await menu.press("Enter");
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(nav.getByRole("link")).toHaveText([
      "Home",
      "Shop Soaps",
      "Bee Services",
      "Our Story",
      "Contact",
      "Call (423) 368-2262",
    ]);
    await menu.press("Tab");
    await expect(
      nav.getByRole("link", { name: "Home", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(nav).toBeHidden();
    await expect(menu).toBeFocused();
    await menu.click();
    await nav.getByRole("link", { name: "Shop Soaps", exact: true }).click();
    await expect(page).toHaveURL(/page=goods/);
    await expect(nav).toBeHidden();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await menu.click();
    await page.getByRole("heading", { level: 1 }).click();
    await expect(nav).toBeHidden();
  }
});

test("mobile menu retains appearance controls, cart contents and accessible contrast", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    `${root}prototype.html?proto=golden-apothecary&page=product&slug=the-true-soap&variant=the-true-soap-4oz-wolf&mode=dark`,
  );
  await page
    .locator('[data-add-cart="the-true-soap|the-true-soap-4oz-wolf"]')
    .click();
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await menu.click();
  const appearance = page.locator("#primary-nav").getByRole("button", {
    name: /^Appearance:/,
  });
  for (const mode of ["system", "light", "dark"]) {
    await appearance.focus();
    await appearance.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-color-mode", mode);
    await expect(appearance).toBeFocused();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("link", { name: "Cart 1 item" })).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).include(".site-header").analyze())
        .violations,
    ).toEqual([]);
  }
  await page.getByRole("link", { name: "Cart 1 item" }).click();
  await expect(page.locator("#primary-nav")).toBeHidden();
  await expect(page.locator(".cart-line")).toContainText("Sculpted Wolf Mold");
  await expect(page.locator(".cart-line")).toContainText("$12.50");
});

test("mobile preview tools collapse independently and desktop navigation stays visible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${root}prototype.html?proto=golden-apothecary&page=home`);
  const menu = page.locator("#mobile-menu-toggle");
  const tools = page.getByRole("button", {
    name: /Preview tools/,
  });
  await expect(page.locator("#studio-controls")).toBeHidden();
  await menu.click();
  const shop = page.locator("#primary-nav").getByRole("link", {
    name: "Shop Soaps",
    exact: true,
  });
  await shop.focus();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeHidden();
  await expect(shop).toBeVisible();
  await expect(shop).toBeFocused();
  await expect(page.locator("#studio-controls")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#primary-nav")).toBeHidden();
  await expect(menu).toBeFocused();
  await menu.click();
  await tools.click();
  await expect(page.locator("#primary-nav")).toBeHidden();
  await expect(page.locator("#studio-controls")).toBeVisible();
  await expect(
    page.locator("#studio-controls [data-switch-proto]"),
  ).toHaveCount(5);
  const inspector = page.getByRole("button", {
    name: "SEO / AI X-Ray",
    exact: true,
  });
  await inspector.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(inspector).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#studio-controls")).toBeHidden();
  await expect(tools).toBeFocused();
});

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
  await page.getByRole("link", { name: "Cart 1 item", exact: true }).click();
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
  await page.getByRole("button", { name: /Preview tools/ }).click();
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
