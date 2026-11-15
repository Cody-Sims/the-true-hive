import { createBarcodeRoute } from "../../../../../server/barcodes.ts";
import { getAdminPool } from "../../../../../server/admin/pool.ts";
import { readAdminConfig } from "../../../../../server/admin/config.ts";

export const GET = createBarcodeRoute({
  pool: getAdminPool,
  config: readAdminConfig,
});
