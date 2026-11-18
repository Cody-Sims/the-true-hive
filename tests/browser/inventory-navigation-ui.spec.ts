import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";

test("inventory mobile navigation passes its real component browser gate", () => {
  test.setTimeout(60000);
  const result = spawnSync(
    process.execPath,
    ["--test", "tests/site/inventory-navigation.test.ts"],
    {
      cwd: new URL("../../", import.meta.url),
      env: { ...process.env, INVENTORY_UI_BROWSER_TESTS: "1" },
      encoding: "utf8",
      timeout: 45000,
    },
  );
  expect(result.error, `${result.stdout}\n${result.stderr}`).toBeUndefined();
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  expect(result.stdout).toMatch(/skipped 0/);
});
