import {
  createAdminProduct,
  listAdminProducts,
} from "../../../../server/admin/catalog.ts";
import { adminRoute, readAdminQuery } from "../../../../server/admin/http.ts";

export const GET = adminRoute(async (pool, _input, context) =>
  listAdminProducts(
    pool,
    readAdminQuery(context.url, ["limit", "offset", "search"]),
  ),
);

export const POST = adminRoute(
  async (pool, input, _context, admin) =>
    createAdminProduct(pool, input, admin.actorId),
  true,
  true,
);
