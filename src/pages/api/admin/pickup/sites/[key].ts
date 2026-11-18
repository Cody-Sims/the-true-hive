import { adminRoute } from "../../../../../server/admin/http.ts";
import { PickupError } from "../../../../../server/pickup/rules.ts";
import {
  getPickupSite,
  updatePickupSite,
} from "../../../../../server/pickup/service.ts";

export const GET = adminRoute(async (pool, _input, context) => {
  const site = await getPickupSite(pool, context.params["key"] ?? "");
  if (!site)
    throw new PickupError(
      404,
      "PICKUP_SITE_NOT_FOUND",
      "This pickup point does not exist.",
    );
  return { site };
});
export const PUT = adminRoute(
  (pool, input, context, actor) =>
    updatePickupSite(pool, context.params["key"] ?? "", input, actor.actorId),
  true,
);
