import { adjustAdminStock } from "../../../server/admin/catalog.ts";
import { adminRoute } from "../../../server/admin/http.ts";

export const POST = adminRoute(
  async (pool, input, _context, admin) =>
    adjustAdminStock(pool, input, admin.actorId),
  true,
);
