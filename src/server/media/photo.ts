import type { ProductPhoto } from "../../domain/catalog.ts";
import { PhotoError } from "./errors.ts";

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validAlt(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    [...value].length <= 300 &&
    !/[\p{Cc}\ud800-\udfff]/u.test(value)
  );
}

export function projectProductPhoto(input: unknown): ProductPhoto | null {
  if (input === null || input === undefined) return null;
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new PhotoError(503, "INVALID_PHOTO");
  const photo = input as Record<string, unknown>;
  if (
    typeof photo["id"] !== "string" ||
    !UUID_PATTERN.test(photo["id"]) ||
    !validAlt(photo["alt"]) ||
    !boundedInteger(photo["width"], 2048) ||
    !boundedInteger(photo["height"], 2048) ||
    !boundedInteger(photo["bytes"], 4 * 1024 * 1024)
  )
    throw new PhotoError(503, "INVALID_PHOTO");
  return {
    id: photo["id"].toLowerCase(),
    alt: photo["alt"],
    width: photo["width"],
    height: photo["height"],
    bytes: photo["bytes"],
  };
}

export function boundedInteger(value: unknown, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= max
  );
}
