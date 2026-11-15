import type { APIContext, APIRoute } from "astro";
import type { Pool } from "pg";
import type { AdminActor } from "../../domain/admin.ts";
import type { ProductPhoto } from "../../domain/catalog.ts";
import type { PhotoStorage } from "./storage.ts";
import { PhotoError, photoError } from "./errors.ts";
import { readPhotoDelete, readPhotoMultipart } from "./input.ts";
import { withPhotoDownload, withPhotoWork } from "./limit.ts";
import { attachProductPhoto } from "./service.ts";
import {
  commitPhotoOperation,
  makePhotoIntent,
  readPrivateProductPhoto,
  readPublishedProductPhoto,
} from "./persistence.ts";
import { isRecordKey } from "../inventory/rules.ts";
import { UUID_PATTERN } from "./photo.ts";

interface RouteDependencies {
  config: () => { enabled: boolean };
  pool: () => Pool;
  storage: () => PhotoStorage;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

function failure(error: unknown): Response {
  const safe = photoError(error);
  return json(
    { error: { code: safe.code, message: safe.message } },
    safe.status,
  );
}

function notFound(): never {
  throw new PhotoError(404, "PHOTO_NOT_FOUND", "The photo does not exist.");
}

function image(
  data: Buffer,
  photo: ProductPhoto,
  privateImage: boolean,
): Response {
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": "image/webp",
      "content-length": String(photo.bytes),
      "cache-control": privateImage ? "no-store" : "public, max-age=60",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

export function createPhotoRoutes(dependencies: RouteDependencies): {
  GET: APIRoute;
  POST: APIRoute;
  DELETE: APIRoute;
} {
  function guarded(
    handler: (
      context: APIContext,
      admin: AdminActor,
      key: string,
    ) => Promise<Response>,
  ): APIRoute {
    return async (context) => {
      const admin = (context.locals as { admin?: AdminActor }).admin;
      if (!admin)
        return json(
          {
            error: {
              code: "UNAUTHORIZED",
              message: "Administrator authentication is required.",
            },
          },
          401,
        );
      try {
        if (!dependencies.config().enabled)
          throw new PhotoError(503, "PHOTOS_DISABLED");
        const key = context.params["key"];
        if (!isRecordKey(key)) throw new PhotoError(400, "INVALID_PHOTO_INPUT");
        return await handler(context, admin, key);
      } catch (error) {
        return failure(error);
      }
    };
  }
  return {
    GET: guarded(async (_context, _admin, key) =>
      withPhotoDownload(async () => {
        const photo = await readPrivateProductPhoto(dependencies.pool(), key);
        if (!photo) notFound();
        return image(await dependencies.storage().read(photo), photo, true);
      }),
    ),
    POST: guarded(async (context, admin, key) =>
      withPhotoWork(async () => {
        const input = await readPhotoMultipart(context.request);
        const result = await attachProductPhoto(
          dependencies.pool(),
          dependencies.storage,
          key,
          input,
          admin.actorId,
        );
        return json(result);
      }),
    ),
    DELETE: guarded(async (context, admin, key) => {
      const input = await readPhotoDelete(context.request);
      const intent = makePhotoIntent(key, admin.actorId, input);
      return json(
        await commitPhotoOperation(dependencies.pool(), intent, null),
      );
    }),
  };
}

export function createPublicPhotoRoute(
  dependencies: RouteDependencies & { catalogSource: () => string },
): APIRoute {
  return async (context) => {
    try {
      if (dependencies.catalogSource() !== "database") notFound();
      const id = context.params["id"];
      if (!id || !UUID_PATTERN.test(id)) notFound();
      if (!dependencies.config().enabled) notFound();
      return await withPhotoDownload(async () => {
        const photo = await readPublishedProductPhoto(dependencies.pool(), id);
        if (!photo) notFound();
        return image(await dependencies.storage().read(photo), photo, false);
      });
    } catch (error) {
      return failure(error);
    }
  };
}
