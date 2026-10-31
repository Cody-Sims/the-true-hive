export class ConfigurationError extends Error {}

export interface SiteConfig {
  siteOrigin: string;
  catalogSource: "showcase" | "database";
  indexable: boolean;
  databaseUrl: string | null;
  databaseTls: "verify-full" | "disable";
  contact: {
    phone: string | null;
    phoneHref: string | null;
    facebook: string | null;
    instagram: string | null;
  };
}

function profile(value: string | undefined, field: string, hosts: string[]) {
  if (!value?.trim()) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ConfigurationError(
      `${field} must be a complete HTTPS profile URL.`,
    );
  }
  if (
    url.protocol !== "https:" ||
    !hosts.includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname === "/" ||
    value.length > 2048
  ) {
    throw new ConfigurationError(
      `${field} must be a verified platform profile URL.`,
    );
  }
  return url.href;
}

export function readConfig(
  environment: NodeJS.ProcessEnv = process.env,
): SiteConfig {
  const catalogSource = environment["CATALOG_SOURCE"] ?? "showcase";
  if (catalogSource !== "showcase" && catalogSource !== "database") {
    throw new ConfigurationError(
      "CATALOG_SOURCE must be showcase or database.",
    );
  }
  const indexableValue = environment["SITE_INDEXABLE"] ?? "false";
  if (indexableValue !== "true" && indexableValue !== "false") {
    throw new ConfigurationError("SITE_INDEXABLE must be true or false.");
  }
  const indexable = indexableValue === "true";
  if (indexable && catalogSource === "showcase") {
    throw new ConfigurationError(
      "A showcase catalog must not be made indexable.",
    );
  }
  let site: URL;
  try {
    site = new URL(environment["SITE_URL"] ?? "https://thetruehive.com");
  } catch {
    throw new ConfigurationError("SITE_URL must be a valid site origin.");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(site.hostname);
  if (
    (site.protocol !== "https:" && !(loopback && site.protocol === "http:")) ||
    site.username ||
    site.password ||
    site.pathname !== "/" ||
    site.search ||
    site.hash
  ) {
    throw new ConfigurationError(
      "SITE_URL must be an HTTPS origin, or HTTP loopback for local use.",
    );
  }
  const databaseTls = environment["DATABASE_TLS"] ?? "verify-full";
  if (databaseTls !== "verify-full" && databaseTls !== "disable") {
    throw new ConfigurationError(
      "DATABASE_TLS must be verify-full or disable.",
    );
  }
  const phone = environment["CONTACT_PHONE"]?.trim() || null;
  const normalizedPhone = phone?.replace(/[ ()-]/g, "") ?? null;
  if (
    phone &&
    (!/^\+?[\d ()-]{7,40}$/.test(phone) ||
      !/^\+?\d{7,15}$/.test(normalizedPhone ?? ""))
  ) {
    throw new ConfigurationError(
      "CONTACT_PHONE must be a valid public telephone number.",
    );
  }
  return {
    siteOrigin: site.origin,
    catalogSource,
    indexable,
    databaseUrl: environment["DATABASE_URL"]?.trim() || null,
    databaseTls,
    contact: {
      phone,
      phoneHref: normalizedPhone ? `tel:${normalizedPhone}` : null,
      facebook: profile(environment["FACEBOOK_URL"], "FACEBOOK_URL", [
        "facebook.com",
        "www.facebook.com",
        "m.facebook.com",
      ]),
      instagram: profile(environment["INSTAGRAM_URL"], "INSTAGRAM_URL", [
        "instagram.com",
        "www.instagram.com",
      ]),
    },
  };
}
