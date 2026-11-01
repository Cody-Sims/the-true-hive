import type { APIRoute } from "astro";
import { getAdminPool } from "../../../../server/admin/pool.ts";
import { getAdminOrder } from "../../../../server/commerce/orders.ts";
import { OrderNotFoundError } from "../../../../server/commerce/rules.ts";
import {
  orderResponse,
  orderErrorResponse,
  unauthorizedOrderResponse,
} from "../../../../server/commerce/errors.ts";

export const prerender = false;

export const GET: APIRoute = async ({ locals, params }) => {
  if (!locals.admin) return unauthorizedOrderResponse();
  try {
    const order = await getAdminOrder(getAdminPool(), params.id ?? "");
    if (!order) throw new OrderNotFoundError("The order does not exist.");
    return orderResponse({ order });
  } catch (error) {
    return orderErrorResponse(error);
  }
};
