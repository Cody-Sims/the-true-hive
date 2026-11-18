import { adminRoute } from "../../../../server/admin/http.ts";
import { revokePickupAccess } from "../../../../server/pickup/service.ts";

export const POST = adminRoute(
  (pool, input, _context, actor) =>
    revokePickupAccess(pool, input, actor.actorId),
  true,
);
