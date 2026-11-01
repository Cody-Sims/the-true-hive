import {
  getAdminProduct,
  updateAdminProduct,
} from "../../../../server/admin/catalog.ts";
import { AdminError } from "../../../../server/admin/errors.ts";
import { adminRoute } from "../../../../server/admin/http.ts";

export const GET = adminRoute(async (pool, _input, context) => {
  const product = await getAdminProduct(pool, context.params["key"]);
  if (!product)
    throw new AdminError(404, "NOT_FOUND", "The product does not exist.");
  return { product };
});

export const PUT = adminRoute(
  async (pool, input, context, admin) =>
    updateAdminProduct(pool, context.params["key"], input, admin.actorId),
  true,
);
