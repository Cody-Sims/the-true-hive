import { Pool } from "pg";
import { readConfig, type SiteConfig } from "./config.ts";
import { CatalogUnavailableError, checkDatabase } from "./catalog.ts";
import { databaseOptions } from "./db/connection.mjs";
import {
  readAdminConfig,
  AdminConfigurationError,
  type AdminConfig,
} from "./admin/config.ts";

export async function prepareStartup(
  config: SiteConfig = readConfig(),
  suppliedPool?: Pool,
  adminConfig: AdminConfig = readAdminConfig(),
): Promise<void> {
  await prepareAdminStartup(adminConfig);
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

export interface AdminStartupDependencies {
  checkDatabase(): Promise<void>;
  checkProvider(): Promise<void>;
}

export async function prepareAdminStartup(
  config: AdminConfig = readAdminConfig(),
  dependencies?: AdminStartupDependencies,
): Promise<void> {
  if (!config.enabled) return;
  try {
    if (dependencies) {
      await dependencies.checkDatabase();
      await dependencies.checkProvider();
      return;
    }
    if (!config.databaseUrl) throw new AdminConfigurationError();
    const { checkAdminDatabaseAccess } = await import("./auth/persistence.ts");
    const pool = new Pool({
      ...databaseOptions(config.databaseUrl),
      max: 1,
      application_name: "the-true-hive-admin-preflight",
    });
    try {
      await checkAdminDatabaseAccess(pool);
    } finally {
      await pool.end();
    }
    const { checkFirebaseReadiness } = await import("./auth/firebase.ts");
    await checkFirebaseReadiness(config);
  } catch {
    throw new AdminConfigurationError();
  }
}
