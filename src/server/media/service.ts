import type { Pool } from "pg";
import type { PhotoUploadInput } from "./input.ts";
import {
  checkPhotoRevision,
  commitPhotoOperation,
  findPhotoReceipt,
  makePhotoIntent,
  type PhotoReceipt,
} from "./persistence.ts";
import type { PhotoStorage } from "./storage.ts";
import { normalizeProductPhoto } from "./normalize.ts";
import { photoError } from "./errors.ts";

export async function attachProductPhoto(
  pool: Pool,
  storage: () => PhotoStorage,
  productKey: unknown,
  input: PhotoUploadInput,
  actorId: string,
): Promise<PhotoReceipt> {
  try {
    const intent = makePhotoIntent(productKey, actorId, input);
    const recorded = await findPhotoReceipt(pool, intent);
    if (recorded) return recorded;
    await checkPhotoRevision(pool, intent);
    const normalized = await normalizeProductPhoto(input.file);
    const stored = await storage().create(
      intent.operationId,
      intent.hash,
      normalized,
    );
    // No product/stock locks are held during decoding or storage I/O.
    // Failed or uncertain commits leave private objects for an explicit retention policy.
    return await commitPhotoOperation(pool, intent, {
      id: intent.operationId,
      alt: input.alt,
      ...stored,
    });
  } catch (error) {
    throw photoError(error);
  }
}
