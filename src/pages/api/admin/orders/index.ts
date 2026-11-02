import type { APIRoute } from "astro";
import { getAdminPool } from "../../../../server/admin/pool.ts";
import { listAdminOrders } from "../../../../server/commerce/orders.ts";
import {
  orderResponse,
  orderErrorResponse,
  unauthorizedOrderResponse,
} from "../../../../server/commerce/errors.ts";

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  if (!locals.admin) return unauthorizedOrderResponse();
  try {
    return orderResponse(
      await listAdminOrders(
        getAdminPool(),
        Object.fromEntries(url.searchParams),
      ),
    );
  } catch (error) {
    return orderErrorResponse(error);
  }
};
