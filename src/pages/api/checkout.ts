import type { APIRoute } from "astro";
import {
  readCheckoutConfig,
  type CheckoutConfig,
} from "../../server/commerce/config.ts";
import {
  CheckoutBoundaryError,
  checkoutErrorResponse,
  getCheckoutServices,
  validateCheckoutIntent,
  CHECKOUT_JSON_LIMIT,
  type CheckoutServices,
} from "../../server/commerce/stripe.ts";
import { jsonResponse } from "../../server/http.ts";

export interface CheckoutHttpDependencies {
  getConfig(): CheckoutConfig;
  readJsonBody(request: Request, maxBytes: number): Promise<unknown>;
  getServices(): Promise<Pick<CheckoutServices, "createCheckout">>;
  allowAttempt(): boolean;
}

export function createCheckoutAttemptLimiter(
  now: () => number = Date.now,
  maximum = 60,
  windowMs = 60_000,
): () => boolean {
  if (
    !Number.isInteger(maximum) ||
    maximum < 1 ||
    maximum > 10000 ||
    !Number.isInteger(windowMs) ||
    windowMs < 100 ||
    windowMs > 3600000
  )
    throw new Error("Invalid checkout attempt budget.");
  let start = now();
  let count = 0;
  // A fixed process-wide budget deliberately does not trust proxy/IP headers.
  return () => {
    const current = now();
    if (current < start) return false;
    if (current - start >= windowMs) {
      start = current;
      count = 0;
    }
    if (count >= maximum) return false;
    count++;
    return true;
  };
}

export function createCheckoutHandler(dependencies: CheckoutHttpDependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      const config = dependencies.getConfig();
      if (config.mode !== "stripe-test") {
        throw new CheckoutBoundaryError(
          "CHECKOUT_DISABLED",
          503,
          "Test checkout is disabled.",
        );
      }
      if (
        new URL(request.url).origin !== config.siteOrigin ||
        request.headers.get("Origin") !== config.siteOrigin
      ) {
        throw new CheckoutBoundaryError(
          "INVALID_ORIGIN",
          403,
          "Use the configured storefront origin.",
        );
      }
      if (!dependencies.allowAttempt()) {
        throw new CheckoutBoundaryError(
          "CHECKOUT_RATE_LIMITED",
          429,
          "Too many checkout attempts. Retry later.",
        );
      }
      const contentType = request.headers.get("Content-Type") ?? "";
      if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)) {
        throw new CheckoutBoundaryError(
          "INVALID_BODY",
          415,
          "Use an application/json request.",
        );
      }
      const input = validateCheckoutIntent(
        await dependencies.readJsonBody(request, CHECKOUT_JSON_LIMIT),
      );
      const services = await dependencies.getServices();
      const result = await services.createCheckout(input);
      return jsonResponse({ checkoutUrl: result.checkoutUrl });
    } catch (error) {
      const response = checkoutErrorResponse(error);
      if (response.status === 429) response.headers.set("Retry-After", "60");
      return response;
    }
  };
}

const handler = createCheckoutHandler({
  getConfig: readCheckoutConfig,
  getServices: getCheckoutServices,
  allowAttempt: createCheckoutAttemptLimiter(),
  async readJsonBody(request, maxBytes) {
    const { readJsonBody } = await import("../../server/http-input.ts");
    return readJsonBody(request, maxBytes);
  },
});

export const POST: APIRoute = ({ request }) => handler(request);
