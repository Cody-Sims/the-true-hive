import { defineConfig } from "astro/config";
import node from "@astrojs/node";

export default defineConfig({
  site: "https://thetruehive.com",
  output: "server",
  outDir: "./dist-site",
  adapter: node({ mode: "standalone", bodySizeLimit: 65536 }),
  session: false,
  server: { host: "127.0.0.1", port: 4321 },
});
