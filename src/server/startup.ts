import { Pool } from "pg";
import { readConfig, type SiteConfig } from "./config.ts";
import { CatalogUnavailableError, checkDatabase } from "./catalog.ts";
import { databaseOptions } from "./db/connection.mjs";

export async function prepareStartup(
  config: SiteConfig = readConfig(),
  suppliedPool?: Pool,
): Promise<void> {
  if (config.catalogSource === "showcase") return;
  let pool = suppliedPool;
  if (!pool) {
    if (!config.databaseUrl)
      throw new CatalogUnavailableError("NOT_CONFIGURED");
    pool = new Pool(databaseOptions(config.databaseUrl, config.databaseTls));
  }
  try {
    await checkDatabase(config, pool);
  } finally {
    if (!suppliedPool) await pool.end();
  }
}
