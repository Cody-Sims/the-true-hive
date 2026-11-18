import { adminRoute, readAdminQuery } from "../../../../server/admin/http.ts";
import { getAdminPickupDashboard } from "../../../../server/pickup/service.ts";

export const GET = adminRoute(async (pool, _input, context) => {
  readAdminQuery(context.url, []);
  return getAdminPickupDashboard(pool);
});
