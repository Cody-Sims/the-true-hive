export interface PhotoUploadInput {
  operationId: string;
  expectedRevision: number;
  alt: string;
  file: Buffer;
}

function invalid(): never {
  throw new PhotoError(
    400,
    "INVALID_PHOTO_INPUT",
    "The photo request is invalid.",
  );
}

export function validatePhotoOperation(input: unknown): {
  operationId: string;
  expectedRevision: number;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
  const value = input as Record<string, unknown>;
  if (
    typeof value["operationId"] !== "string" ||
    !UUID_PATTERN.test(value["operationId"]) ||
    !boundedInteger(value["expectedRevision"], 2147483646)
  )
    invalid();
  return {
    operationId: value["operationId"].toLowerCase(),
    expectedRevision: value["expectedRevision"],
  };
}

function inputError(error: unknown): never {
  if (error instanceof PhotoError) throw error;
  if (error instanceof HttpInputError)
    throw new PhotoError(
      error.status,
      error.code,
      "The photo request is invalid.",
    );
  invalid();
}

export async function readPhotoMultipart(
  request: Request,
): Promise<PhotoUploadInput> {
  try {
    const type = request.headers.get("content-type");
    if (!type || !/^multipart\/form-data\s*;/i.test(type)) invalid();
    const raw = await readRawBody(request, MAX_INPUT_BYTES + 65536);
    const length = request.headers.get("content-length");
    if (length !== null && Number(length) !== raw.length) invalid();
    const form = await new Response(new Uint8Array(raw), {
      headers: { "content-type": type },
    }).formData();
    const allowed = ["operationId", "expectedRevision", "alt", "file"];
    const seen = new Set<string>();
    for (const [name] of form) {
      if (!allowed.includes(name) || seen.has(name)) invalid();
      seen.add(name);
    }
    if (seen.size !== 4) invalid();
    const revision = form.get("expectedRevision");
    const alt = form.get("alt");
    const file = form.get("file");
    if (
      typeof revision !== "string" ||
      !/^[1-9]\d{0,9}$/.test(revision) ||
      !validAlt(alt) ||
      !(file instanceof File)
    )
      invalid();
    if (file.size > MAX_INPUT_BYTES)
      throw new PhotoError(413, "IMAGE_TOO_LARGE", "The image is too large.");
    if (raw.length - file.size > 65536)
      throw new PhotoError(
        413,
        "BODY_TOO_LARGE",
        "The photo request is too large.",
      );
    if (file.size === 0) invalid();
    const operation = validatePhotoOperation({
      operationId: form.get("operationId"),
      expectedRevision: Number(revision),
    });
    return { ...operation, alt, file: Buffer.from(await file.arrayBuffer()) };
  } catch (error) {
    inputError(error);
  }
}

export async function readPhotoDelete(request: Request): Promise<{
  operationId: string;
  expectedRevision: number;
}> {
  try {
    const input: unknown = await readJsonBody(request, 4096);
    const operation = validatePhotoOperation(input);
    if (
      Object.keys(input as object).some(
        (key) => !["operationId", "expectedRevision"].includes(key),
      )
    )
      invalid();
    return operation;
  } catch (error) {
    inputError(error);
  }
}
import { readJsonBody, readRawBody, HttpInputError } from "../http-input.ts";
import { PhotoError } from "./errors.ts";
import { boundedInteger, UUID_PATTERN, validAlt } from "./photo.ts";
import { MAX_INPUT_BYTES } from "./normalize.ts";
