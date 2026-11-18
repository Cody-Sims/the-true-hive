import { HttpInputError } from "../http-input.ts";
import { jsonResponse } from "../http.ts";
import { PickupError, PickupImpactError } from "./rules.ts";

export function pickupErrorResponse(error: unknown): Response {
  const known = error instanceof PickupError || error instanceof HttpInputError;
  const status = known ? error.status : 503;
  const response = jsonResponse(
    {
      error: {
        code: known ? error.code : "PICKUP_UNAVAILABLE",
        message: known
          ? error.message
          : "Pickup records are temporarily unavailable. No change has been assumed.",
        ...(error instanceof PickupError && error.fields
          ? { fields: error.fields }
          : {}),
        ...(error instanceof PickupImpactError ? { impact: error.impact } : {}),
      },
    },
    status,
  );
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Referrer-Policy", "no-referrer");
  if (status === 429) response.headers.set("Retry-After", "60");
  return response;
}
