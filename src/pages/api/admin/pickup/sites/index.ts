import { adminRoute } from "../../../../../server/admin/http.ts";
import { createPickupSite } from "../../../../../server/pickup/service.ts";

export const POST = adminRoute(
  (pool, input, _context, actor) =>
    createPickupSite(pool, input, actor.actorId),
  true,
  true,
);
