import { databaseOptions } from "../db/connection.mjs";

export class AdminConfigurationError extends Error {
  constructor() {
    super("Inventory administration is not configured safely.");
  }
}

export interface AdminConfig {
  enabled: boolean;
  origin: string;
  secureCookies: boolean;
  databaseUrl: string | null;
  csrfSecret: string | null;
  projectId: string | null;
  apiKey: string | null;
  serviceAccount: {
    project_id: string;
    client_email: string;
    private_key: string;
  } | null;
}

export function readAdminConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AdminConfig {
  const flag = environment["INVENTORY_ENABLED"] ?? "false";
  if (!["true", "false"].includes(flag)) throw new AdminConfigurationError();
  if (
    environment["CHECKOUT_MODE"] === "stripe-test" &&
    (flag !== "true" || environment["CATALOG_SOURCE"] !== "database")
  )
    throw new AdminConfigurationError();
  let origin: URL;
  try {
    origin = new URL(
      environment["INVENTORY_ORIGIN"] ?? "https://inventory.thetruehive.com",
    );
  } catch {
    throw new AdminConfigurationError();
  }
  const development = environment["NODE_ENV"] === "development";
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
    origin.hostname,
  );
  if (
    (origin.protocol !== "https:" &&
      !(development && loopback && origin.protocol === "http:")) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new AdminConfigurationError();
  const enabled = flag === "true";
  const projectId = enabled
    ? environment["FIREBASE_PROJECT_ID"]?.trim() || null
    : null;
  const apiKey = enabled
    ? environment["FIREBASE_WEB_API_KEY"]?.trim() || null
    : null;
  const databaseUrl = enabled
    ? environment["ADMIN_DATABASE_URL"]?.trim() || null
    : null;
  const csrfSecret = enabled ? environment["ADMIN_CSRF_SECRET"] || null : null;
  let serviceAccount: AdminConfig["serviceAccount"] = null;
  if (enabled) {
    if (environment["FIREBASE_AUTH_EMULATOR_HOST"])
      throw new AdminConfigurationError();
    try {
      const value = JSON.parse(
        environment["FIREBASE_SERVICE_ACCOUNT_JSON"] || "",
      ) as Record<string, unknown>;
      if (
        value["type"] !== "service_account" ||
        value["project_id"] !== projectId ||
        typeof value["client_email"] !== "string" ||
        !value["client_email"].endsWith(
          `@${projectId}.iam.gserviceaccount.com`,
        ) ||
        typeof value["private_key"] !== "string" ||
        !value["private_key"].startsWith("-----BEGIN PRIVATE KEY-----")
      )
        throw new AdminConfigurationError();
      serviceAccount = {
        project_id: value["project_id"] as string,
        client_email: value["client_email"],
        private_key: value["private_key"],
      };
    } catch {
      throw new AdminConfigurationError();
    }
    if (
      !projectId ||
      !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId) ||
      !apiKey ||
      apiKey.length > 256 ||
      !databaseUrl ||
      databaseUrl === environment["MIGRATION_DATABASE_URL"] ||
      !csrfSecret ||
      csrfSecret.length > 1024 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(csrfSecret) ||
      Buffer.from(csrfSecret, "base64").byteLength < 32 ||
      Buffer.from(csrfSecret, "base64").toString("base64") !== csrfSecret ||
      new Set(csrfSecret).size < 12
    )
      throw new AdminConfigurationError();
    if ((environment["CATALOG_SOURCE"] ?? "showcase") === "database") {
      const tls = environment["DATABASE_TLS"] ?? "verify-full";
      if (tls !== "verify-full" && tls !== "disable")
        throw new AdminConfigurationError();
      assertSameDatabaseTarget(
        environment["DATABASE_URL"]?.trim() || "",
        databaseUrl,
        tls,
      );
    }
  }
  return {
    enabled,
    origin: origin.origin,
    secureCookies: origin.protocol === "https:",
    databaseUrl,
    csrfSecret,
    projectId,
    apiKey,
    serviceAccount,
  };
}

export function getAdminLoginConfig() {
  const config = readAdminConfig();
  return {
    enabled: config.enabled,
    apiKey: config.apiKey,
    authDomain: config.projectId ? `${config.projectId}.firebaseapp.com` : null,
    projectId: config.projectId,
  };
}

export function assertSameDatabaseTarget(
  publicUrl: string,
  adminUrl: string,
  publicTls: "verify-full" | "disable" = "verify-full",
): void {
  function target(connectionString: string, tls: "verify-full" | "disable") {
    const url = new URL(
      databaseOptions(connectionString, tls).connectionString,
    );
    if (url.hash) throw new AdminConfigurationError();
    let hostname = url.hostname.toLowerCase();
    if (hostname.endsWith(".neon.tech")) {
      const labels = hostname.split(".");
      labels[0] = labels[0]!.replace(/-pooler$/, "");
      hostname = labels.join(".");
    }
    const port = Number(url.port || 5432);
    const database = decodeURIComponent(url.pathname.slice(1));
    if (port < 1 || port > 65535 || !database || database.includes("\0"))
      throw new AdminConfigurationError();
    return JSON.stringify([hostname, port, database]);
  }
  try {
    if (target(publicUrl, publicTls) !== target(adminUrl, "verify-full"))
      throw new AdminConfigurationError();
  } catch {
    throw new AdminConfigurationError();
  }
}
