import { createHash } from "node:crypto";
import type { AdminOrderState } from "../../domain/admin.ts";
import type { CheckoutExpiry } from "../../domain/commerce.ts";

export class OrderInputError extends Error {}
export class OrderConflictError extends Error {}
export class OrderNotFoundError extends Error {}

export const MAX_INTEGER = 2147483647;

export function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new OrderInputError("An order operation is required.");
  return input as Record<string, unknown>;
}

export function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new OrderInputError("A valid UUID is required.");
  return value.toLowerCase();
}

export function key(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(value))
    throw new OrderInputError("A valid record key is required.");
  return value;
}

export function positiveInteger(value: unknown, max = MAX_INTEGER): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > max
  )
    throw new OrderInputError("A bounded positive whole number is required.");
  return value;
}

export function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export interface CheckoutIntent {
  operationId: string;
  locationKey: string;
  lines: { variantKey: string; quantity: number }[];
}

export function validateCheckout(
  input: unknown,
  locationKey: unknown,
): CheckoutIntent {
  const value = record(input);
  const operationId = uuid(value["operationId"]);
  const location = key(locationKey);
  const rawLines = value["lines"];
  if (!Array.isArray(rawLines) || rawLines.length < 1 || rawLines.length > 20)
    throw new OrderInputError(
      "Checkout requires one to twenty distinct lines.",
    );
  const lines = rawLines.map((raw) => {
    const line = record(raw);
    return {
      variantKey: key(line["variantKey"]),
      quantity: positiveInteger(line["quantity"], 100),
    };
  });
  if (new Set(lines.map((line) => line.variantKey)).size !== lines.length)
    throw new OrderInputError(
      "Checkout lines must have distinct variant keys.",
    );
  lines.sort((a, b) =>
    a.variantKey < b.variantKey ? -1 : a.variantKey > b.variantKey ? 1 : 0,
  );
  return { operationId, locationKey: location, lines };
}

export function providerId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,255}$/.test(value))
    throw new OrderInputError("A bounded provider identity is required.");
  return value;
}

export function validateExpiry(input: unknown): CheckoutExpiry {
  const value = record(input);
  return {
    eventId: providerId(value["eventId"]),
    orderId: uuid(value["orderId"]),
    sessionId: providerId(value["sessionId"]),
  };
}

export interface PaymentReceipt extends CheckoutExpiry {
  paymentIntentId: string | null;
  totalMinor: number;
  currency: string;
}

export function validatePayment(input: unknown): PaymentReceipt {
  const value = record(input);
  const currency = value["currency"];
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency))
    throw new OrderInputError("A normalized payment currency is required.");
  return {
    ...validateExpiry(value),
    paymentIntentId:
      value["paymentIntentId"] === null
        ? null
        : providerId(value["paymentIntentId"]),
    totalMinor: positiveInteger(value["totalMinor"]),
    currency,
  };
}

export function expiryDate(value: unknown): Date {
  if (
    typeof value !== "string" ||
    value.length > 40 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  )
    throw new OrderInputError("A valid checkout expiry is required.");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new OrderInputError("A valid checkout expiry is required.");
  return date;
}

export function reconciliationReason(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 500)
    throw new OrderInputError("A bounded reconciliation reason is required.");
  return value.trim();
}

function paginationInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed =
    typeof value === "string" && /^\d{1,5}$/.test(value)
      ? Number(value)
      : value;
  if (parsed === undefined) return fallback;
  if (
    typeof parsed !== "number" ||
    !Number.isInteger(parsed) ||
    parsed < min ||
    parsed > max
  )
    throw new OrderInputError("Valid bounded pagination is required.");
  return parsed;
}

export function orderQuery(input?: unknown): {
  limit: number;
  offset: number;
  state: AdminOrderState | null;
  locationKey: string | null;
} {
  const value = input === undefined ? {} : record(input);
  const states = [
    "creating",
    "open",
    "paid",
    "expired",
    "picked_up",
    "reconciliation_required",
  ];
  const state = value["state"];
  if (
    state !== undefined &&
    (typeof state !== "string" || !states.includes(state))
  )
    throw new OrderInputError("A valid order state is required.");
  return {
    limit: paginationInteger(value["limit"], 20, 1, 100),
    offset: paginationInteger(value["offset"], 0, 0, 10000),
    state: (state as AdminOrderState | undefined) ?? null,
    locationKey:
      value["locationKey"] === undefined ? null : key(value["locationKey"]),
  };
}

export function validatePickup(
  input: unknown,
  actorId: unknown,
): {
  operationId: string;
  expectedRevision: number;
  actorId: string;
} {
  const value = record(input);
  if (typeof actorId !== "string" || !/^[a-zA-Z0-9._:-]{1,128}$/.test(actorId))
    throw new OrderInputError("A trusted operator identity is required.");
  return {
    operationId: uuid(value["operationId"]),
    expectedRevision: positiveInteger(value["expectedRevision"]),
    actorId,
  };
}
