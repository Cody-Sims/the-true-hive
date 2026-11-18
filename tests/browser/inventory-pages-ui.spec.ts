import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";

test("native inventory pages preserve operational boundaries and reflow across viewports", () => {
  test.setTimeout(60000);
  const result = spawnSync(
    process.execPath,
    ["--test", "tests/site/inventory-pages.test.ts"],
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
