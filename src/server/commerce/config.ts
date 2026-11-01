import { isIP } from "node:net";
import { ConfigurationError, readConfig } from "../config.ts";
import { databaseOptions } from "../db/connection.mjs";
import { isRecordKey } from "../inventory/rules.ts";

export interface StripeTestConfig {
  mode: "stripe-test";
  locationKey: string;
  siteOrigin: string;
  secretKey: string;
  webhookSecret: string;
}

export type CheckoutConfig = { mode: "disabled" } | StripeTestConfig;

export function readCheckoutConfig(
  environment: NodeJS.ProcessEnv = process.env,
): CheckoutConfig {
  const mode = environment["CHECKOUT_MODE"] ?? "disabled";
  if (mode === "disabled") return { mode };
  try {
    if (mode !== "stripe-test") throw new Error();
    const site = readConfig(environment);
    const origin = new URL(environment["SITE_URL"] ?? "");
    databaseOptions(site.databaseUrl ?? "", site.databaseTls);
    databaseOptions(environment["ADMIN_DATABASE_URL"] ?? "", "verify-full");
    const locationKey = environment["CHECKOUT_LOCATION_KEY"];
    const secretKey = environment["STRIPE_SECRET_KEY"];
    const webhookSecret = environment["STRIPE_WEBHOOK_SECRET"];
    if (
      site.catalogSource !== "database" ||
      environment["ADMIN_DATABASE_URL"] ===
        environment["MIGRATION_DATABASE_URL"] ||
      !isRecordKey(locationKey) ||
      typeof secretKey !== "string" ||
      !/^sk_test_[a-zA-Z0-9]{8,240}$/.test(secretKey) ||
      typeof webhookSecret !== "string" ||
      !/^whsec_[a-zA-Z0-9]{8,240}$/.test(webhookSecret) ||
      origin.protocol !== "https:" ||
      !origin.hostname.includes(".") ||
      isIP(origin.hostname.replace(/^\[|\]$/g, "")) !== 0 ||
      /(?:^|\.)(?:localhost|local|internal)$/.test(origin.hostname) ||
      origin.port
    ) {
      throw new Error();
    }
    return {
      mode,
      locationKey,
      siteOrigin: site.siteOrigin,
      secretKey,
      webhookSecret,
    };
  } catch {
    throw new ConfigurationError(
      "Checkout requires valid private database, public origin and Stripe test configuration.",
    );
  }
}

export function getCheckoutPresentation(
  environment: NodeJS.ProcessEnv = process.env,
): { enabled: boolean; locationKey: string | null } {
  try {
    const config = readCheckoutConfig(environment);
    return config.mode === "stripe-test"
      ? { enabled: true, locationKey: config.locationKey }
      : { enabled: false, locationKey: null };
  } catch {
    return { enabled: false, locationKey: null };
  }
}

export function prepareCheckoutStartup(
  environment: NodeJS.ProcessEnv = process.env,
): void {
  readCheckoutConfig(environment);
}
