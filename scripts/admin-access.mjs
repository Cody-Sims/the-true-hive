import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { databaseOptions } from "../src/server/db/connection.mjs";

function validateIdentity(uid) {
  if (
    typeof uid !== "string" ||
    uid.length < 1 ||
    uid.length > 128 ||
    uid !== uid.trim() ||
    /[\u0000-\u001f\u007f]/.test(uid)
  ) {
    throw new Error("A valid private admin identity is required.");
  }
}

export function readAdminAccessEnvironment(environment = process.env) {
  const connectionString = environment.MIGRATION_DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("A private direct owner connection is required.");
  }
  let ownerURL;
  try {
    ownerURL = new URL(connectionString);
  } catch {
    throw new Error("A valid private direct owner connection is required.");
  }
  if (ownerURL.hostname.includes("-pooler")) {
    throw new Error("A private direct owner connection is required.");
  }
  const uid = environment.INVENTORY_ADMIN_UID;
  validateIdentity(uid);
  const tls = environment.DATABASE_TLS || "verify-full";
  databaseOptions(connectionString, tls);
  return { connectionString, uid, tls };
}

export async function changeAdminAccess(pool, uid, active) {
  validateIdentity(uid);
  if (typeof active !== "boolean") {
    throw new Error("Choose an explicit grant or revoke operation.");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (active) {
      await client.query(
        `INSERT INTO admin_memberships(uid,active) VALUES ($1,true)
         ON CONFLICT(uid) DO UPDATE SET active=true,updated_at=CURRENT_TIMESTAMP`,
        [uid],
      );
    } else {
      await client.query(
        "UPDATE admin_memberships SET active=false,updated_at=CURRENT_TIMESTAMP WHERE uid=$1",
        [uid],
      );
      await client.query(
        "UPDATE admin_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE uid=$1 AND revoked_at IS NULL",
        [uid],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const command = process.argv[2];
  if (command === undefined || command === "--help") {
    console.log(
      "Usage: npm run admin:access -- grant|revoke\nSet MIGRATION_DATABASE_URL and INVENTORY_ADMIN_UID privately; never pass identities or credentials as arguments.",
    );
    return;
  }
  if (!["grant", "revoke"].includes(command) || process.argv.length !== 3) {
    console.error("Choose grant or revoke without additional arguments.");
    process.exitCode = 1;
    return;
  }
  let pool;
  try {
    const { connectionString, uid, tls } = readAdminAccessEnvironment();
    pool = new Pool({
      ...databaseOptions(connectionString, tls),
      max: 1,
      connectionTimeoutMillis: 10000,
      query_timeout: 10000,
      statement_timeout: 10000,
    });
    await changeAdminAccess(pool, uid, command === "grant");
    console.log(
      command === "grant" ? "Admin access enabled." : "Admin access revoked.",
    );
  } catch {
    console.error(
      "Admin access operation failed. Verify private owner configuration and the target schema.",
    );
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
