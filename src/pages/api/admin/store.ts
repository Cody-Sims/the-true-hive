import {
  getAdminStoreSettings,
  updateAdminStoreSettings,
} from "../../../server/admin/store.ts";
import { adminRoute } from "../../../server/admin/http.ts";

export const GET = adminRoute(async (pool) => ({
  settings: await getAdminStoreSettings(pool),
}));

export const PUT = adminRoute(
  async (pool, input, _context, admin) =>
    updateAdminStoreSettings(pool, input, admin.actorId),
  true,
);
