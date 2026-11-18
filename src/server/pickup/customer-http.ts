import type {
  CustomerPickupContext,
  PickupAvailability,
  PickupMutationReceipt,
} from "../../domain/pickup.ts";
import type { PickupActor } from "./service.ts";
import { pickupErrorResponse } from "./http.ts";
import {
  PickupError,
  validateAvailabilityQuery,
  validateBookingIntent,
  validateOrderMutation,
} from "./rules.ts";
import { readBuyerAccess, requireBuyerMutation } from "./access.ts";
import { jsonResponse } from "../http.ts";

export interface CustomerPickupDependencies {
  getOrigin(): string;
  allowAttempt(): boolean;
  readJsonBody(request: Request, maximum: number): Promise<unknown>;
  context(hash: string): Promise<CustomerPickupContext>;
  availability(input: unknown, actor: PickupActor): Promise<PickupAvailability>;
  booking(input: unknown, actor: PickupActor): Promise<PickupMutationReceipt>;
  help(input: unknown, actor: PickupActor): Promise<PickupMutationReceipt>;
}

export function readPickupAvailabilityQuery(url: URL) {
  const query: Record<string, unknown> = {};
  for (const [key, value] of url.searchParams) {
    if (
      !["orderId", "siteKey", "from", "days"].includes(key) ||
      Object.hasOwn(query, key)
    )
      throw new PickupError(
        400,
        "INVALID_PICKUP_INPUT",
        "Use each supported availability field only once.",
      );
    if (key === "days" && !/^[1-7]$/.test(value))
      throw new PickupError(
        400,
        "INVALID_PICKUP_INPUT",
        "Request one to seven days.",
      );
    query[key] = key === "days" ? Number(value) : value;
  }
  return validateAvailabilityQuery(query);
}

export function createCustomerPickupHandler(
  action: string,
  dependencies: CustomerPickupDependencies,
) {
  return async (request: Request): Promise<Response> => {
    try {
      if (!["context", "availability", "booking", "help"].includes(action))
        throw new PickupError(
          404,
          "NOT_FOUND",
          "This pickup action does not exist.",
        );
      const mutation = action === "booking" || action === "help";
      if (request.method !== (mutation ? "POST" : "GET"))
        throw new PickupError(
          405,
          "INVALID_METHOD",
          "Use the supported pickup method.",
        );
      const origin = dependencies.getOrigin();
      const buyer = mutation
        ? requireBuyerMutation(request, origin)
        : readBuyerAccess(request, origin);
      if (!buyer)
        throw new PickupError(
          401,
          "PICKUP_ACCESS_REQUIRED",
          "Use the same browser that started checkout, or contact the operator for help.",
        );
      if (!dependencies.allowAttempt())
        throw new PickupError(
          429,
          "PICKUP_RATE_LIMITED",
          "Too many pickup requests. Retry in a minute.",
        );
      const actor: PickupActor = { kind: "buyer", hash: buyer.hash };
      let result: unknown;
      if (action === "availability") {
        result = await dependencies.availability(
          readPickupAvailabilityQuery(new URL(request.url)),
          actor,
        );
      } else {
        if (new URL(request.url).search)
          throw new PickupError(
            400,
            "INVALID_PICKUP_INPUT",
            "This pickup action does not accept query fields.",
          );
        if (action === "context")
          result = {
            ...(await dependencies.context(buyer.hash)),
            csrfToken: buyer.csrfToken,
          };
        else {
          const input = await dependencies.readJsonBody(request, 2048);
          result =
            action === "booking"
              ? await dependencies.booking(validateBookingIntent(input), actor)
              : await dependencies.help(
                  validateOrderMutation(input, true),
                  actor,
                );
        }
      }
      const response = jsonResponse(result);
      response.headers.set("X-Robots-Tag", "noindex, nofollow");
      response.headers.set("Referrer-Policy", "no-referrer");
      return response;
    } catch (error) {
      return pickupErrorResponse(error);
    }
  };
}
