import { updateAdminLocation } from "../../../../server/admin/catalog.ts";
import { adminRoute } from "../../../../server/admin/http.ts";

export const PUT = adminRoute(
  async (pool, input, context, admin) =>
    updateAdminLocation(pool, context.params["key"], input, admin.actorId),
  true,
);
