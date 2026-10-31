export class DatabaseConfigurationError extends Error {}

/**
 * @param {string} connectionString
 * @param {"verify-full" | "disable"} [tls]
 * @returns {import("pg").PoolConfig & { connectionString: string }}
 */
export function databaseOptions(connectionString, tls = "verify-full") {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new DatabaseConfigurationError(
      "DATABASE_URL must be a PostgreSQL URL.",
    );
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !url.pathname ||
    url.pathname === "/"
  ) {
    throw new DatabaseConfigurationError(
      "DATABASE_URL requires a PostgreSQL host and database.",
    );
  }
  const local = ["localhost", "127.0.0.1", "[::1]", "db"].includes(
    url.hostname,
  );
  if (tls === "disable" && !local) {
    throw new DatabaseConfigurationError(
      "Disabling database TLS is allowed only for explicit local targets.",
    );
  }
  if (tls !== "verify-full" && tls !== "disable") {
    throw new DatabaseConfigurationError(
      "Database TLS must be verify-full or disable.",
    );
  }
  const sslMode = url.searchParams.get("sslmode");
  if (
    sslMode &&
    !(tls === "disable"
      ? sslMode === "disable"
      : ["require", "verify-full"].includes(sslMode))
  ) {
    throw new DatabaseConfigurationError(
      "The database sslmode conflicts with the verified TLS policy.",
    );
  }
  url.searchParams.delete("sslmode");
  const channelBinding = url.searchParams.getAll("channel_binding");
  if (
    channelBinding.length > 1 ||
    channelBinding.some((mode) => mode !== "prefer") ||
    (channelBinding.length && tls !== "verify-full")
  ) {
    throw new DatabaseConfigurationError(
      "This Node driver supports channel_binding=prefer with verified TLS, not required channel binding.",
    );
  }
  url.searchParams.delete("channel_binding");
  if ([...url.searchParams].length) {
    throw new DatabaseConfigurationError(
      "Unsupported DATABASE_URL query parameters require an explicit connection-policy update.",
    );
  }
  return {
    connectionString: url.href,
    ssl: tls === "verify-full" ? { rejectUnauthorized: true } : false,
    enableChannelBinding: tls === "verify-full",
    max: 5,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
    statement_timeout: 5000,
    query_timeout: 6000,
    application_name: "the-true-hive",
  };
}
