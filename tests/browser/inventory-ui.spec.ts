import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";

// CI installs Chromium after the Node-only contract lane. This gate runs all
// isolated DOM cases then, without an admin fixture route or live auth provider.
test("isolated inventory and inquiry components pass the browser gate", () => {
  test.setTimeout(60000);
  const result = spawnSync(
    process.execPath,
    [
      "--test",
      "tests/site/admin-presentation.test.ts",
      "tests/site/inquiry-presentation.test.ts",
      "tests/site/sku-ui.test.ts",
      "tests/site/barcode-labels.test.ts",
    ],
    {
      cwd: new URL("../../", import.meta.url),
      env: {
        ...process.env,
        TMPDIR: new URL("../../", import.meta.url).pathname,
        INVENTORY_UI_BROWSER_TESTS: "1",
        INQUIRY_BROWSER_TESTS: "1",
      },
      encoding: "utf8",
      timeout: 45000,
    },
  );
  expect(result.error, `${result.stdout}\n${result.stderr}`).toBeUndefined();
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  expect(result.stdout).toMatch(/skipped 0/);
});
