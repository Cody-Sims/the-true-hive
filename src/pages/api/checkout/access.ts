import type { APIRoute } from "astro";
import {
  readCheckoutConfig,
  type CheckoutConfig,
} from "../../../server/commerce/config.ts";
import { jsonResponse } from "../../../server/http.ts";
import { readJsonBody } from "../../../server/http-input.ts";
import { prepareBuyerAccess } from "../../../server/pickup/access.ts";
import { PickupError } from "../../../server/pickup/rules.ts";
import { pickupErrorResponse } from "../../../server/pickup/http.ts";
import { createCheckoutAttemptLimiter } from "../checkout.ts";

export interface CheckoutAccessDependencies {
  getConfig(): CheckoutConfig;
  readJsonBody(request: Request, maximum: number): Promise<unknown>;
  allowAttempt(): boolean;
  mint?(): string;
}

export function createCheckoutAccessHandler(
  dependencies: CheckoutAccessDependencies,
) {
  return async (request: Request): Promise<Response> => {
    try {
      const config = dependencies.getConfig();
      if (config.mode !== "stripe-test")
        throw new PickupError(
          503,
          "CHECKOUT_DISABLED",
          "Test checkout is disabled.",
        );
      if (!dependencies.allowAttempt())
        throw new PickupError(
          429,
          "CHECKOUT_RATE_LIMITED",
          "Too many checkout attempts. Retry later.",
        );
      const access = prepareBuyerAccess(
        request,
        config.siteOrigin,
        dependencies.mint,
      );
      const body = await dependencies.readJsonBody(request, 128);
      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        Object.keys(body).length
      )
        throw new PickupError(
          400,
          "INVALID_BODY",
          "Checkout access does not accept order or identity fields.",
        );
      const response = jsonResponse({
        ready: true,
        csrfToken: access.csrfToken,
      });
      response.headers.set("Set-Cookie", access.cookie);
      response.headers.set("X-Robots-Tag", "noindex, nofollow");
      response.headers.set("Referrer-Policy", "no-referrer");
      return response;
    } catch (error) {
      return pickupErrorResponse(error);
    }
  };
}

const handler = createCheckoutAccessHandler({
  getConfig: readCheckoutConfig,
  readJsonBody,
  allowAttempt: createCheckoutAttemptLimiter(),
});

export const POST: APIRoute = ({ request }) => handler(request);
