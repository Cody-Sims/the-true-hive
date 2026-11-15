import type { ProductPhoto } from "../../domain/catalog.ts";
import type { ProductImagesConfig } from "./config.ts";
import type { NormalizedPhoto } from "./normalize.ts";
import { Storage, type FileMetadata } from "@google-cloud/storage";
import { PhotoError, photoError } from "./errors.ts";
import { boundedInteger, projectProductPhoto, UUID_PATTERN } from "./photo.ts";
import { MAX_OUTPUT_BYTES } from "./normalize.ts";

export type StoredPhoto = Pick<ProductPhoto, "width" | "height" | "bytes">;
export interface PhotoStorage {
  create(
    id: string,
    fingerprint: string,
    photo: NormalizedPhoto,
  ): Promise<StoredPhoto>;
  read(photo: ProductPhoto): Promise<Buffer>;
}

export function createGcsPhotoStorage(
  config: ProductImagesConfig,
  client?: Pick<Storage, "bucket">,
): PhotoStorage {
  if (
    !config.enabled ||
    !config.projectId ||
    !config.bucket ||
    !config.credentials
  )
    throw new PhotoError(503, "PHOTOS_DISABLED");
  let connection: Pick<Storage, "bucket">;
  try {
    connection =
      client ??
      new Storage({
        projectId: config.projectId,
        credentials: config.credentials,
        retryOptions: { maxRetries: 2, totalTimeout: 30 },
      });
  } catch {
    throw new PhotoError(503, "PHOTOS_UNAVAILABLE");
  }
  const bucket = connection.bucket(config.bucket);
  const path = (id: string) => {
    if (!UUID_PATTERN.test(id))
      throw new PhotoError(400, "INVALID_PHOTO_INPUT");
    return `product-images/${id.toLowerCase()}.webp`;
  };
  function stored(metadata: FileMetadata): StoredPhoto {
    const custom = metadata.metadata;
    const width = Number(custom?.["width"]);
    const height = Number(custom?.["height"]);
    const bytes = Number(custom?.["bytes"]);
    if (
      metadata.contentType !== "image/webp" ||
      custom?.["schema"] !== "true-hive-product-photo-v1" ||
      typeof custom["fingerprint"] !== "string" ||
      !/^[0-9a-f]{64}$/.test(custom["fingerprint"]) ||
      !boundedInteger(width, 2048) ||
      !boundedInteger(height, 2048) ||
      !boundedInteger(bytes, MAX_OUTPUT_BYTES) ||
      Number(metadata.size) !== bytes ||
      !/^[1-9]\d*$/.test(String(metadata.generation))
    )
      throw new PhotoError(503, "INVALID_STORED_PHOTO");
    return { width, height, bytes };
  }
  return {
    async create(id, fingerprint, photo) {
      try {
        const file = bucket.file(path(id));
        if (
          !/^[0-9a-f]{64}$/.test(fingerprint) ||
          !boundedInteger(photo.width, 2048) ||
          !boundedInteger(photo.height, 2048) ||
          !boundedInteger(photo.bytes, MAX_OUTPUT_BYTES) ||
          photo.bytes !== photo.data.length
        )
          throw new PhotoError(503, "INVALID_NORMALIZED_PHOTO");
        try {
          await file.save(photo.data, {
            resumable: false,
            validation: "crc32c",
            timeout: 30000,
            preconditionOpts: { ifGenerationMatch: 0 },
            metadata: {
              contentType: "image/webp",
              cacheControl: "private, no-store",
              metadata: {
                schema: "true-hive-product-photo-v1",
                fingerprint,
                width: String(photo.width),
                height: String(photo.height),
                bytes: String(photo.bytes),
              },
            },
          });
          return {
            width: photo.width,
            height: photo.height,
            bytes: photo.bytes,
          };
        } catch (error) {
          if (
            !error ||
            typeof error !== "object" ||
            !("code" in error) ||
            Number(error.code) !== 412
          )
            throw error;
          const [metadata] = await file.getMetadata({ timeout: 10000 });
          const previous = stored(metadata);
          if (metadata.metadata?.["fingerprint"] !== fingerprint)
            throw new PhotoError(
              409,
              "OPERATION_CONFLICT",
              "This operation ID was already used for another intent.",
            );
          return previous;
        }
      } catch (error) {
        throw photoError(error);
      }
    },
    async read(input) {
      try {
        const photo = projectProductPhoto(input);
        if (!photo) throw new PhotoError(404, "PHOTO_NOT_FOUND");
        const file = bucket.file(path(photo.id));
        const [metadata] = await file.getMetadata({ timeout: 10000 });
        const checked = stored(metadata);
        if (
          checked.bytes !== photo.bytes ||
          checked.width !== photo.width ||
          checked.height !== photo.height
        )
          throw new PhotoError(503, "INVALID_STORED_PHOTO");
        const pinned = bucket.file(path(photo.id), {
          generation: String(metadata.generation),
        });
        const stream = pinned.createReadStream({
          start: 0,
          end: MAX_OUTPUT_BYTES,
          validation: false,
        });
        const chunks: Buffer[] = [];
        let bytes = 0;
        const timer = setTimeout(
          () => stream.destroy(new Error("Photo read timed out.")),
          30000,
        );
        timer.unref();
        try {
          for await (const chunk of stream) {
            const data = Buffer.isBuffer(chunk)
              ? chunk
              : Buffer.from(chunk as Uint8Array);
            bytes += data.length;
            if (bytes > photo.bytes)
              throw new PhotoError(503, "INVALID_STORED_PHOTO");
            chunks.push(data);
          }
          if (bytes !== photo.bytes)
            throw new PhotoError(503, "INVALID_STORED_PHOTO");
          return Buffer.concat(chunks, bytes);
        } finally {
          clearTimeout(timer);
          stream.destroy();
        }
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          Number(error.code) === 404
        )
          throw new PhotoError(
            404,
            "PHOTO_NOT_FOUND",
            "The photo does not exist.",
          );
        throw photoError(error);
      }
    },
  };
}
