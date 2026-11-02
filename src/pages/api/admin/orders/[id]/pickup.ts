import type { APIRoute } from "astro";
import { getAdminPool } from "../../../../../server/admin/pool.ts";
import { readJsonBody } from "../../../../../server/http-input.ts";
import { recordOrderPickup } from "../../../../../server/commerce/orders.ts";
import {
  orderResponse,
  orderErrorResponse,
  unauthorizedOrderResponse,
} from "../../../../../server/commerce/errors.ts";

export const prerender = false;

export const POST: APIRoute = async ({ locals, params, request }) => {
  if (!locals.admin) return unauthorizedOrderResponse();
  try {
    const input = await readJsonBody(request, 4096);
    return orderResponse(
      await recordOrderPickup(
        getAdminPool(),
        params.id ?? "",
        input,
        locals.admin.actorId,
      ),
    );
  } catch (error) {
    return orderErrorResponse(error);
  }
};
