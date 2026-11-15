import { readConfig } from "../../../server/config.ts";
import { getPool } from "../../../server/db/pool.ts";
import { readProductImagesConfig } from "../../../server/media/config.ts";
import { createPublicPhotoRoute } from "../../../server/media/http.ts";
import { createGcsPhotoStorage } from "../../../server/media/storage.ts";

export const GET = createPublicPhotoRoute({
  config: readProductImagesConfig,
  catalogSource: () => readConfig().catalogSource,
  pool: () => getPool(readConfig()),
  storage: () => createGcsPhotoStorage(readProductImagesConfig()),
});
