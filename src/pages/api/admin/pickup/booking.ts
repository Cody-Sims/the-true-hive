import { adminRoute } from "../../../../server/admin/http.ts";
import { bookPickup } from "../../../../server/pickup/service.ts";

export const POST = adminRoute(
  (pool, input, _context, actor) =>
    bookPickup(pool, input, { kind: "admin", actorId: actor.actorId }),
  true,
);
