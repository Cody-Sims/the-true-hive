import { randomUUID } from "node:crypto";
import { ConfigurationError } from "./config.ts";
import { CatalogUnavailableError } from "./catalog.ts";

export function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function errorResponse(error: unknown) {
  const requestId = randomUUID();
  if (error instanceof ConfigurationError) {
    return jsonResponse(
      {
        error: {
          code: "NOT_CONFIGURED",
          message: "The application needs configuration.",
          requestId,
        },
      },
      503,
    );
  }
  if (error instanceof CatalogUnavailableError) {
    return jsonResponse(
      { error: { code: error.code, message: error.message, requestId } },
      503,
    );
  }
  console.error("A request failed.", {
    requestId,
    type: error instanceof Error ? error.name : "unknown",
  });
  return jsonResponse(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "The request could not be completed.",
        requestId,
      },
    },
    500,
  );
}
