import { createHash } from "node:crypto";
import type { Pool } from "pg";
import type {
  StoreSettings,
  StoreSettingsReceipt,
} from "../../domain/storefront.ts";
import { readStoreSettings, storeSettingsQuery } from "../storefront.ts";
import { AdminError, adminError } from "./errors.ts";

export async function getAdminStoreSettings(
  pool: Pool,
): Promise<StoreSettings> {
  try {
    return await readStoreSettings(pool);
  } catch (error) {
    throw adminError(error);
  }
}

export async function updateAdminStoreSettings(
  pool: Pool,
  input: unknown,
  actorId: string,
): Promise<StoreSettingsReceipt> {
  const value = input as Record<string, unknown> | null;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) =>
        !["operationId", "expectedRevision", "purchasesEnabled"].includes(key),
    ) ||
    typeof value["operationId"] !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value["operationId"],
    ) ||
    typeof value["expectedRevision"] !== "number" ||
    !Number.isInteger(value["expectedRevision"]) ||
    value["expectedRevision"] < 1 ||
    value["expectedRevision"] > 2147483647 ||
    typeof value["purchasesEnabled"] !== "boolean" ||
    typeof actorId !== "string" ||
    !/^[a-z0-9._:-]{1,128}$/i.test(actorId)
  )
    throw new AdminError(
      400,
      "INVALID_INPUT",
      "A store operation, revision and explicit purchase flag are required.",
    );
  const operationId = value["operationId"].toLowerCase();
  const expectedRevision = value["expectedRevision"];
  const purchasesEnabled = value["purchasesEnabled"];
  const action = "update_store_settings";
  const resourceKey = "storefront";
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        actorId,
        action,
        resourceKey,
        expectedRevision,
        purchasesEnabled,
      }),
    )
    .digest("hex");
  const client = await pool.connect().catch((error: unknown) => {
    throw adminError(error);
  });
  let discard = false;
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))",
      [operationId],
    );
    const recorded = (
      await client.query(
        "SELECT actor_key,action,resource_key,request_hash,result FROM admin_operations WHERE operation_id=$1",
        [operationId],
      )
    ).rows[0];
    if (recorded) {
      if (
        recorded.actor_key !== actorId ||
        recorded.action !== action ||
        recorded.resource_key !== resourceKey ||
        recorded.request_hash !== hash
      )
        throw new AdminError(
          409,
          "OPERATION_CONFLICT",
          "This operation ID was already used for another intent.",
        );
      await client.query("COMMIT");
      return { settings: recorded.result.settings, replayed: true };
    }
    // The exclusive update lock conflicts with checkout admission's shared lock.
    await client.query(`${storeSettingsQuery} FOR UPDATE`);
    const before = await readStoreSettings(client);
    if (before.revision !== expectedRevision || before.revision >= 2147483647)
      throw new AdminError(
        409,
        "REVISION_CONFLICT",
        "The store revision changed. Review the current settings.",
      );
    const settings: StoreSettings = {
      purchasesEnabled,
      revision: before.revision + 1,
    };
    await client.query(
      "UPDATE storefront_settings SET purchases_enabled=$1,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1",
      [purchasesEnabled],
    );
    await client.query(
      "INSERT INTO admin_operations (operation_id,actor_key,action,resource_key,request_hash,before_data,after_data,result) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)",
      [
        operationId,
        actorId,
        action,
        resourceKey,
        hash,
        JSON.stringify(before),
        JSON.stringify(settings),
        JSON.stringify({ settings }),
      ],
    );
    await client.query("COMMIT");
    return { settings, replayed: false };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      discard = true;
    }
    throw adminError(error);
  } finally {
    client.release(discard);
  }
}
