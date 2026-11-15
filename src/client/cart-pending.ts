import { parseCart, type CartLine } from "../domain/cart.ts";

const PENDING_KEY = "true-hive-checkout-pending";
export type PendingStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;
export interface PendingIntent {
  operationId: string;
  lines: CartLine[];
}

function decode(raw: string): PendingIntent {
  if (raw.length > 8192) throw new Error("Invalid pending checkout");
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid pending checkout");
  const record = value as Record<string, unknown>;
  if (
    record["version"] !== 1 ||
    Object.keys(record).some(
      (key) => !["version", "operationId", "lines"].includes(key),
    ) ||
    typeof record["operationId"] !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      record["operationId"],
    )
  )
    throw new Error("Invalid pending checkout");
  const parsed = parseCart(
    JSON.stringify({ version: 1, lines: record["lines"] }),
  );
  if (parsed.recovered || parsed.lines.length < 1)
    throw new Error("Invalid pending checkout");
  return { operationId: record["operationId"], lines: parsed.lines };
}

export function pendingBody(intent: PendingIntent): string {
  return JSON.stringify({
    operationId: intent.operationId,
    lines: intent.lines.map(({ variantKey, quantity }) => ({
      variantKey,
      quantity,
    })),
  });
}

function encode(intent: PendingIntent) {
  return JSON.stringify({ version: 1, ...intent });
}

export function readPendingIntent(
  storage: () => PendingStorage,
):
  | { kind: "empty" }
  | { kind: "pending"; intent: PendingIntent }
  | { kind: "blocked" } {
  try {
    const raw = storage().getItem(PENDING_KEY);
    return raw === null
      ? { kind: "empty" }
      : { kind: "pending", intent: decode(raw) };
  } catch {
    return { kind: "blocked" };
  }
}

export function writePendingIntent(
  storage: () => PendingStorage,
  intent: PendingIntent,
): boolean {
  try {
    const raw = encode(intent);
    const candidate = decode(raw);
    const target = storage();
    const existing = target.getItem(PENDING_KEY);
    if (
      existing !== null &&
      pendingBody(decode(existing)) !== pendingBody(candidate)
    )
      return false;
    target.setItem(PENDING_KEY, raw);
    return target.getItem(PENDING_KEY) === raw;
  } catch {
    return false;
  }
}

export function clearPendingIntent(
  storage: () => PendingStorage,
  intent: PendingIntent,
): boolean {
  try {
    const target = storage();
    const existing = target.getItem(PENDING_KEY);
    if (existing !== null) {
      if (pendingBody(decode(existing)) !== pendingBody(intent)) return false;
      target.removeItem(PENDING_KEY);
    }
    return target.getItem(PENDING_KEY) === null;
  } catch {
    return false;
  }
}
