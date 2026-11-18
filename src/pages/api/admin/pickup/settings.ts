import { adminRoute } from "../../../../server/admin/http.ts";
import { updatePickupSettings } from "../../../../server/pickup/service.ts";

export const POST = adminRoute(
  (pool, input, _context, actor) =>
    updatePickupSettings(pool, input, actor.actorId),
  true,
);
