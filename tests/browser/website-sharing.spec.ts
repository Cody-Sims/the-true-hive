import { test, expect } from "@playwright/test";

test("normal pages provide a fetchable first-party branded share image", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
    "content",
    "The True Hive",
  );
  const image = page.locator('meta[property="og:image"]');
  await expect(image).toHaveAttribute(
    "content",
    /^http:\/\/127\.0\.0\.1:4325\/_astro\/.+\.png$/,
  );
  const url = await image.getAttribute("content");
  expect(url).not.toBeNull();
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
    "content",
    url!,
  );
  await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
    "content",
    /The True Hive.*Madisonville/,
  );
  const response = await request.get(url!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/png");
  const body = await response.body();
  expect(body.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(body.readUInt32BE(16)).toBe(1200);
  expect(body.readUInt32BE(20)).toBe(630);
  const favicon = await page.locator('link[rel="icon"]').getAttribute("href");
  const icon = await fetch(new URL(favicon!, page.url()), {
    signal: AbortSignal.timeout(5000),
  });
  expect(icon.status).toBe(200);
  expect(await icon.text()).toContain("<title>The True Hive</title>");
});

test("search and missing pages do not advertise a normal-page share image", async ({
  page,
}) => {
  for (const path of ["/goods?q=soap", "/not-a-published-page"]) {
    await page.goto(path);
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(0);
    await expect(page.locator('meta[name="twitter:image"]')).toHaveCount(0);
  }
});
