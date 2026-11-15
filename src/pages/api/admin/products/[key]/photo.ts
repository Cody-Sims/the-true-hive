import { getAdminPool } from "../../../../../server/admin/pool.ts";
import { readProductImagesConfig } from "../../../../../server/media/config.ts";
import { createPhotoRoutes } from "../../../../../server/media/http.ts";
import { createGcsPhotoStorage } from "../../../../../server/media/storage.ts";

export const { GET, POST, DELETE } = createPhotoRoutes({
  config: readProductImagesConfig,
  pool: getAdminPool,
  storage: () => createGcsPhotoStorage(readProductImagesConfig()),
});
