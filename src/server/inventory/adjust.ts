import type { Pool, QueryResultRow } from "pg";
import {
  InventoryConflictError,
  InventoryNotFoundError,
  nextOnHand,
  validateAdjustment,
} from "./rules.ts";

export interface AdjustmentResult {
  operationId: string;
  variantKey: string;
  locationKey: string;
  beforeOnHand: number;
  onHand: number;
  replayed: boolean;
}

interface HistoryRow extends QueryResultRow {
  operation_id: string;
  variant_key: string;
  location_key: string;
  delta: number;
  actor_id: string;
  reason: string;
  before_on_hand: number;
  after_on_hand: number;
}

interface BalanceRow extends QueryResultRow {
  on_hand: number;
  committed: number;
  unavailable: number;
}

export async function adjustStock(
  pool: Pool,
  input: unknown,
): Promise<AdjustmentResult> {
  const change = validateAdjustment(input);
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query("BEGIN");
    // Serialize retries by operation ID before locking the specific stock row.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
      [change.operationId],
    );
    const recorded = await client.query<HistoryRow>(
      "SELECT * FROM inventory_movements WHERE operation_id=$1",
      [change.operationId],
    );
    const history = recorded.rows[0];
    if (history) {
      if (
        history.variant_key !== change.variantKey ||
        history.location_key !== change.locationKey ||
        history.delta !== change.delta ||
        history.actor_id !== change.actorId ||
        history.reason !== change.reason
      ) {
        throw new InventoryConflictError(
          "This operation ID was already used for a different correction.",
        );
      }
      await client.query("COMMIT");
      return {
        operationId: history.operation_id,
        variantKey: history.variant_key,
        locationKey: history.location_key,
        beforeOnHand: history.before_on_hand,
        onHand: history.after_on_hand,
        replayed: true,
      };
    }
    const result = await client.query<BalanceRow>(
      "SELECT on_hand,committed,unavailable FROM inventory_levels WHERE variant_key=$1 AND location_key=$2 FOR UPDATE",
      [change.variantKey, change.locationKey],
    );
    const balance = result.rows[0];
    if (!balance)
      throw new InventoryNotFoundError(
        "The variant/location stock record does not exist.",
      );
    const onHand = nextOnHand(
      {
        onHand: balance.on_hand,
        committed: balance.committed,
        unavailable: balance.unavailable,
      },
      change.delta,
    );
    await client.query(
      "UPDATE inventory_levels SET on_hand=$3 WHERE variant_key=$1 AND location_key=$2",
      [change.variantKey, change.locationKey, onHand],
    );
    await client.query(
      `
      INSERT INTO inventory_movements (operation_id,variant_key,location_key,delta,actor_id,reason,before_on_hand,after_on_hand)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `,
      [
        change.operationId,
        change.variantKey,
        change.locationKey,
        change.delta,
        change.actorId,
        change.reason,
        balance.on_hand,
        onHand,
      ],
    );
    await client.query("COMMIT");
    return {
      operationId: change.operationId,
      variantKey: change.variantKey,
      locationKey: change.locationKey,
      beforeOnHand: balance.on_hand,
      onHand,
      replayed: false,
    };
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
