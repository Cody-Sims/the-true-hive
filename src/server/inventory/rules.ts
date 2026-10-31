export class InventoryInputError extends Error {}
export class InventoryConflictError extends Error {}
export class InventoryNotFoundError extends Error {}

export interface StockAdjustment {
  variantKey: string;
  locationKey: string;
  delta: number;
  operationId: string;
  actorId: string;
  reason: string;
}

export function isRecordKey(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/.test(value);
}

export function validateAdjustment(input: unknown): StockAdjustment {
  if (!input || typeof input !== "object")
    throw new InventoryInputError("An inventory operation is required.");
  const value = input as Record<string, unknown>;
  if (!isRecordKey(value["variantKey"]) || !isRecordKey(value["locationKey"])) {
    throw new InventoryInputError(
      "Valid variant and location keys are required.",
    );
  }
  const delta = value["delta"];
  if (
    typeof delta !== "number" ||
    !Number.isInteger(delta) ||
    delta === 0 ||
    Math.abs(delta) > 2147483647
  ) {
    throw new InventoryInputError(
      "The count change must be a nonzero, bounded whole number.",
    );
  }
  const operationId = value["operationId"];
  if (
    typeof operationId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      operationId,
    )
  ) {
    throw new InventoryInputError("A UUID operation ID is required.");
  }
  const actorId = value["actorId"];
  if (typeof actorId !== "string" || !/^[a-z0-9._:-]{1,128}$/i.test(actorId)) {
    throw new InventoryInputError("A trusted operator key is required.");
  }
  const reason =
    typeof value["reason"] === "string" ? value["reason"].trim() : "";
  if (!reason || reason.length > 500)
    throw new InventoryInputError(
      "An audit reason of at most 500 characters is required.",
    );
  return {
    variantKey: value["variantKey"],
    locationKey: value["locationKey"],
    delta,
    operationId: operationId.toLowerCase(),
    actorId,
    reason,
  };
}

export function nextOnHand(
  balance: { onHand: number; committed: number; unavailable: number },
  delta: number,
) {
  const values = [balance.onHand, balance.committed, balance.unavailable];
  if (
    values.some(
      (value) => !Number.isInteger(value) || value < 0 || value > 2147483647,
    )
  ) {
    throw new InventoryConflictError(
      "The current inventory balance is invalid.",
    );
  }
  const next = balance.onHand + delta;
  if (
    !Number.isInteger(delta) ||
    !Number.isInteger(next) ||
    next > 2147483647 ||
    next < balance.committed + balance.unavailable
  ) {
    throw new InventoryConflictError(
      "The correction exceeds uncommitted physical stock or the supported count.",
    );
  }
  return next;
}
