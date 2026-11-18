import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import { readConfig } from "./src/server/config.ts";
import { readAdminConfig } from "./src/server/admin/config.ts";
import approval from "./publishing.json" with { type: "json" };
import { validateStudioApproval } from "./scripts/private-studio.mjs";

validateStudioApproval(approval);
const siteOrigin = readConfig().siteOrigin;
const origins = new Set([siteOrigin, readAdminConfig().origin]);
// Keep native local start and the two isolated browser fixtures usable after build.
for (const port of [4321, 4325, 4326]) {
  origins.add(`http://127.0.0.1:${port}`);
}
if (siteOrigin === "https://thetruehive.com") {
  origins.add("https://inventory.thetruehive.com");
  origins.add("https://preview.thetruehive.com");
}
const allowedDomains = [...origins].map((origin) => {
  const url = new URL(origin);
  return {
    hostname: url.hostname,
    protocol: url.protocol.slice(0, -1),
    port: url.port,
  };
});

export default defineConfig({
  site: siteOrigin,
  output: "server",
  outDir: "./dist-site",
  adapter: node({
    mode: "standalone",
    bodySizeLimit: 8 * 1024 * 1024 + 65536,
  }),
  security: { allowedDomains },
  session: false,
  server: { host: "127.0.0.1", port: 4321 },
});
