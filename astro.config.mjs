import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import { readConfig } from "./src/server/config.ts";
import { readAdminConfig } from "./src/server/admin/config.ts";

const siteOrigin = readConfig().siteOrigin;
const origins = new Set([siteOrigin, readAdminConfig().origin]);
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
  adapter: node({ mode: "standalone", bodySizeLimit: 262144 }),
  security: { allowedDomains },
  session: false,
  server: { host: "127.0.0.1", port: 4321 },
});
