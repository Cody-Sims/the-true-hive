import type { Pool } from "pg";
import type { StoreSettings, StorefrontStatus } from "../domain/storefront.ts";
import type { SiteConfig } from "./config.ts";
import { getPool } from "./db/pool.ts";

export const storeSettingsQuery = `
  SELECT purchases_enabled AS "purchasesEnabled", revision
  FROM storefront_settings WHERE id = 1
`;

export async function readStoreSettings(
  pool: Pick<Pool, "query">,
): Promise<StoreSettings> {
  const result = await pool.query<StoreSettings>(storeSettingsQuery);
  const row = result.rows[0];
  if (
    result.rows.length !== 1 ||
    !row ||
    typeof row.purchasesEnabled !== "boolean" ||
    !Number.isInteger(row.revision) ||
    row.revision < 1 ||
    row.revision > 2147483647
  )
    throw new Error("Store settings are unavailable.");
  return { purchasesEnabled: row.purchasesEnabled, revision: row.revision };
}

export async function getStorefrontStatus(
  config: SiteConfig,
  paymentReady: boolean,
  pool?: Pool,
): Promise<StorefrontStatus> {
  const closed = { purchasesEnabled: false, checkoutEnabled: false };
  if (config.catalogSource !== "database" || !config.databaseUrl)
    return { ...closed, state: "unconfigured" };
  try {
    const settings = await readStoreSettings(pool ?? getPool(config));
    if (!settings.purchasesEnabled) return { ...closed, state: "closed" };
    return {
      purchasesEnabled: true,
      checkoutEnabled: paymentReady === true,
      state: paymentReady === true ? "open" : "unconfigured",
    };
  } catch {
    return { ...closed, state: "unavailable" };
  }
}
