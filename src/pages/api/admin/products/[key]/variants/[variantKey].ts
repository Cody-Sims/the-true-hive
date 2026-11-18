import { deleteAdminVariant } from "../../../../../../server/admin/catalog.ts";
import { adminRoute } from "../../../../../../server/admin/http.ts";

export const DELETE = adminRoute(
  async (pool, input, context, admin) =>
    deleteAdminVariant(
      pool,
      context.params["key"],
      context.params["variantKey"],
      input,
      admin.actorId,
    ),
  true,
);
