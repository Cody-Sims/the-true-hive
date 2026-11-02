import { HttpInputError } from "../http-input.ts";
import { jsonResponse } from "../http.ts";
import {
  OrderInputError,
  OrderConflictError,
  OrderNotFoundError,
} from "./rules.ts";

export function orderResponse(value: unknown, status = 200): Response {
  const response = jsonResponse(value, status);
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export function orderErrorResponse(error: unknown): Response {
  if (error instanceof OrderInputError)
    return orderResponse(
      { error: { code: "INVALID_INPUT", message: error.message } },
      400,
    );
  if (error instanceof HttpInputError)
    return orderResponse(
      {
        error: {
          code: error.code,
          message: "The request body is invalid or exceeds the allowed size.",
        },
      },
      400,
    );
  if (error instanceof OrderNotFoundError)
    return orderResponse(
      { error: { code: "NOT_FOUND", message: error.message } },
      404,
    );
  if (error instanceof OrderConflictError)
    return orderResponse(
      { error: { code: "CONFLICT", message: error.message } },
      409,
    );
  return orderResponse(
    {
      error: {
        code: "UNAVAILABLE",
        message:
          "The order service is unavailable. Retry the same operation after recovery.",
      },
    },
    503,
  );
}

export function unauthorizedOrderResponse(): Response {
  return orderResponse(
    {
      error: {
        code: "UNAUTHORIZED",
        message: "Administrator access is required.",
      },
    },
    401,
  );
}
