import { createHash, randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import type {
  PickupMutationReceipt,
  PickupSite,
  PickupSettings,
  PickupAvailability,
  PickupBooking,
  PublicPickupSite,
  CustomerPickupContext,
  AdminPickupDashboard,
  PickupSiteImpact,
} from "../../domain/pickup.ts";
import { isRecordKey } from "../inventory/rules.ts";
import {
  PickupError,
  validateSiteMutation,
  validatePickupSite,
  validateSettingsMutation,
  validateAvailabilityQuery,
  validateBookingIntent,
  validateOrderMutation,
  PickupImpactError,
  type PickupIdentity,
} from "./rules.ts";
import { generatePickupSlots, slotHasCapacity } from "./time.ts";
import { readBuyerOrders, type BuyerOrder } from "./buyer.ts";

const siteFields = `p.site_key AS key,p.label,p.area,p.timezone,p.private_instructions AS "privateInstructions",
  p.active,p.slot_minutes AS "slotMinutes",p.capacity,p.notice_hours AS "noticeHours",
  p.horizon_days AS "horizonDays",p.reschedule_cutoff_hours AS "rescheduleCutoffHours",
  p.travel_buffer_minutes AS "travelBufferMinutes",p.weekly,p.exceptions,p.revision,
  ARRAY(SELECT m.location_key FROM pickup_site_stock_locations m WHERE m.site_key=p.site_key ORDER BY m.location_key) AS "stockLocationKeys"`;

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
    if (!readOnly)
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('pickup-scheduling-operator',0))",
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

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

async function beginOperation(
  client: PoolClient,
  identity: PickupIdentity,
  action: string,
  resource: string,
  input: unknown,
) {
  const hash = createHash("sha256")
    .update(canonical({ actor: identity.actorId, action, resource, input }))
    .digest("hex");
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))",
    [identity.operationId],
  );
  const previous = (
    await client.query<{
      actor_key: string;
      action: string;
      resource_key: string;
      request_hash: string;
      result: PickupMutationReceipt;
    }>(
      "SELECT actor_key,action,resource_key,request_hash,result FROM admin_operations WHERE operation_id=$1",
      [identity.operationId],
    )
  ).rows[0];
  if (
    previous &&
    (previous.actor_key !== identity.actorId ||
      previous.action !== action ||
      previous.resource_key !== resource ||
      previous.request_hash !== hash)
  )
    throw new PickupError(
      409,
      "OPERATION_CONFLICT",
      "This operation ID belongs to another intent.",
    );
  return {
    hash,
    previous: previous ? { ...previous.result, replayed: true } : null,
  };
}

async function recordOperation(
  client: PoolClient,
  identity: PickupIdentity,
  action: string,
  resource: string,
  hash: string,
  before: unknown,
  after: unknown,
  receipt: PickupMutationReceipt,
) {
  await client.query(
    "INSERT INTO admin_operations(operation_id,actor_key,action,resource_key,request_hash,before_data,after_data,result) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)",
    [
      identity.operationId,
      identity.actorId,
      action,
      resource,
      hash,
      before === null ? null : JSON.stringify(before),
      JSON.stringify(after),
      JSON.stringify(receipt),
    ],
  );
}

function safeSite(site: PickupSite) {
  const { privateInstructions, ...safe } = site;
  return { ...safe, hasPrivateInstructions: Boolean(privateInstructions) };
}

async function requireLocations(client: PoolClient, keys: string[]) {
  const existing = await client.query(
    "SELECT location_key FROM inventory_locations WHERE location_key=ANY($1::text[]) ORDER BY location_key FOR SHARE",
    [keys],
  );
  if (existing.rows.length !== keys.length)
    throw new PickupError(
      400,
      "INVALID_PICKUP_INPUT",
      "Choose existing fulfillment-stock locations.",
      { stockLocationKeys: "A selected stock location no longer exists." },
    );
}

export async function createPickupSite(
  pool: Pool,
  input: unknown,
  actorId: string,
): Promise<PickupMutationReceipt> {
  const { identity, site } = validateSiteMutation(input, actorId);
  return transaction(pool, async (client) => {
    const action = "create_pickup_site";
    const operation = await beginOperation(
      client,
      identity,
      action,
      site.key,
      site,
    );
    if (operation.previous) return operation.previous;
    if (
      (
        await client.query(
          "SELECT site_key FROM pickup_sites WHERE site_key=$1",
          [site.key],
        )
      ).rows.length
    )
      throw new PickupError(
        409,
        "DUPLICATE_PICKUP_SITE",
        "This pickup point already exists.",
      );
    if (
      Number(
        (await client.query("SELECT count(*) FROM pickup_sites")).rows[0].count,
      ) >= 50
    )
      throw new PickupError(
        409,
        "PICKUP_SITE_LIMIT",
        "Review the existing pickup points before adding another.",
      );
    await requireLocations(client, site.stockLocationKeys);
    await client.query(
      `INSERT INTO pickup_sites(site_key,label,area,timezone,private_instructions,active,slot_minutes,capacity,notice_hours,horizon_days,reschedule_cutoff_hours,travel_buffer_minutes,weekly,exceptions)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb)`,
      [
        site.key,
        site.label,
        site.area,
        site.timezone,
        site.privateInstructions,
        site.active,
        site.slotMinutes,
        site.capacity,
        site.noticeHours,
        site.horizonDays,
        site.rescheduleCutoffHours,
        site.travelBufferMinutes,
        JSON.stringify(site.weekly),
        JSON.stringify(site.exceptions),
      ],
    );
    await client.query(
      "INSERT INTO pickup_site_stock_locations(site_key,location_key) SELECT $1,unnest($2::text[])",
      [site.key, site.stockLocationKeys],
    );
    const saved = (
      await client.query<PickupSite & QueryResultRow>(
        `SELECT ${siteFields} FROM pickup_sites p WHERE p.site_key=$1`,
        [site.key],
      )
    ).rows[0]!;
    const receipt: PickupMutationReceipt = {
      operationId: identity.operationId,
      resourceKey: site.key,
      revision: saved.revision,
      replayed: false,
    };
    await recordOperation(
      client,
      identity,
      action,
      site.key,
      operation.hash,
      null,
      safeSite(saved),
      receipt,
    );
    return receipt;
  });
}

export async function getPickupSite(
  pool: Pick<Pool, "query">,
  key: string,
): Promise<PickupSite | null> {
  if (!isRecordKey(key))
    throw new PickupError(
      400,
      "INVALID_PICKUP_INPUT",
      "Choose a valid pickup point.",
    );
  return (
    (
      await pool.query<PickupSite & QueryResultRow>(
        `SELECT ${siteFields} FROM pickup_sites p WHERE p.site_key=$1`,
        [key],
      )
    ).rows[0] ?? null
  );
}

export async function getPickupSettings(
  pool: Pick<Pool, "query">,
): Promise<PickupSettings> {
  const row = (
    await pool.query<PickupSettings & QueryResultRow>(
      "SELECT enabled,revision FROM pickup_settings WHERE id=1",
    )
  ).rows[0];
  if (!row)
    throw new PickupError(
      503,
      "PICKUP_UNAVAILABLE",
      "Pickup settings are unavailable.",
    );
  return row;
}

export async function updatePickupSettings(
  pool: Pool,
  input: unknown,
  actorId: string,
): Promise<PickupMutationReceipt> {
  const value = validateSettingsMutation(input, actorId);
  return transaction(pool, async (client) => {
    const action = "update_pickup_settings";
    const resource = "pickup-settings";
    const operation = await beginOperation(
      client,
      value.identity,
      action,
      resource,
      { enabled: value.enabled, expectedRevision: value.expectedRevision },
    );
    if (operation.previous) return operation.previous;
    const before = (
      await client.query<PickupSettings & QueryResultRow>(
        "SELECT enabled,revision FROM pickup_settings WHERE id=1 FOR UPDATE",
      )
    ).rows[0];
    if (!before)
      throw new PickupError(
        503,
        "PICKUP_UNAVAILABLE",
        "Pickup settings are unavailable.",
      );
    if (
      before.revision !== value.expectedRevision ||
      before.revision >= 2147483647
    )
      throw new PickupError(
        409,
        "REVISION_CONFLICT",
        "Refresh and review the current pickup settings.",
      );
    if (value.enabled) {
      const activeSites = (
        await client.query<PickupSite & QueryResultRow>(
          `SELECT ${siteFields} FROM pickup_sites p WHERE active ORDER BY site_key LIMIT 51`,
        )
      ).rows;
      if (!activeSites.length || activeSites.length > 50)
        throw new PickupError(
          409,
          "PICKUP_NOT_CONFIGURED",
          "Configure an active pickup point and its fulfillment-stock locations first.",
        );
      for (const { revision: _revision, ...site } of activeSites)
        validatePickupSite(site);
    }
    const after = (
      await client.query<PickupSettings & QueryResultRow>(
        "UPDATE pickup_settings SET enabled=$1,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1 RETURNING enabled,revision",
        [value.enabled],
      )
    ).rows[0]!;
    const receipt: PickupMutationReceipt = {
      operationId: value.identity.operationId,
      resourceKey: resource,
      revision: after.revision,
      replayed: false,
    };
    await recordOperation(
      client,
      value.identity,
      action,
      resource,
      operation.hash,
      before,
      after,
      receipt,
    );
    return receipt;
  });
}

export type PickupActor =
  { kind: "buyer"; hash: string } | { kind: "admin"; actorId: string };

function actorKey(actor: PickupActor): string {
  if (
    actor?.kind === "buyer" &&
    typeof actor.hash === "string" &&
    /^[0-9a-f]{64}$/.test(actor.hash)
  )
    return `buyer:${actor.hash}`;
  if (
    actor?.kind === "admin" &&
    typeof actor.actorId === "string" &&
    /^[a-zA-Z0-9._:-]{1,128}$/.test(actor.actorId)
  )
    return actor.actorId;
  throw new PickupError(
    401,
    "PICKUP_ACCESS_REQUIRED",
    "Verified pickup access is required.",
  );
}

async function loadOrder(
  client: PoolClient,
  orderId: string,
  actor: PickupActor,
  now: number,
  lock = false,
): Promise<BuyerOrder> {
  const row =
    actor.kind === "buyer"
      ? (await readBuyerOrders(client, actor.hash, now, orderId, lock))[0]
      : (
          await client.query<BuyerOrder>(
            `SELECT order_key AS id,state,location_key AS "locationKey",revision,created_at AS "createdAt",
       reconciliation_reason AS "reconciliationReason" FROM orders WHERE order_key=$1${lock ? " FOR UPDATE" : ""}`,
            [orderId],
          )
        ).rows[0];
  if (!row)
    throw new PickupError(
      404,
      "PICKUP_ORDER_NOT_FOUND",
      "This order is unavailable for pickup scheduling.",
    );
  return row;
}

function requirePaid(order: BuyerOrder) {
  if (order.state !== "paid" || order.reconciliationReason)
    throw new PickupError(
      409,
      "PICKUP_ORDER_NOT_READY",
      "Pickup scheduling requires a verified paid order still awaiting collection.",
    );
}

const bookingFields = `b.booking_id AS id,b.order_key AS "orderId",b.site_key AS "siteKey",b.site_label AS "siteLabel",
  b.timezone,b.starts_at AS "startsAt",b.ends_at AS "endsAt",b.travel_buffer_minutes AS "travelBufferMinutes",
  b.reschedule_cutoff_hours AS "rescheduleCutoffHours",b.revision,
  CASE WHEN o.state='picked_up' THEN 'completed' ELSE b.status END AS status`;

function bookingValue(row: PickupBooking): PickupBooking {
  return {
    ...row,
    startsAt: new Date(row.startsAt).toISOString(),
    endsAt: new Date(row.endsAt).toISOString(),
  };
}

async function loadBooking(
  client: PoolClient,
  orderId: string,
): Promise<PickupBooking | null> {
  const row = (
    await client.query<PickupBooking>(
      `SELECT ${bookingFields} FROM pickup_bookings b JOIN orders o USING(order_key) WHERE b.order_key=$1`,
      [orderId],
    )
  ).rows[0];
  return row ? bookingValue(row) : null;
}

async function occupancy(client: PoolClient, from: number, until: number) {
  const rows = (
    await client.query<PickupBooking>(
      `SELECT ${bookingFields} FROM pickup_bookings b JOIN orders o USING(order_key)
     WHERE b.ends_at>$1 AND b.starts_at<$2 ORDER BY b.starts_at,b.booking_id LIMIT 5001`,
      [new Date(from - 240 * 60_000), new Date(until + 240 * 60_000)],
    )
  ).rows;
  if (rows.length > 5000)
    throw new PickupError(
      503,
      "PICKUP_UNAVAILABLE",
      "Availability cannot be safely verified. Contact the operator.",
    );
  const buffers = (
    await client.query<{ site_key: string; travel_buffer_minutes: number }>(
      "SELECT site_key,travel_buffer_minutes FROM pickup_sites",
    )
  ).rows;
  return {
    bookings: rows.map(bookingValue),
    buffers: new Map(
      buffers.map((row) => [row.site_key, row.travel_buffer_minutes]),
    ),
  };
}

function publicSite(site: PickupSite): PublicPickupSite {
  return {
    key: site.key,
    label: site.label,
    area: site.area,
    timezone: site.timezone,
    revision: site.revision,
  };
}

function requireChangeWindow(
  booking: PickupBooking | null,
  actor: PickupActor,
  now: number,
) {
  if (
    actor.kind === "buyer" &&
    booking &&
    Date.parse(booking.startsAt) - now <
      booking.rescheduleCutoffHours * 3_600_000
  )
    throw new PickupError(
      409,
      "PICKUP_CHANGE_WINDOW_CLOSED",
      "Contact the operator to change this pickup.",
    );
}

async function allowedSite(
  client: PoolClient,
  siteKey: string,
  order: BuyerOrder,
) {
  const site = await getPickupSite(client, siteKey);
  if (
    !site ||
    !site.active ||
    !site.stockLocationKeys.includes(order.locationKey)
  )
    throw new PickupError(
      409,
      "PICKUP_SITE_UNAVAILABLE",
      "Choose an approved pickup point for this order.",
    );
  return site;
}

export async function getPickupAvailability(
  pool: Pool,
  input: unknown,
  actor: PickupActor,
  now = Date.now(),
): Promise<PickupAvailability> {
  actorKey(actor);
  const query = validateAvailabilityQuery(input);
  return transaction(
    pool,
    async (client) => {
      const order = await loadOrder(client, query.orderId, actor, now);
      requirePaid(order);
      const settings = await getPickupSettings(client);
      if (actor.kind === "buyer" && !settings.enabled)
        throw new PickupError(
          503,
          "PICKUP_SCHEDULING_DISABLED",
          "Contact the operator to arrange pickup.",
        );
      const site = await allowedSite(client, query.siteKey, order);
      const booking = await loadBooking(client, order.id);
      requireChangeWindow(booking, actor, now);
      const candidates = Array.from({ length: query.days }, (_, day) =>
        generatePickupSlots(
          site,
          Temporal.PlainDate.from(query.from).add({ days: day }).toString(),
          now,
        ),
      ).flat();
      let slots = candidates;
      if (candidates.length) {
        const state = await occupancy(
          client,
          Math.min(...candidates.map((slot) => Date.parse(slot.startsAt))),
          Math.max(...candidates.map((slot) => Date.parse(slot.endsAt))),
        );
        slots = candidates.filter((slot) =>
          slotHasCapacity(site, slot, state.bookings, state.buffers, order.id),
        );
      }
      return {
        site: publicSite(site),
        settingsRevision: settings.revision,
        orderRevision: order.revision,
        bookingRevision: booking?.revision ?? null,
        slots,
      };
    },
    true,
  );
}

export async function bookPickup(
  pool: Pool,
  input: unknown,
  actor: PickupActor,
  now?: number,
): Promise<PickupMutationReceipt> {
  const trustedActor = actorKey(actor);
  const value = validateBookingIntent(input);
  return transaction(pool, async (client) => {
    const order = await loadOrder(
      client,
      value.orderId,
      actor,
      now ?? Date.now(),
      true,
    );
    requirePaid(order);
    const identity = { operationId: value.operationId, actorId: trustedActor };
    const operation = await beginOperation(
      client,
      identity,
      "book_pickup",
      order.id,
      value,
    );
    if (operation.previous) return operation.previous;
    const settings = await getPickupSettings(client);
    if (actor.kind === "buyer" && !settings.enabled)
      throw new PickupError(
        503,
        "PICKUP_SCHEDULING_DISABLED",
        "Contact the operator to arrange pickup.",
      );
    const site = await allowedSite(client, value.siteKey, order);
    if (
      order.revision !== value.expectedOrderRevision ||
      settings.revision !== value.expectedSettingsRevision ||
      site.revision !== value.expectedSiteRevision
    )
      throw new PickupError(
        409,
        "REVISION_CONFLICT",
        "Availability changed. Refresh and review the current choices.",
      );
    const before = await loadBooking(client, order.id);
    if (
      (before?.revision ?? null) !== value.expectedBookingRevision ||
      (before && before.revision >= 2147483647)
    )
      throw new PickupError(
        409,
        "PICKUP_BOOKING_CHANGED",
        "Your pickup changed. Review its current details before another change.",
      );
    const currentTime = now ?? Date.now();
    requireChangeWindow(before, actor, currentTime);
    const slot = generatePickupSlots(site, value.date, currentTime).find(
      (candidate) => candidate.id === value.slotId,
    );
    if (!slot)
      throw new PickupError(
        409,
        "PICKUP_SLOT_UNAVAILABLE",
        "That time is no longer available. Your existing pickup is unchanged.",
      );
    const state = await occupancy(
      client,
      Date.parse(slot.startsAt),
      Date.parse(slot.endsAt),
    );
    if (!slotHasCapacity(site, slot, state.bookings, state.buffers, order.id))
      throw new PickupError(
        409,
        "PICKUP_SLOT_FULL",
        "That time was just taken. Your existing pickup is unchanged.",
      );
    if (before)
      await client.query(
        `UPDATE pickup_bookings SET site_key=$2,site_label=$3,timezone=$4,starts_at=$5,ends_at=$6,
       travel_buffer_minutes=$7,reschedule_cutoff_hours=$8,status='scheduled',revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE order_key=$1`,
        [
          order.id,
          site.key,
          site.label,
          site.timezone,
          slot.startsAt,
          slot.endsAt,
          site.travelBufferMinutes,
          site.rescheduleCutoffHours,
        ],
      );
    else
      await client.query(
        `INSERT INTO pickup_bookings(booking_id,order_key,site_key,site_label,timezone,starts_at,ends_at,travel_buffer_minutes,reschedule_cutoff_hours,status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'scheduled')`,
        [
          randomUUID(),
          order.id,
          site.key,
          site.label,
          site.timezone,
          slot.startsAt,
          slot.endsAt,
          site.travelBufferMinutes,
          site.rescheduleCutoffHours,
        ],
      );
    const booking = (await loadBooking(client, order.id))!;
    await client.query(
      "UPDATE pickup_help_requests SET resolved_at=clock_timestamp() WHERE order_key=$1 AND resolved_at IS NULL",
      [order.id],
    );
    const receipt: PickupMutationReceipt = {
      operationId: identity.operationId,
      resourceKey: order.id,
      revision: booking.revision,
      replayed: false,
      booking,
    };
    await recordOperation(
      client,
      identity,
      "book_pickup",
      order.id,
      operation.hash,
      before,
      booking,
      receipt,
    );
    return receipt;
  });
}

export async function getCustomerPickupContext(
  pool: Pool,
  buyerHash: string,
  now = Date.now(),
): Promise<CustomerPickupContext> {
  return transaction(
    pool,
    async (client) => {
      const orders = await readBuyerOrders(client, buyerHash, now);
      const settings = await getPickupSettings(client);
      const sites = await listSites(client);
      const result: CustomerPickupContext = {
        enabled: settings.enabled,
        settingsRevision: settings.revision,
        orders: [],
      };
      for (const order of orders) {
        const booking = await loadBooking(client, order.id);
        const paid = order.state === "paid" && !order.reconciliationReason;
        const allowed = paid
          ? sites.filter(
              (site) =>
                site.active &&
                site.stockLocationKeys.includes(order.locationKey),
            )
          : [];
        const bookedSite = allowed.find(
          (site) => site.key === booking?.siteKey,
        );
        const helpRequested = Boolean(
          (
            await client.query(
              "SELECT 1 FROM pickup_help_requests WHERE order_key=$1 AND resolved_at IS NULL",
              [order.id],
            )
          ).rows.length,
        );
        const customerBooking = booking
          ? (({ travelBufferMinutes: _buffer, ...safe }) => safe)(booking)
          : null;
        result.orders.push({
          id: order.id,
          state: order.reconciliationReason
            ? "reconciliation_required"
            : order.state,
          revision: order.revision,
          createdAt: order.createdAt,
          booking: customerBooking,
          sites: allowed.map(publicSite),
          helpRequested,
          instructions:
            paid &&
            booking?.status === "scheduled" &&
            Date.parse(booking.endsAt) > now &&
            bookedSite
              ? bookedSite.privateInstructions
              : null,
          canSchedule: Boolean(
            settings.enabled &&
            paid &&
            allowed.length &&
            (!booking ||
              (booking.status !== "completed" &&
                Date.parse(booking.startsAt) - now >=
                  booking.rescheduleCutoffHours * 3_600_000)),
          ),
        });
      }
      return result;
    },
    true,
  );
}

async function listSites(client: PoolClient): Promise<PickupSite[]> {
  const sites = (
    await client.query<PickupSite>(
      `SELECT ${siteFields} FROM pickup_sites p ORDER BY site_key LIMIT 51`,
    )
  ).rows;
  if (sites.length > 50)
    throw new PickupError(
      503,
      "PICKUP_UNAVAILABLE",
      "Pickup configuration exceeds its safe bounds.",
    );
  return sites;
}

export async function getAdminPickupDashboard(
  pool: Pool,
): Promise<AdminPickupDashboard> {
  return transaction(
    pool,
    async (client) => {
      const settings = await getPickupSettings(client);
      const sites = await listSites(client);
      const stockLocations = (
        await client.query<{ key: string; label: string }>(
          "SELECT location_key AS key,name AS label FROM inventory_locations ORDER BY location_key LIMIT 1001",
        )
      ).rows;
      if (stockLocations.length > 1000)
        throw new PickupError(
          503,
          "PICKUP_UNAVAILABLE",
          "Review the fulfillment-stock configuration.",
        );
      const rows = (
        await client.query<
          BuyerOrder & { helpRequested: boolean; buyerAccessRevoked: boolean }
        >(
          `SELECT o.order_key AS id,o.state,o.location_key AS "locationKey",o.revision,o.created_at AS "createdAt",
       o.reconciliation_reason AS "reconciliationReason",
       (h.order_key IS NOT NULL AND h.resolved_at IS NULL) AS "helpRequested",
       EXISTS(SELECT 1 FROM admin_operations a WHERE a.action='revoke_pickup_access' AND a.resource_key=o.order_key::text) AS "buyerAccessRevoked"
       FROM orders o LEFT JOIN pickup_bookings b USING(order_key) LEFT JOIN pickup_help_requests h USING(order_key)
       WHERE o.state='paid' OR b.order_key IS NOT NULL
       ORDER BY CASE WHEN h.order_key IS NOT NULL AND h.resolved_at IS NULL THEN 0 WHEN b.status='needs_review' AND o.state<>'picked_up' THEN 1 WHEN b.order_key IS NULL THEN 2 ELSE 3 END,
       b.starts_at NULLS FIRST,o.created_at,o.order_key LIMIT 201`,
        )
      ).rows;
      const bookings = rows.length
        ? (
            await client.query<PickupBooking>(
              `SELECT ${bookingFields} FROM pickup_bookings b JOIN orders o USING(order_key) WHERE b.order_key=ANY($1::uuid[])`,
              [rows.slice(0, 200).map((row) => row.id)],
            )
          ).rows.map(bookingValue)
        : [];
      const byOrder = new Map(
        bookings.map((booking) => [booking.orderId, booking]),
      );
      return {
        settings,
        sites,
        stockLocations,
        truncated: rows.length > 200,
        orders: rows.slice(0, 200).map((row) => ({
          id: row.id,
          state: row.reconciliationReason
            ? "reconciliation_required"
            : row.state,
          revision: row.revision,
          createdAt: new Date(row.createdAt).toISOString(),
          stockLocationKey: row.locationKey,
          helpRequested: row.helpRequested,
          buyerAccessRevoked: row.buyerAccessRevoked,
          booking: byOrder.get(row.id) ?? null,
          sites:
            row.state === "paid" && !row.reconciliationReason
              ? sites
                  .filter(
                    (site) =>
                      site.active &&
                      site.stockLocationKeys.includes(row.locationKey),
                  )
                  .map(publicSite)
              : [],
        })),
      };
    },
    true,
  );
}

export async function requestPickupHelp(
  pool: Pool,
  input: unknown,
  actor: PickupActor,
  now?: number,
): Promise<PickupMutationReceipt> {
  const trusted = actorKey(actor);
  const value = validateOrderMutation(input, true);
  return transaction(pool, async (client) => {
    const order = await loadOrder(
      client,
      value.orderId,
      actor,
      now ?? Date.now(),
      true,
    );
    requirePaid(order);
    const identity = { actorId: trusted, operationId: value.operationId };
    const operation = await beginOperation(
      client,
      identity,
      "request_pickup_help",
      order.id,
      value,
    );
    if (operation.previous) return operation.previous;
    const booking = await loadBooking(client, order.id);
    if (
      order.revision !== value.expectedOrderRevision ||
      (booking?.revision ?? null) !== value.expectedBookingRevision
    )
      throw new PickupError(
        409,
        "REVISION_CONFLICT",
        "Review the current order and appointment before requesting help.",
      );
    await client.query(
      "INSERT INTO pickup_help_requests(order_key,requested_at) VALUES($1,clock_timestamp()) ON CONFLICT(order_key) DO UPDATE SET requested_at=clock_timestamp(),resolved_at=NULL",
      [order.id],
    );
    const receipt: PickupMutationReceipt = {
      operationId: identity.operationId,
      resourceKey: order.id,
      revision: booking?.revision ?? order.revision,
      replayed: false,
    };
    await recordOperation(
      client,
      identity,
      "request_pickup_help",
      order.id,
      operation.hash,
      null,
      { helpRequested: true },
      receipt,
    );
    return receipt;
  });
}

export async function revokePickupAccess(
  pool: Pool,
  input: unknown,
  actorId: string,
): Promise<PickupMutationReceipt> {
  const actor = { kind: "admin" as const, actorId };
  actorKey(actor);
  const value = validateOrderMutation(input, false);
  return transaction(pool, async (client) => {
    const order = await loadOrder(
      client,
      value.orderId,
      actor,
      Date.now(),
      true,
    );
    const identity = { actorId, operationId: value.operationId };
    const operation = await beginOperation(
      client,
      identity,
      "revoke_pickup_access",
      order.id,
      value,
    );
    if (operation.previous) return operation.previous;
    if (order.revision !== value.expectedOrderRevision)
      throw new PickupError(
        409,
        "REVISION_CONFLICT",
        "Review the current order before revoking browser access.",
      );
    const receipt: PickupMutationReceipt = {
      operationId: identity.operationId,
      resourceKey: order.id,
      revision: order.revision,
      replayed: false,
    };
    await recordOperation(
      client,
      identity,
      "revoke_pickup_access",
      order.id,
      operation.hash,
      null,
      { buyerAccessRevoked: true },
      receipt,
    );
    return receipt;
  });
}

export async function updatePickupSite(
  pool: Pool,
  key: string,
  input: unknown,
  actorId: string,
  now?: number,
): Promise<PickupMutationReceipt> {
  const value = validateSiteMutation(input, actorId, true);
  if (key !== value.site.key)
    throw new PickupError(
      400,
      "INVALID_PICKUP_INPUT",
      "The pickup point identity cannot change.",
    );
  return transaction(pool, async (client) => {
    const operation = await beginOperation(
      client,
      value.identity,
      "update_pickup_site",
      key,
      value,
    );
    if (operation.previous) return operation.previous;
    const before = await getPickupSite(client, key);
    if (!before)
      throw new PickupError(
        404,
        "PICKUP_SITE_NOT_FOUND",
        "This pickup point does not exist.",
      );
    if (
      before.revision !== value.expectedRevision ||
      before.revision >= 2147483647
    )
      throw new PickupError(
        409,
        "REVISION_CONFLICT",
        "Review the current pickup point before saving.",
      );
    await requireLocations(client, value.site.stockLocationKeys);
    const proposed: PickupSite = {
      ...value.site,
      revision: before.revision + 1,
    };
    const allSites = await listSites(client);
    const bySite = new Map(
      allSites.map((site) => [site.key, site.key === key ? proposed : site]),
    );
    const buffers = new Map(
      [...bySite].map(([siteKey, site]) => [siteKey, site.travelBufferMinutes]),
    );
    const rows = (
      await client.query<
        PickupBooking & { locationKey: string; orderRevision: number }
      >(
        `SELECT ${bookingFields},o.location_key AS "locationKey",o.revision AS "orderRevision"
       FROM pickup_bookings b JOIN orders o USING(order_key) WHERE b.ends_at>$1 AND o.state<>'picked_up'
       ORDER BY b.booking_id LIMIT 5001 FOR UPDATE OF o,b`,
        [new Date(now ?? Date.now())],
      )
    ).rows.map((row) => ({
      ...bookingValue(row),
      locationKey: row.locationKey,
      orderRevision: row.orderRevision,
    }));
    if (rows.length > 5000)
      throw new PickupError(
        503,
        "PICKUP_UNAVAILABLE",
        "The affected appointments cannot be safely bounded.",
      );
    const affected: { booking: (typeof rows)[number]; reasons: string[] }[] =
      [];
    for (const booking of rows) {
      const site = bySite.get(booking.siteKey);
      if (!site)
        throw new PickupError(
          503,
          "PICKUP_UNAVAILABLE",
          "An appointment's pickup point is unavailable.",
        );
      const reasons: string[] = [];
      if (booking.siteKey === key) {
        if (!proposed.active) reasons.push("Pickup point deactivated.");
        if (!proposed.stockLocationKeys.includes(booking.locationKey))
          reasons.push("Fulfillment-stock mapping removed.");
        if (
          before.privateInstructions !== proposed.privateInstructions ||
          before.label !== proposed.label ||
          before.area !== proposed.area ||
          before.timezone !== proposed.timezone
        )
          reasons.push("Arrival details or timezone changed.");
        const date = Temporal.Instant.from(booking.startsAt)
          .toZonedDateTimeISO(proposed.timezone)
          .toPlainDate()
          .toString();
        if (
          !generatePickupSlots(
            { ...proposed, noticeHours: 0, horizonDays: 28 },
            date,
            Date.parse(booking.startsAt) - 1,
          ).some(
            (slot) =>
              slot.startsAt === booking.startsAt &&
              slot.endsAt === booking.endsAt,
          )
        )
          reasons.push(
            "Appointment no longer matches approved hours or slot length.",
          );
      }
      if (
        !slotHasCapacity(
          {
            ...site,
            travelBufferMinutes: Math.max(
              site.travelBufferMinutes,
              booking.travelBufferMinutes,
            ),
          },
          booking,
          rows,
          buffers,
          booking.orderId,
        )
      )
        reasons.push("Capacity or shared-operator travel conflict.");
      if (reasons.length) affected.push({ booking, reasons });
    }
    const bookings = affected.map(({ booking, reasons }) => ({
      orderId: booking.orderId,
      bookingId: booking.id,
      siteLabel: booking.siteLabel,
      startsAt: booking.startsAt,
      reasons,
    }));
    const ack = createHash("sha256")
      .update(
        canonical({ beforeRevision: before.revision, proposed, affected }),
      )
      .digest("hex");
    const impact: PickupSiteImpact = { ack, bookings };
    if (
      (bookings.length && value.impactAck !== ack) ||
      (value.impactAck !== undefined && value.impactAck !== ack)
    )
      throw new PickupImpactError(impact);
    if (
      affected.some(
        ({ booking }) =>
          booking.status !== "needs_review" && booking.revision >= 2147483647,
      )
    )
      throw new PickupError(
        409,
        "REVISION_CONFLICT",
        "An affected appointment needs operator review.",
      );
    await client.query(
      `UPDATE pickup_sites SET label=$2,area=$3,timezone=$4,private_instructions=$5,active=$6,
      slot_minutes=$7,capacity=$8,notice_hours=$9,horizon_days=$10,reschedule_cutoff_hours=$11,travel_buffer_minutes=$12,
      weekly=$13::jsonb,exceptions=$14::jsonb,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE site_key=$1`,
      [
        key,
        proposed.label,
        proposed.area,
        proposed.timezone,
        proposed.privateInstructions,
        proposed.active,
        proposed.slotMinutes,
        proposed.capacity,
        proposed.noticeHours,
        proposed.horizonDays,
        proposed.rescheduleCutoffHours,
        proposed.travelBufferMinutes,
        JSON.stringify(proposed.weekly),
        JSON.stringify(proposed.exceptions),
      ],
    );
    await client.query(
      "DELETE FROM pickup_site_stock_locations WHERE site_key=$1",
      [key],
    );
    await client.query(
      "INSERT INTO pickup_site_stock_locations(site_key,location_key) SELECT $1,unnest($2::text[])",
      [key, proposed.stockLocationKeys],
    );
    await client.query(
      "UPDATE pickup_bookings SET status='needs_review',revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE booking_id=ANY($1::uuid[]) AND status<>'needs_review'",
      [bookings.map((booking) => booking.bookingId)],
    );
    const receipt: PickupMutationReceipt = {
      operationId: value.identity.operationId,
      resourceKey: key,
      revision: proposed.revision,
      replayed: false,
    };
    await recordOperation(
      client,
      value.identity,
      "update_pickup_site",
      key,
      operation.hash,
      safeSite(before),
      {
        ...safeSite(proposed),
        affectedBookings: bookings.map((booking) => booking.bookingId),
      },
      receipt,
    );
    return receipt;
  });
}
