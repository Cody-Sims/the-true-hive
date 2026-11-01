import { Pool } from "pg";
import { databaseOptions } from "../db/connection.mjs";
import { AdminConfigurationError, type AdminConfig } from "./config.ts";

let pool: Pool | undefined;
let writerUrl: string | undefined;

export function getAdminPool(config?: Pick<AdminConfig, "databaseUrl">): Pool {
  const databaseUrl = config
    ? config.databaseUrl
    : process.env["ADMIN_DATABASE_URL"]?.trim();
  if (!databaseUrl || databaseUrl === process.env["MIGRATION_DATABASE_URL"])
    throw new AdminConfigurationError();
  if (pool && writerUrl !== databaseUrl) throw new AdminConfigurationError();
  if (!pool) {
    pool = new Pool({
      ...databaseOptions(databaseUrl),
      application_name: "the-true-hive-admin",
      max: 3,
      allowExitOnIdle: true,
    });
    writerUrl = databaseUrl;
  }
  return pool;
}
