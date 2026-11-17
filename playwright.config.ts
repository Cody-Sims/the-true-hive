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
      // Parallel browser contexts open several module connections at once.
      command:
        'npm run build:pages && python3 -c \'from functools import partial; from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer; ThreadingHTTPServer.request_queue_size = 128; ThreadingHTTPServer(("127.0.0.1", 4327), partial(SimpleHTTPRequestHandler, directory="dist")).serve_forever()\'',
      url: "http://127.0.0.1:4327/prototypes/next/",
      timeout: 30000,
      reuseExistingServer: false,
    },
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
        CONTACT_PHONE: "",
        FACEBOOK_URL: "",
        INSTAGRAM_URL: "",
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
        SITE_INDEXABLE: "true",
        SITE_URL: "http://127.0.0.1:4326",
        DATABASE_URL: "",
        CONTACT_PHONE: "",
        FACEBOOK_URL: "",
        INSTAGRAM_URL: "",
      },
    },
  ],
});
