import { prepareStartup } from "../src/server/startup.ts";

try {
  await prepareStartup();
  await import("../dist-site/server/entry.mjs");
} catch {
  console.error(
    "Startup checks failed. Confirm application configuration, database connectivity and migrations.",
  );
  process.exitCode = 1;
}
