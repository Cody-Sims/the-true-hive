import { createHash } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import type {
  AdminOrder,
  AdminOrderLine,
  AdminOrderState,
} from "../../domain/admin.ts";
import type {
  CheckoutReservation,
  CheckoutPayment,
  CheckoutExpiry,
  CheckoutSettlement,
} from "../../domain/commerce.ts";
import {
  MAX_INTEGER,
  MIN_TEST_TOTAL_MINOR,
  MAX_TEST_TOTAL_MINOR,
  OrderConflictError,
  OrderNotFoundError,
  requestHash,
  validateCheckout,
  uuid,
  providerId,
  expiryDate,
  reconciliationReason,
  positiveInteger,
  orderQuery,
  validatePayment,
  validateExpiry,
  validatePickup,
} from "./rules.ts";

interface OrderRow extends QueryResultRow {
  order_key: string;
  state: AdminOrderState;
  location_key: string;
  total_minor: number;
  currency: "USD";
  checkout_session_id: string | null;
  payment_intent_id: string | null;
  checkout_expires_at: Date | null;
  request_hash: string;
  revision: number;
  created_at: Date;
  paid_at: Date | null;
  picked_up_at: Date | null;
  reconciliation_reason: string | null;
}

interface LineRow extends QueryResultRow {
  variant_key: string;
  quantity: number;
  price_minor: number;
  title: string;
  label: string;
}

interface StockRow extends QueryResultRow {
  variant_key: string;
  on_hand: number;
  held: number;
  committed: number;
  unavailable: number;
  revision: number;
}

async function transaction<T>(
  pool: Pool,
  action: (client: PoolClient) => Promise<T>,
  readOnly = false,
): Promise<T> {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query(
      readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN",
    );
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      discard = true;
    }
    throw error;
  } finally {
    client.release(discard);
  }
}

async function lockIdentity(client: PoolClient, identity: string) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))",
    [identity],
  );
}

async function findOrder(
  client: PoolClient,
  id: string,
  lock = false,
): Promise<OrderRow | null> {
  return (
    (
      await client.query<OrderRow>(
        `SELECT * FROM orders WHERE order_key=$1${lock ? " FOR UPDATE" : ""}`,
        [id],
      )
    ).rows[0] ?? null
  );
}

async function requireOrder(client: PoolClient, id: string): Promise<OrderRow> {
  const row = await findOrder(client, id, true);
  if (!row) throw new OrderNotFoundError("The order does not exist.");
  return row;
}

async function orderLines(
  client: PoolClient,
  id: string,
): Promise<AdminOrderLine[]> {
  const rows = (
    await client.query<LineRow>(
      'SELECT variant_key,quantity,price_minor,title,label FROM order_lines WHERE order_key=$1 ORDER BY variant_key COLLATE "C"',
      [id],
    )
  ).rows;
  return rows.map((row) => ({
    variantKey: row.variant_key,
    quantity: row.quantity,
    priceMinor: row.price_minor,
    title: row.title,
    label: row.label,
  }));
}

async function reservation(
  client: PoolClient,
  row: OrderRow,
): Promise<CheckoutReservation> {
  if (!row.checkout_expires_at)
    throw new OrderConflictError("The reservation needs reconciliation.");
  return {
    id: row.order_key,
    state: row.state,
    locationKey: row.location_key,
    totalMinor: row.total_minor,
    currency: row.currency,
    lines: await orderLines(client, row.order_key),
    checkoutSessionId: row.checkout_session_id,
    checkoutExpiresAt: row.checkout_expires_at.toISOString(),
    requestHash: row.request_hash,
    createdAt: row.created_at.toISOString(),
  };
}

async function adminOrder(
  client: PoolClient,
  row: OrderRow,
): Promise<AdminOrder> {
  return {
    id: row.order_key,
    state: row.state,
    locationKey: row.location_key,
    totalMinor: row.total_minor,
    currency: row.currency,
    revision: row.revision,
    createdAt: row.created_at.toISOString(),
    paidAt: row.paid_at?.toISOString() ?? null,
    pickedUpAt: row.picked_up_at?.toISOString() ?? null,
    reconciliationReason: row.reconciliation_reason,
    lines: await orderLines(client, row.order_key),
  };
}

async function quarantine(client: PoolClient, row: OrderRow, reason: string) {
  const state =
    row.state === "paid" || row.state === "picked_up"
      ? row.state
      : "reconciliation_required";
  if (row.state === state && row.reconciliation_reason === reason) return;
  nextRevision(row.revision);
  await client.query(
    "UPDATE orders SET state=$2,reconciliation_reason=$3,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE order_key=$1",
    [row.order_key, state, reason],
  );
}

function nextRevision(revision: number) {
  if (revision >= MAX_INTEGER)
    throw new OrderConflictError("The revision limit was reached.");
}

async function lockStock(
  client: PoolClient,
  lines: AdminOrderLine[],
  location: string,
): Promise<StockRow[]> {
  const rows = (
    await client.query<StockRow>(
      `SELECT variant_key,on_hand,held,committed,unavailable,revision FROM inventory_levels
     WHERE variant_key=ANY($1::text[]) AND location_key=$2
     ORDER BY variant_key COLLATE "C",location_key COLLATE "C" FOR UPDATE`,
      [lines.map((line) => line.variantKey), location],
    )
  ).rows;
  if (rows.length !== lines.length)
    throw new OrderConflictError("The stock records are unavailable.");
  for (const row of rows) nextRevision(row.revision);
  return rows;
}

export async function reserveCheckout(
  pool: Pool,
  input: unknown,
  locationKey: string,
): Promise<CheckoutReservation> {
  const intent = validateCheckout(input, locationKey);
  const hash = requestHash({
    locationKey: intent.locationKey,
    lines: intent.lines,
  });
  return transaction(pool, async (client) => {
    await lockIdentity(client, intent.operationId);
    const old = await findOrder(client, intent.operationId, true);
    if (old) {
      if (old.request_hash !== hash)
        throw new OrderConflictError(
          "This operation ID was used for a different checkout.",
        );
      return reservation(client, old);
    }

    const keys = intent.lines.map((line) => line.variantKey);
    // Eligibility rows are locked before stock, so a concurrent archive or price edit
    // cannot invalidate the snapshots while this reservation is being written.
    const products = (
      await client.query<{ product_key: string }>(
        `SELECT p.product_key FROM products p
       WHERE p.product_key IN (SELECT product_key FROM product_variants WHERE variant_key=ANY($1::text[]))
       ORDER BY p.product_key COLLATE "C" FOR UPDATE`,
        [keys],
      )
    ).rows.map((row) => row.product_key);
    const variants = (
      await client.query<
        LineRow & {
          product_key: string;
          active: boolean;
          currency: string;
        }
      >(
        `SELECT variant_key,product_key,label,price_minor,active,currency FROM product_variants
       WHERE variant_key=ANY($1::text[]) ORDER BY variant_key COLLATE "C" FOR UPDATE`,
        [keys],
      )
    ).rows;
    const location = (
      await client.query<{ active: boolean; pickup_enabled: boolean }>(
        "SELECT active,pickup_enabled FROM inventory_locations WHERE location_key=$1 FOR UPDATE",
        [intent.locationKey],
      )
    ).rows[0];
    if (
      !location?.active ||
      !location.pickup_enabled ||
      variants.length !== keys.length
    )
      throw new OrderConflictError("The requested checkout is not available.");
    const eligible = (
      await client.query<{ product_key: string; title: string }>(
        "SELECT product_key,title FROM products WHERE product_key=ANY($1::text[]) AND published AND kind='active' AND NOT archived",
        [products],
      )
    ).rows;
    const lines: AdminOrderLine[] = intent.lines.map((line) => {
      const variant = variants.find(
        (row) => row.variant_key === line.variantKey,
      );
      const product = eligible.find(
        (row) => row.product_key === variant?.product_key,
      );
      if (
        !variant?.active ||
        !product ||
        variant.currency !== "USD" ||
        !variant.price_minor ||
        variant.price_minor < 1
      )
        throw new OrderConflictError(
          "The requested merchandise is not eligible for checkout.",
        );
      return {
        ...line,
        priceMinor: variant.price_minor,
        title: product.title,
        label: variant.label,
      };
    });
    const total = lines.reduce(
      (sum, line) => sum + line.quantity * line.priceMinor,
      0,
    );
    if (total < MIN_TEST_TOTAL_MINOR || total > MAX_TEST_TOTAL_MINOR)
      throw new OrderConflictError(
        "The checkout total is outside the supported USD test-payment range.",
      );
    const stocks = await lockStock(client, lines, intent.locationKey);
    for (const line of lines) {
      const stock = stocks.find((row) => row.variant_key === line.variantKey)!;
      if (
        stock.on_hand - stock.held - stock.committed - stock.unavailable <
        line.quantity
      )
        throw new OrderConflictError(
          "The requested quantity is not available.",
        );
    }
    const row = (
      await client.query<OrderRow>(
        `INSERT INTO orders (order_key,request_hash,location_key,total_minor,checkout_expires_at)
       VALUES ($1,$2,$3,$4,clock_timestamp() + interval '1 hour')
       RETURNING *`,
        [intent.operationId, hash, intent.locationKey, total],
      )
    ).rows[0]!;
    for (const line of lines) {
      await client.query(
        "INSERT INTO order_lines (order_key,variant_key,quantity,price_minor,title,label) VALUES ($1,$2,$3,$4,$5,$6)",
        [
          row.order_key,
          line.variantKey,
          line.quantity,
          line.priceMinor,
          line.title,
          line.label,
        ],
      );
      await client.query(
        "UPDATE inventory_levels SET held=held+$3,revision=revision+1 WHERE variant_key=$1 AND location_key=$2",
        [line.variantKey, intent.locationKey, line.quantity],
      );
    }
    return reservation(client, row);
  });
}

export async function attachCheckoutSession(
  pool: Pool,
  orderId: string,
  sessionId: string,
  expiresAt: string,
): Promise<CheckoutReservation> {
  return associateCheckoutSession(pool, orderId, sessionId, expiresAt, false);
}

export async function recoverCheckoutSession(
  pool: Pool,
  orderId: string,
  sessionId: string,
  expiresAt: string,
): Promise<CheckoutReservation> {
  return associateCheckoutSession(pool, orderId, sessionId, expiresAt, true);
}

async function associateCheckoutSession(
  pool: Pool,
  orderId: string,
  sessionId: string,
  expiresAt: string,
  verifiedRecovery: boolean,
): Promise<CheckoutReservation> {
  const id = uuid(orderId);
  const session = providerId(sessionId);
  const expiry = expiryDate(expiresAt);
  return transaction(pool, async (client) => {
    await lockIdentity(client, `session:${session}`);
    const row = await requireOrder(client, id);
    if (
      !row.checkout_expires_at ||
      row.checkout_expires_at.getTime() !== expiry.getTime()
    )
      throw new OrderConflictError(
        "The original checkout expiry cannot be changed.",
      );
    if (row.checkout_session_id) {
      if (row.checkout_session_id !== session)
        throw new OrderConflictError(
          "The order already has a different checkout session.",
        );
      return reservation(client, row);
    }
    if (
      (row.state !== "creating" && row.state !== "reconciliation_required") ||
      (!verifiedRecovery && row.checkout_expires_at.getTime() <= Date.now())
    )
      throw new OrderConflictError(
        "The reservation cannot attach a new checkout session.",
      );
    const existing = await client.query(
      "SELECT order_key FROM orders WHERE checkout_session_id=$1",
      [session],
    );
    if (existing.rowCount)
      throw new OrderConflictError(
        "The checkout session is already associated with an order.",
      );
    nextRevision(row.revision);
    const updated = (
      await client.query<OrderRow>(
        `UPDATE orders SET checkout_session_id=$2,state=CASE WHEN state='creating' THEN 'open' ELSE state END,
       revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE order_key=$1 RETURNING *`,
        [id, session],
      )
    ).rows[0]!;
    return reservation(client, updated);
  });
}
export async function getCheckoutReservation(
  pool: Pool,
  orderId: string,
): Promise<CheckoutReservation | null> {
  const id = uuid(orderId);
  return transaction(
    pool,
    async (client) => {
      const row = await findOrder(client, id);
      return row ? reservation(client, row) : null;
    },
    true,
  );
}
export async function applyCheckoutPayment(
  pool: Pool,
  input: CheckoutPayment,
): Promise<CheckoutSettlement> {
  const receipt = validatePayment(input);
  return processEvent(
    pool,
    receipt,
    "checkout.session.completed",
    async (client, row) => {
      if (
        row.checkout_session_id !== receipt.sessionId ||
        row.total_minor !== receipt.totalMinor ||
        row.currency !== receipt.currency ||
        (row.payment_intent_id !== null &&
          row.payment_intent_id !== receipt.paymentIntentId)
      ) {
        await quarantine(
          client,
          row,
          "Payment association does not match the reserved checkout.",
        );
        return "reconciliation_required";
      }
      if (row.state === "paid" || row.state === "picked_up")
        return "already_processed";
      if (await wasReleased(client, row)) {
        await quarantine(
          client,
          row,
          "Payment was reported after the checkout allocation was released.",
        );
        return "reconciliation_required";
      }
      if (
        !["creating", "open", "reconciliation_required"].includes(row.state)
      ) {
        await quarantine(
          client,
          row,
          "Payment cannot be applied to the current order state.",
        );
        return "reconciliation_required";
      }
      const lines = await orderLines(client, row.order_key);
      const stocks = await settlementStock(client, row, lines);
      if (
        !stocks ||
        lines.some((line) => {
          const stock = stocks.find(
            (balance) => balance.variant_key === line.variantKey,
          )!;
          return (
            stock.held < line.quantity ||
            stock.committed + line.quantity > MAX_INTEGER
          );
        })
      ) {
        await quarantine(
          client,
          row,
          "The checkout allocation needs inventory reconciliation.",
        );
        return "reconciliation_required";
      }
      nextRevision(row.revision);
      for (const line of lines) {
        await client.query(
          `UPDATE inventory_levels SET held=held-$3,committed=committed+$3,revision=revision+1
         WHERE variant_key=$1 AND location_key=$2`,
          [line.variantKey, row.location_key, line.quantity],
        );
      }
      await client.query(
        `UPDATE orders SET state='paid',payment_intent_id=$2,paid_at=CURRENT_TIMESTAMP,
       reconciliation_reason=NULL,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE order_key=$1`,
        [row.order_key, receipt.paymentIntentId],
      );
      return "paid";
    },
  );
}
export async function releaseExpiredCheckout(
  pool: Pool,
  input: CheckoutExpiry,
): Promise<CheckoutSettlement> {
  const receipt = validateExpiry(input);
  return processEvent(
    pool,
    receipt,
    "checkout.session.expired",
    async (client, row) => {
      if (row.checkout_session_id !== receipt.sessionId) {
        await quarantine(
          client,
          row,
          "Expiry association does not match the reserved checkout.",
        );
        return "reconciliation_required";
      }
      if (
        row.state === "paid" ||
        row.state === "picked_up" ||
        (await wasReleased(client, row))
      )
        return "already_processed";
      if (
        !["creating", "open", "reconciliation_required"].includes(row.state)
      ) {
        await quarantine(
          client,
          row,
          "Expiry cannot be applied to the current order state.",
        );
        return "reconciliation_required";
      }
      const lines = await orderLines(client, row.order_key);
      const stocks = await settlementStock(client, row, lines);
      if (
        !stocks ||
        lines.some(
          (line) =>
            stocks.find((balance) => balance.variant_key === line.variantKey)!
              .held < line.quantity,
        )
      ) {
        await quarantine(
          client,
          row,
          "The checkout allocation needs inventory reconciliation.",
        );
        return "reconciliation_required";
      }
      nextRevision(row.revision);
      for (const line of lines) {
        await client.query(
          "UPDATE inventory_levels SET held=held-$3,revision=revision+1 WHERE variant_key=$1 AND location_key=$2",
          [line.variantKey, row.location_key, line.quantity],
        );
      }
      await client.query(
        `UPDATE orders SET state='expired',reconciliation_reason=NULL,revision=revision+1,
       updated_at=CURRENT_TIMESTAMP WHERE order_key=$1`,
        [row.order_key],
      );
      return "expired";
    },
  );
}

async function wasReleased(
  client: PoolClient,
  row: OrderRow,
): Promise<boolean> {
  // Reconciliation can change an expired order's display state. The immutable
  // release receipt, not that display state or a local timer, proves release.
  return (
    row.state === "expired" ||
    Boolean(
      (
        await client.query(
          "SELECT 1 FROM payment_events WHERE order_key=$1 AND result='expired' LIMIT 1",
          [row.order_key],
        )
      ).rowCount,
    )
  );
}

async function settlementStock(
  client: PoolClient,
  row: OrderRow,
  lines: AdminOrderLine[],
): Promise<StockRow[] | null> {
  if (!lines.length || lines.length > 20) return null;
  try {
    return await lockStock(client, lines, row.location_key);
  } catch (error) {
    if (error instanceof OrderConflictError) return null;
    throw error;
  }
}

async function processEvent(
  pool: Pool,
  receipt: CheckoutExpiry,
  type: string,
  settle: (client: PoolClient, row: OrderRow) => Promise<CheckoutSettlement>,
): Promise<CheckoutSettlement> {
  const hash = requestHash({ type, ...receipt });
  return transaction(pool, async (client) => {
    await lockIdentity(client, `event:${receipt.eventId}`);
    const previous = (
      await client.query<{
        event_type: string;
        order_key: string;
        request_hash: string;
        result: CheckoutSettlement;
      }>(
        "SELECT event_type,order_key,request_hash,result FROM payment_events WHERE event_key=$1",
        [receipt.eventId],
      )
    ).rows[0];
    if (previous) {
      if (
        previous.event_type !== type ||
        previous.order_key !== receipt.orderId ||
        previous.request_hash !== hash
      )
        throw new OrderConflictError(
          "The event identity was already used for a different receipt.",
        );
      return previous.result === "reconciliation_required"
        ? "reconciliation_required"
        : "already_processed";
    }
    const row = await requireOrder(client, receipt.orderId);
    const result = await settle(client, row);
    await client.query(
      "INSERT INTO payment_events (event_key,event_type,order_key,request_hash,result) VALUES ($1,$2,$3,$4,$5)",
      [receipt.eventId, type, receipt.orderId, hash, result],
    );
    return result;
  });
}
export async function markCheckoutReconciliation(
  pool: Pool,
  orderId: string,
  reason: string,
): Promise<void> {
  const id = uuid(orderId);
  const safeReason = reconciliationReason(reason);
  await transaction(pool, async (client) => {
    await quarantine(client, await requireOrder(client, id), safeReason);
  });
}
export async function listPendingCheckoutReservations(
  pool: Pool,
  limit: number,
): Promise<CheckoutReservation[]> {
  const bounded = positiveInteger(limit, 100);
  return transaction(pool, async (client) => {
    const rows = (
      await client.query<OrderRow>(
        `SELECT * FROM orders WHERE state IN ('creating','open','reconciliation_required')
       ORDER BY updated_at,order_key LIMIT $1 FOR UPDATE SKIP LOCKED`,
        [bounded],
      )
    ).rows;
    // Rotate every selected batch, including open/unknown sessions, without changing holds.
    if (rows.length)
      await client.query(
        "UPDATE orders SET updated_at=clock_timestamp() WHERE order_key=ANY($1::uuid[])",
        [rows.map((row) => row.order_key)],
      );
    const reservations: CheckoutReservation[] = [];
    for (const row of rows) reservations.push(await reservation(client, row));
    return reservations;
  });
}
export async function listAdminOrders(
  pool: Pool,
  query?: unknown,
): Promise<{ orders: AdminOrder[]; total: number }> {
  const params = orderQuery(query);
  return transaction(
    pool,
    async (client) => {
      const where =
        "WHERE ($1::text IS NULL OR state=$1) AND ($2::text IS NULL OR location_key=$2)";
      const values = [params.state, params.locationKey];
      const total = (
        await client.query<{ total: number }>(
          `SELECT count(*)::int AS total FROM orders ${where}`,
          values,
        )
      ).rows[0]!.total;
      const rows = (
        await client.query<OrderRow>(
          `SELECT * FROM orders ${where} ORDER BY created_at DESC,order_key DESC LIMIT $3 OFFSET $4`,
          [...values, params.limit, params.offset],
        )
      ).rows;
      const orders: AdminOrder[] = [];
      for (const row of rows) orders.push(await adminOrder(client, row));
      return { orders, total };
    },
    true,
  );
}
export async function getAdminOrder(
  pool: Pool,
  orderId: string,
): Promise<AdminOrder | null> {
  const id = uuid(orderId);
  return transaction(
    pool,
    async (client) => {
      const row = await findOrder(client, id);
      return row ? adminOrder(client, row) : null;
    },
    true,
  );
}
export async function recordOrderPickup(
  pool: Pool,
  orderId: string,
  input: unknown,
  actorId: string,
): Promise<{ order: AdminOrder; replayed: boolean }> {
  const id = uuid(orderId);
  const intent = validatePickup(input, actorId);
  const hash = requestHash({
    action: "pickup",
    orderId: id,
    expectedRevision: intent.expectedRevision,
    actorId: intent.actorId,
  });
  return transaction(pool, async (client) => {
    await lockIdentity(client, intent.operationId);
    const old = (
      await client.query<{
        action: string;
        actor_key: string;
        resource_key: string;
        request_hash: string;
        result: { order: AdminOrder };
      }>(
        "SELECT action,actor_key,resource_key,request_hash,result FROM admin_operations WHERE operation_id=$1",
        [intent.operationId],
      )
    ).rows[0];
    if (old) {
      if (
        old.action !== "pickup" ||
        old.actor_key !== intent.actorId ||
        old.resource_key !== id ||
        old.request_hash !== hash
      )
        throw new OrderConflictError(
          "This operation ID was already used for a different admin operation.",
        );
      return { order: old.result.order, replayed: true };
    }
    const row = await requireOrder(client, id);
    if (row.state !== "paid")
      throw new OrderConflictError(
        "Only a paid order can be recorded as picked up.",
      );
    if (row.revision !== intent.expectedRevision)
      throw new OrderConflictError(
        "The order revision changed. Review the current order before pickup.",
      );
    nextRevision(row.revision);
    const before = await adminOrder(client, row);
    if (!before.lines.length || before.lines.length > 20)
      throw new OrderConflictError(
        "The order merchandise needs reconciliation.",
      );
    const stocks = await lockStock(client, before.lines, row.location_key);
    for (const line of before.lines) {
      const stock = stocks.find(
        (balance) => balance.variant_key === line.variantKey,
      )!;
      if (stock.committed < line.quantity || stock.on_hand < line.quantity)
        throw new OrderConflictError(
          "The paid inventory allocation needs reconciliation.",
        );
    }
    const afterStocks = [];
    for (const line of before.lines) {
      const stock = stocks.find(
        (balance) => balance.variant_key === line.variantKey,
      )!;
      await client.query(
        `UPDATE inventory_levels SET committed=committed-$3,on_hand=on_hand-$3,revision=revision+1
         WHERE variant_key=$1 AND location_key=$2`,
        [line.variantKey, row.location_key, line.quantity],
      );
      await client.query(
        `INSERT INTO inventory_movements (operation_id,variant_key,location_key,delta,actor_id,reason,
         before_on_hand,after_on_hand,before_revision,after_revision)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          pickupMovementId(intent.operationId, line.variantKey),
          line.variantKey,
          row.location_key,
          -line.quantity,
          intent.actorId,
          `Order pickup ${id}; operation ${intent.operationId}`,
          stock.on_hand,
          stock.on_hand - line.quantity,
          stock.revision,
          stock.revision + 1,
        ],
      );
      afterStocks.push({
        ...stock,
        committed: stock.committed - line.quantity,
        on_hand: stock.on_hand - line.quantity,
        revision: stock.revision + 1,
      });
    }
    const updated = (
      await client.query<OrderRow>(
        `UPDATE orders SET state='picked_up',picked_up_at=CURRENT_TIMESTAMP,revision=revision+1,
       updated_at=CURRENT_TIMESTAMP WHERE order_key=$1 RETURNING *`,
        [id],
      )
    ).rows[0]!;
    const order = await adminOrder(client, updated);
    await client.query(
      `INSERT INTO admin_operations (operation_id,actor_key,action,resource_key,request_hash,before_data,after_data,result)
       VALUES ($1,$2,'pickup',$3,$4,$5::jsonb,$6::jsonb,$7::jsonb)`,
      [
        intent.operationId,
        intent.actorId,
        id,
        hash,
        JSON.stringify({ order: before, levels: stocks }),
        JSON.stringify({ order, levels: afterStocks }),
        JSON.stringify({ order }),
      ],
    );
    return { order, replayed: false };
  });
}

function pickupMovementId(operationId: string, variantKey: string): string {
  // The legacy movement primary key allows one row per UUID. A deterministic
  // UUIDv8 per pickup line links multi-line receipts without reusing that key.
  const bytes = createHash("sha256")
    .update(JSON.stringify(["pickup", operationId, variantKey]))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
