import {
  InventoryConflictError,
  InventoryInputError,
  InventoryNotFoundError,
} from "../inventory/rules.ts";

export class AdminError extends Error {
  status: 400 | 404 | 409 | 503;
  code: string;
  fields?: Record<string, string>;

  constructor(
    status: 400 | 404 | 409 | 503,
    code: string,
    message: string,
    fields?: Record<string, string>,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function adminError(error: unknown): AdminError {
  if (error instanceof AdminError) return error;
  if (error instanceof InventoryInputError)
    return new AdminError(400, "INVALID_INPUT", error.message);
  if (error instanceof InventoryConflictError)
    return new AdminError(409, "CONFLICT", error.message);
  if (error instanceof InventoryNotFoundError)
    return new AdminError(404, "NOT_FOUND", error.message);
  const database =
    error && typeof error === "object"
      ? (error as { code?: unknown; constraint?: unknown })
      : {};
  if (
    database.code === "23514" &&
    typeof database.constraint === "string" &&
    /^admin_operations_(before_data|after_data|result)_check$/.test(
      database.constraint,
    )
  )
    return new AdminError(
      400,
      "AUDIT_TOO_LARGE",
      "The product audit exceeds the 64 KiB record budget. Reduce its content.",
    );
  if (database.code === "23505")
    return new AdminError(
      409,
      "DUPLICATE_RECORD",
      "A key, slug or SKU is already in use.",
      { key: "Keys, slugs and SKUs must be unique." },
    );
  if (database.code === "40001" || database.code === "40P01")
    return new AdminError(
      409,
      "CONFLICT",
      "A competing change occurred. Review the current record and retry.",
    );
  return new AdminError(
    503,
    "ADMIN_UNAVAILABLE",
    "Inventory administration is temporarily unavailable.",
  );
}
