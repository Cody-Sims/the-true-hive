import type { Pool } from "pg";
import type { AdminOrderState } from "../../domain/admin.ts";
import { PickupError } from "./rules.ts";

export interface BuyerOrder {
  id: string;
  state: AdminOrderState;
  locationKey: string;
  revision: number;
  createdAt: string;
  reconciliationReason: string | null;
}

export async function readBuyerOrders(
  database: Pick<Pool, "query">,
  buyerHash: string,
  now = Date.now(),
  orderId?: string,
  lock = false,
): Promise<BuyerOrder[]> {
  if (typeof buyerHash !== "string" || !/^[0-9a-f]{64}$/.test(buyerHash))
    throw new PickupError(
      401,
      "PICKUP_ACCESS_REQUIRED",
      "Buyer access is unavailable.",
    );
  if (
    orderId !== undefined &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      orderId,
    )
  )
    throw new PickupError(400, "INVALID_PICKUP_INPUT", "Choose a valid order.");
  const result = await database.query<BuyerOrder>(
    `SELECT o.order_key AS id,o.state,o.location_key AS "locationKey",o.revision,
       o.created_at AS "createdAt",o.reconciliation_reason AS "reconciliationReason"
     FROM orders o WHERE o.buyer_hash=$1 AND o.buyer_access_expires_at>$2
       AND ($3::uuid IS NULL OR o.order_key=$3)
       AND NOT EXISTS(SELECT 1 FROM admin_operations a WHERE a.action='revoke_pickup_access' AND a.resource_key=o.order_key::text)
     ORDER BY o.created_at DESC,o.order_key LIMIT 10${lock ? " FOR UPDATE OF o" : ""}`,
    [buyerHash, new Date(now), orderId ?? null],
  );
  return result.rows.map((row) => ({
    ...row,
    createdAt: new Date(row.createdAt).toISOString(),
  }));
}
