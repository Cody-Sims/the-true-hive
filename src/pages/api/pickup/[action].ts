import type { APIRoute } from "astro";
import { readConfig } from "../../../server/config.ts";
import { getAdminPool } from "../../../server/admin/pool.ts";
import { readJsonBody } from "../../../server/http-input.ts";
import {
  createCustomerPickupHandler,
  type CustomerPickupDependencies,
} from "../../../server/pickup/customer-http.ts";
import {
  getCustomerPickupContext,
  getPickupAvailability,
  bookPickup,
  requestPickupHelp,
} from "../../../server/pickup/service.ts";
import { createCheckoutAttemptLimiter } from "../checkout.ts";

const dependencies: CustomerPickupDependencies = {
  getOrigin: () => readConfig().siteOrigin,
  allowAttempt: createCheckoutAttemptLimiter(Date.now, 120),
  readJsonBody,
  context: (hash) => getCustomerPickupContext(getAdminPool(), hash),
  availability: (input, actor) =>
    getPickupAvailability(getAdminPool(), input, actor),
  booking: (input, actor) => bookPickup(getAdminPool(), input, actor),
  help: (input, actor) => requestPickupHelp(getAdminPool(), input, actor),
};
const handle: APIRoute = ({ request, params }) =>
  createCustomerPickupHandler(params["action"] ?? "", dependencies)(request);
export const GET = handle;
export const POST = handle;
