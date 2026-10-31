import { Pool } from "pg";
import type { SiteConfig } from "../config.ts";
import { databaseOptions } from "./connection.mjs";

let current: {
  url: string;
  tls: SiteConfig["databaseTls"];
  pool: Pool;
} | null = null;

export function getPool(config: SiteConfig): Pool {
  if (!config.databaseUrl)
    throw new Error("Database configuration is required.");
  if (
    current &&
    (current.url !== config.databaseUrl || current.tls !== config.databaseTls)
  ) {
    throw new Error(
      "Database settings changed within a running process; restart it deliberately.",
    );
  }
  if (!current) {
    const pool = new Pool(
      databaseOptions(config.databaseUrl, config.databaseTls),
    );
    pool.on("error", () =>
      console.error("An idle database connection closed unexpectedly."),
    );
    current = { url: config.databaseUrl, tls: config.databaseTls, pool };
  }
  return current.pool;
}
