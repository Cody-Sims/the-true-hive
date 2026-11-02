import type { APIRoute } from "astro";
import {
  readCheckoutConfig,
  type CheckoutConfig,
} from "../../../server/commerce/config.ts";
import {
  CheckoutBoundaryError,
  checkoutErrorResponse,
  getCheckoutServices,
  STRIPE_WEBHOOK_LIMIT,
  type CheckoutServices,
} from "../../../server/commerce/stripe.ts";
import { jsonResponse } from "../../../server/http.ts";

export interface StripeWebhookHttpDependencies {
  getConfig(): CheckoutConfig;
  readRawBody(request: Request, maxBytes: number): Promise<Uint8Array>;
  getServices(): Promise<Pick<CheckoutServices, "handleWebhook">>;
}

export function createStripeWebhookHandler(
  dependencies: StripeWebhookHttpDependencies,
) {
  return async (request: Request): Promise<Response> => {
    try {
      if (dependencies.getConfig().mode !== "stripe-test") {
        throw new CheckoutBoundaryError(
          "CHECKOUT_DISABLED",
          503,
          "Test checkout is disabled.",
        );
      }
      const signature = request.headers.get("stripe-signature");
      if (!signature || signature.length > 2048) {
        throw new CheckoutBoundaryError(
          "INVALID_SIGNATURE",
          400,
          "Invalid Stripe signature.",
        );
      }
      const raw = await dependencies.readRawBody(request, STRIPE_WEBHOOK_LIMIT);
      if (raw.byteLength > STRIPE_WEBHOOK_LIMIT) {
        throw new CheckoutBoundaryError(
          "BODY_TOO_LARGE",
          413,
          "The request body is too large.",
        );
      }
      const services = await dependencies.getServices();
      const result = await services.handleWebhook(raw, signature);
      return jsonResponse({ received: true, result: result.result });
    } catch (error) {
      return checkoutErrorResponse(error);
    }
  };
}

const handler = createStripeWebhookHandler({
  getConfig: readCheckoutConfig,
  getServices: getCheckoutServices,
  async readRawBody(request, maxBytes) {
    const { readRawBody } = await import("../../../server/http-input.ts");
    return readRawBody(request, maxBytes);
  },
});

export const POST: APIRoute = ({ request }) => handler(request);
