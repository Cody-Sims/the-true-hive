import { createHash } from "node:crypto";
import { readdir, readFile, lstat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { Pool } from "pg";
import { databaseOptions } from "../src/server/db/connection.mjs";

export class MigrationDriftError extends Error {}

/**
 * @param {import("pg").Pool} pool
 * @param {URL} [directory]
 * @returns {Promise<string[]>}
 */
export async function migrateDatabase(
  pool,
  directory = new URL("../migrations/", import.meta.url),
) {
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (names.some((name) => !/^\d{3}_[a-z0-9_-]+\.sql$/.test(name))) {
    throw new MigrationDriftError(
      "SQL migration filenames must use the numbered convention.",
    );
  }
  const migrations = await Promise.all(
    names.map(async (name) => {
      const file = new URL(name, directory);
      const info = await lstat(file);
      if (!info.isFile() || info.isSymbolicLink())
        throw new MigrationDriftError(
          `Migration ${name} must be a regular file.`,
        );
      const sql = await readFile(file, "utf8");
      return {
        name,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    }),
  );
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(881799)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const history = await client.query(
      "SELECT name, checksum FROM schema_migrations",
    );
    const applied = new Map(
      history.rows.map((row) => [String(row.name), String(row.checksum)]),
    );
    for (const name of applied.keys()) {
      if (!names.includes(name))
        throw new MigrationDriftError(
          `Applied migration ${name} is missing from source.`,
        );
    }
    const latestApplied = [...applied.keys()].sort().at(-1);
    const backfilled = migrations.find(
      (migration) =>
        !applied.has(migration.name) &&
        latestApplied &&
        migration.name < latestApplied,
    );
    if (backfilled) {
      throw new MigrationDriftError(
        `Unapplied migration ${backfilled.name} precedes applied history; add a new forward migration instead.`,
      );
    }
    const changes = [];
    for (const migration of migrations) {
      const recorded = applied.get(migration.name);
      if (recorded) {
        if (recorded !== migration.checksum)
          throw new MigrationDriftError(
            `Applied migration ${migration.name} changed; add a forward migration instead.`,
          );
        continue;
      }
      await client.query(migration.sql);
      await client.query(
        "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
        [migration.name, migration.checksum],
      );
      changes.push(migration.name);
    }
    await client.query("COMMIT");
    return changes;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      discard = true;
    }
    throw error;
  } finally {
    client.release(discard);
  }
}

async function main() {
  const url =
    process.env["MIGRATION_DATABASE_URL"]?.trim() ||
    process.env["DATABASE_URL"]?.trim();
  if (!url)
    throw new Error(
      "Set MIGRATION_DATABASE_URL or DATABASE_URL before running migrations.",
    );
  const tls = process.env["DATABASE_TLS"] ?? "verify-full";
  if (tls !== "verify-full" && tls !== "disable")
    throw new Error("DATABASE_TLS must be verify-full or disable.");
  const pool = new Pool(databaseOptions(url, tls));
  try {
    const changes = await migrateDatabase(pool);
    console.log(
      `Applied ${changes.length} migrations. Existing checksums verified.`,
    );
  } finally {
    await pool.end();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(
      error instanceof MigrationDriftError
        ? error.message
        : "Migration failed. Check connection settings, permissions, and migration history.",
    );
    process.exitCode = 1;
  });
}
