export class ProductImagesConfigurationError extends Error {
  constructor() {
    super("Product image storage configuration is invalid.");
  }
}

export interface ProductImagesConfig {
  enabled: boolean;
  projectId: string | null;
  bucket: string | null;
  credentials: {
    type: "service_account";
    project_id: string;
    client_email: string;
    private_key: string;
  } | null;
}

export function readProductImagesConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ProductImagesConfig {
  const flag = environment["PRODUCT_IMAGES_ENABLED"] ?? "false";
  if (flag !== "true" && flag !== "false")
    throw new ProductImagesConfigurationError();
  if (flag === "false")
    return { enabled: false, projectId: null, bucket: null, credentials: null };
  const projectId = environment["PRODUCT_IMAGES_PROJECT_ID"]?.trim();
  const bucket = environment["PRODUCT_IMAGES_BUCKET"]?.trim();
  const encoded = environment["PRODUCT_IMAGES_SERVICE_ACCOUNT_JSON"];
  try {
    if (
      !projectId ||
      !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId) ||
      !bucket ||
      !/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(bucket) ||
      !encoded ||
      encoded.length > 65536
    )
      throw new Error();
    const value: unknown = JSON.parse(encoded);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    const account = value as Record<string, unknown>;
    if (
      account["type"] !== "service_account" ||
      account["project_id"] !== projectId ||
      typeof account["client_email"] !== "string" ||
      !/^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(
        account["client_email"],
      ) ||
      !account["client_email"].endsWith(
        `@${projectId}.iam.gserviceaccount.com`,
      ) ||
      typeof account["private_key"] !== "string" ||
      !account["private_key"].startsWith("-----BEGIN PRIVATE KEY-----\n") ||
      !account["private_key"].trimEnd().endsWith("-----END PRIVATE KEY-----")
    )
      throw new Error();
    return {
      enabled: true,
      projectId,
      bucket,
      credentials: {
        type: "service_account",
        project_id: projectId,
        client_email: account["client_email"],
        private_key: account["private_key"],
      },
    };
  } catch {
    throw new ProductImagesConfigurationError();
  }
}
