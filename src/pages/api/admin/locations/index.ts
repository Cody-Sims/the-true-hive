import {
  createAdminLocation,
  listAdminLocations,
} from "../../../../server/admin/catalog.ts";
import { adminRoute } from "../../../../server/admin/http.ts";

export const GET = adminRoute(async (pool) => ({
  locations: await listAdminLocations(pool),
}));

export const POST = adminRoute(
  async (pool, input, _context, admin) =>
    createAdminLocation(pool, input, admin.actorId),
  true,
  true,
);
