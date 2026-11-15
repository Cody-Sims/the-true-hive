import { createHash } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import type { ProductPhoto } from "../../domain/catalog.ts";
import type { PhotoUploadInput } from "./input.ts";
import { validatePhotoOperation } from "./input.ts";
import { PhotoError, photoError } from "./errors.ts";
import {
  boundedInteger,
  projectProductPhoto,
  UUID_PATTERN,
  validAlt,
} from "./photo.ts";
import { MAX_INPUT_BYTES } from "./normalize.ts";
import { isRecordKey } from "../inventory/rules.ts";

export interface PhotoIntent {
  operationId: string;
  actorId: string;
  productKey: string;
  expectedRevision: number;
  action: "attach_product_photo" | "remove_product_photo";
  hash: string;
  alt?: string;
}

export interface PhotoReceipt {
  productKey: string;
  revision: number;
  photo: ProductPhoto | null;
}

export function makePhotoIntent(
  key: unknown,
  actorId: string,
  input: PhotoUploadInput | { operationId: string; expectedRevision: number },
): PhotoIntent {
  const operation = validatePhotoOperation(input);
  if (!isRecordKey(key) || !/^[a-z0-9._:-]{1,128}$/i.test(actorId))
    throw new PhotoError(
      400,
      "INVALID_PHOTO_INPUT",
      "The photo request is invalid.",
    );
  let alt: string | undefined;
  let originalHash: string | null = null;
  if ("file" in input || "alt" in input) {
    if (
      !("file" in input) ||
      !Buffer.isBuffer(input.file) ||
      !validAlt(input.alt) ||
      input.file.length === 0
    )
      throw new PhotoError(
        400,
        "INVALID_PHOTO_INPUT",
        "The photo request is invalid.",
      );
    if (input.file.length > MAX_INPUT_BYTES)
      throw new PhotoError(413, "IMAGE_TOO_LARGE", "The image is too large.");
    alt = input.alt;
    originalHash = createHash("sha256").update(input.file).digest("hex");
  }
  const action =
    originalHash === null ? "remove_product_photo" : "attach_product_photo";
  const hash = createHash("sha256")
    .update(
      JSON.stringify([
        "true-hive-product-photo-v1",
        actorId,
        action,
        key,
        operation.expectedRevision,
        alt ?? null,
        originalHash,
      ]),
    )
    .digest("hex");
  return {
    ...operation,
    actorId,
    productKey: key,
    action,
    hash,
    ...(alt === undefined ? {} : { alt }),
  };
}

interface OperationRow extends QueryResultRow {
  actor_key: string;
  action: string;
  resource_key: string;
  request_hash: string;
  result: PhotoReceipt;
}

function operationConflict(): never {
  throw new PhotoError(
    409,
    "OPERATION_CONFLICT",
    "This operation ID was already used for another intent.",
  );
}

async function recordedReceipt(
  database: Pick<Pool, "query"> | PoolClient,
  intent: PhotoIntent,
): Promise<PhotoReceipt | null> {
  const row = (
    await database.query<OperationRow>(
      "SELECT actor_key,action,resource_key,request_hash,result FROM admin_operations WHERE operation_id=$1",
      [intent.operationId],
    )
  ).rows[0];
  if (!row) return null;
  if (
    row.actor_key !== intent.actorId ||
    row.action !== intent.action ||
    row.resource_key !== intent.productKey ||
    row.request_hash !== intent.hash
  )
    operationConflict();
  const result = row.result;
  if (
    !result ||
    result.productKey !== intent.productKey ||
    !boundedInteger(result.revision, 2147483647)
  )
    throw new PhotoError(503, "INVALID_PHOTO_RECEIPT");
  const photo = projectProductPhoto(result.photo);
  if (
    (intent.action === "attach_product_photo" &&
      (!photo ||
        photo.id !== intent.operationId ||
        photo.alt !== intent.alt)) ||
    (intent.action === "remove_product_photo" && photo !== null)
  )
    throw new PhotoError(503, "INVALID_PHOTO_RECEIPT");
  return { productKey: result.productKey, revision: result.revision, photo };
}

export async function findPhotoReceipt(
  pool: Pool,
  intent: PhotoIntent,
): Promise<PhotoReceipt | null> {
  try {
    return await recordedReceipt(pool, intent);
  } catch (error) {
    throw photoError(error);
  }
}

function checkRevision(
  row: { revision: number } | undefined,
  intent: PhotoIntent,
) {
  if (!row)
    throw new PhotoError(
      404,
      "PRODUCT_NOT_FOUND",
      "The product does not exist.",
    );
  if (row.revision !== intent.expectedRevision)
    throw new PhotoError(
      409,
      "REVISION_CONFLICT",
      "The product changed. Reload it before retrying.",
    );
}

export async function checkPhotoRevision(
  pool: Pool,
  intent: PhotoIntent,
): Promise<void> {
  try {
    const row = (
      await pool.query<{ revision: number }>(
        "SELECT revision FROM products WHERE product_key=$1",
        [intent.productKey],
      )
    ).rows[0];
    checkRevision(row, intent);
  } catch (error) {
    throw photoError(error);
  }
}

export async function commitPhotoOperation(
  pool: Pool,
  intent: PhotoIntent,
  input: ProductPhoto | null,
): Promise<PhotoReceipt> {
  const photo = projectProductPhoto(input);
  if (
    (intent.action === "attach_product_photo" &&
      (!photo ||
        photo.id !== intent.operationId ||
        photo.alt !== intent.alt)) ||
    (intent.action === "remove_product_photo" && photo !== null)
  )
    throw new PhotoError(400, "INVALID_PHOTO_INPUT");
  let client: PoolClient | undefined;
  let discard = false;
  let committing = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))",
      [intent.operationId],
    );
    const replay = await recordedReceipt(client, intent);
    if (replay) {
      committing = true;
      await client.query("COMMIT");
      committing = false;
      return replay;
    }
    const row = (
      await client.query<{ revision: number; photo: unknown }>(
        "SELECT revision,photo FROM products WHERE product_key=$1 FOR UPDATE",
        [intent.productKey],
      )
    ).rows[0];
    checkRevision(row, intent);
    const before = {
      revision: row!.revision,
      photo: projectProductPhoto(row!.photo),
    };
    if (intent.action === "remove_product_photo" && !before.photo)
      throw new PhotoError(404, "PHOTO_NOT_FOUND", "The photo does not exist.");
    const after = { revision: before.revision + 1, photo };
    const result = { productKey: intent.productKey, ...after };
    await client.query(
      "UPDATE products SET photo=$2::jsonb,revision=revision+1 WHERE product_key=$1",
      [intent.productKey, photo === null ? null : JSON.stringify(photo)],
    );
    await client.query(
      "INSERT INTO admin_operations (operation_id,actor_key,action,resource_key,request_hash,before_data,after_data,result) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)",
      [
        intent.operationId,
        intent.actorId,
        intent.action,
        intent.productKey,
        intent.hash,
        JSON.stringify(before),
        JSON.stringify(after),
        JSON.stringify(result),
      ],
    );
    committing = true;
    await client.query("COMMIT");
    committing = false;
    return result;
  } catch (error) {
    discard = committing;
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {
        discard = true;
      }
    }
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      ["40001", "40P01", "23505"].includes(String(error.code))
    )
      throw new PhotoError(
        409,
        "PHOTO_CONFLICT",
        "A competing change occurred. Reload the product.",
      );
    throw photoError(error);
  } finally {
    client?.release(discard);
  }
}

export async function readPrivateProductPhoto(
  pool: Pool,
  key: unknown,
): Promise<ProductPhoto | null> {
  if (!isRecordKey(key)) throw new PhotoError(400, "INVALID_PHOTO_INPUT");
  try {
    const row = (
      await pool.query<{ photo: unknown }>(
        "SELECT photo FROM products WHERE product_key=$1",
        [key],
      )
    ).rows[0];
    return row ? projectProductPhoto(row.photo) : null;
  } catch (error) {
    throw photoError(error);
  }
}

export async function readPublishedProductPhoto(
  pool: Pool,
  id: unknown,
): Promise<ProductPhoto | null> {
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) return null;
  try {
    const row = (
      await pool.query<{ photo: unknown }>(
        `SELECT p.photo FROM products p
       WHERE p.photo->>'id'=$1 AND p.published AND p.kind='active' AND NOT p.archived
       LIMIT 1`,
        [id.toLowerCase()],
      )
    ).rows[0];
    return row ? projectProductPhoto(row.photo) : null;
  } catch (error) {
    throw photoError(error);
  }
}
