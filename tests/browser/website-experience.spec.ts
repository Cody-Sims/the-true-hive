import { test, expect } from "@playwright/test";
import { gzipSync } from "node:zlib";

test("collection categories narrow the actual results without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto("http://127.0.0.1:4325/goods?category=honey");
    await expect(page.locator(".shelf-product")).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "Seasonal honey", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Everyday soap", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Collection", { exact: true })).toHaveValue(
      "honey",
    );
  } finally {
    await context.close();
  }
});

test("a no-JS search keeps the intent and provides an honest reset", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto(
      "http://127.0.0.1:4325/goods?category=soap&q=unmatched-fixture",
    );
    await expect(page.locator(".shelf-product")).toHaveCount(0);
    await expect(page.getByLabel("Search the collection")).toHaveValue(
      "unmatched-fixture",
    );
    await expect(page.getByText(/no matches/i)).toBeVisible();
    await expect(page.getByText(/out of stock|sold out/i)).toHaveCount(0);
    await page
      .getByRole("link", { name: "Clear filters", exact: true })
      .click();
    await expect(page).toHaveURL("http://127.0.0.1:4325/goods");
    await expect(page.locator(".shelf-product")).toHaveCount(3);
    await page.getByLabel("Search the collection").fill("soap");
    await page.getByRole("button", { name: "Find goods", exact: true }).click();
    await expect(page.locator(".shelf-product")).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "Everyday soap", exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("public journeys reflow on small screens and with doubled text", async ({
  page,
}) => {
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      "/goods",
      "/goods/everyday-soap",
      "/services",
      "/about",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        `${path} at ${width}px`,
      ).toBeLessThanOrEqual(width);
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/goods");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect(page.getByLabel("Search the collection")).toBeVisible();
  await expect(page.getByRole("button", { name: "Find goods" })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(1280);
});

test("the public experience respects reduced motion and keyboard discovery", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/goods");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
  const search = page.getByLabel("Search the collection");
  await search.focus();
  await expect(search).toBeFocused();
  await search.fill("honey");
  await page.getByRole("button", { name: "Find goods" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".shelf-product")).toHaveCount(1);
  const durations = await page
    .locator(".button,.shelf-art")
    .evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).transitionDuration),
    );
  expect(durations.length).toBeGreaterThan(0);
  expect(
    durations.every((value) =>
      value.split(",").every((part) => parseFloat(part) === 0),
    ),
  ).toBe(true);
});

test("initial public routes stay local and within resource budgets", async ({
  browser,
}) => {
  for (const path of ["/", "/goods", "/goods/everyday-soap"]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    const origins = new Set<string>();
    let transferred = 0;
    const scripts: Promise<Buffer>[] = [];
    await session.send("Network.enable");
    session.on("Network.loadingFinished", (event) => {
      transferred += event.encodedDataLength;
    });
    page.on("request", (request) => {
      origins.add(new URL(request.url()).origin);
    });
    page.on("response", (response) => {
      if (response.request().resourceType() === "script") {
        scripts.push(response.body());
      }
    });

    try {
      await page.goto(`http://127.0.0.1:4325${path}`, {
        waitUntil: "networkidle",
      });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect([...origins], path).toEqual(["http://127.0.0.1:4325"]);
      expect(transferred, path).toBeGreaterThan(0);
      expect(transferred, path).toBeLessThanOrEqual(1024 * 1024);
      const compressedScripts = (await Promise.all(scripts)).reduce(
        (bytes, body) => bytes + gzipSync(body).byteLength,
        0,
      );
      expect(compressedScripts, path).toBeLessThanOrEqual(25 * 1024);
    } finally {
      await context.close();
    }
  }
});

test("discovery rejects invalid filters and escapes reflected search text", async ({
  page,
}) => {
  for (const query of ["category=not-a-collection", `q=${"a".repeat(81)}`]) {
    const response = await page.goto(`/goods?${query}`);
    expect(response?.status()).toBe(400);
    await expect(
      page.getByRole("link", { name: "Clear filters", exact: true }),
    ).toBeVisible();
  }
  const payload = "<script>window.websiteInjection=true</script>";
  await page.goto(`/goods?q=${encodeURIComponent(payload)}`);
  await expect(page.getByLabel("Search the collection")).toHaveValue(payload);
  expect(await page.evaluate(() => "websiteInjection" in window)).toBe(false);
  await expect(page.getByText(/no matches/i)).toBeVisible();
});
