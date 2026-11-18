import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";

test("native pickup components exercise real browser recovery and scheduling controls", () => {
  test.setTimeout(60000);
  const result = spawnSync(
    process.execPath,
    [
      "--test",
      "tests/site/pickup-client.test.ts",
      "tests/site/pickup-presentation.test.ts",
    ],
    {
      cwd: new URL("../../", import.meta.url),
      env: {
        ...process.env,
        TMPDIR: new URL("../../", import.meta.url).pathname,
        INVENTORY_UI_BROWSER_TESTS: "1",
      },
      encoding: "utf8",
      timeout: 45000,
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  expect(result.stdout).toMatch(/skipped 0/);
});

test("the built customer return is private-cache protected and buyer APIs do not require an administrator session", async ({
  page,
  request,
}) => {
  const response = await page.goto("/checkout/return");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response?.headers()["cache-control"]).toContain("no-store");
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(
    page.getByRole("button", { name: "Refresh status" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm pickup" }),
  ).toHaveCount(0);
  const context = await request.get("/api/pickup/context");
  expect(context.status()).toBe(401);
  expect((await context.json()).error.code).toBe("PICKUP_ACCESS_REQUIRED");
  const wrongMethod = await request.get("/api/pickup/booking");
  expect(wrongMethod.status()).toBe(405);
});
