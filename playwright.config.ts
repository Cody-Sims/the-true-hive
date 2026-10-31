import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  retries: 0,
  workers: 2,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4325",
    browserName: "chromium",
    viewport: { width: 1440, height: 1000 },
  },
  webServer: [
    {
      command: "npm run start",
      url: "http://127.0.0.1:4325/api/health/live",
      timeout: 30000,
      reuseExistingServer: false,
      env: {
        HOST: "127.0.0.1",
        PORT: "4325",
        CATALOG_SOURCE: "showcase",
        SITE_INDEXABLE: "false",
        SITE_URL: "http://127.0.0.1:4325",
        DATABASE_URL: "",
      },
    },
    {
      command: "node dist-site/server/entry.mjs",
      url: "http://127.0.0.1:4326/api/health/live",
      timeout: 30000,
      reuseExistingServer: false,
      env: {
        HOST: "127.0.0.1",
        PORT: "4326",
        CATALOG_SOURCE: "database",
        SITE_INDEXABLE: "false",
        SITE_URL: "http://127.0.0.1:4326",
        DATABASE_URL: "",
      },
    },
  ],
});
