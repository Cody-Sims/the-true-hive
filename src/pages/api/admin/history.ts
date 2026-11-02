import { listAdminHistory } from "../../../server/admin/catalog.ts";
import { adminRoute, readAdminQuery } from "../../../server/admin/http.ts";

export const GET = adminRoute(async (pool, _input, context) => ({
  movements: await listAdminHistory(
    pool,
    readAdminQuery(context.url, [
      "limit",
      "offset",
      "variantKey",
      "locationKey",
    ]),
  ),
}));
