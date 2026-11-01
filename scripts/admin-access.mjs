import { databaseOptions } from "../src/server/db/connection.mjs";

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
  if (
    typeof uid !== "string" ||
    uid.length < 1 ||
    uid.length > 128 ||
    uid !== uid.trim() ||
    /[\u0000-\u001f\u007f]/.test(uid)
  ) {
    throw new Error("A valid private admin identity is required.");
  }
  const tls = environment.DATABASE_TLS || "verify-full";
  databaseOptions(connectionString, tls);
  return { connectionString, uid, tls };
}
