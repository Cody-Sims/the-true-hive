import { adminRoute } from "../../../../server/admin/http.ts";
import { getPickupAvailability } from "../../../../server/pickup/service.ts";
import { readPickupAvailabilityQuery } from "../../../../server/pickup/customer-http.ts";

export const GET = adminRoute((pool, _input, context, actor) =>
  getPickupAvailability(pool, readPickupAvailabilityQuery(context.url), {
    kind: "admin",
    actorId: actor.actorId,
  }),
);
