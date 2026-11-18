import { Temporal } from "@js-temporal/polyfill";
import type {
  PickupSiteFields,
  PickupWeeklyHours,
  PickupWindow,
  PickupSiteImpact,
} from "../../domain/pickup.ts";
import { isRecordKey } from "../inventory/rules.ts";
import { wallMinutes } from "./time.ts";

export function validateAvailabilityQuery(input: unknown) {
  const value = object(input, "request");
  only(value, ["orderId", "siteKey", "from", "days"], "request");
  return {
    orderId: uuid(value["orderId"], "orderId"),
    siteKey: key(value["siteKey"], "siteKey"),
    from: pickupDate(value["from"]),
    days: integer(value["days"], "days", 1, 7),
  };
}

export function validateBookingIntent(input: unknown) {
  const value = object(input, "request");
  only(
    value,
    [
      "operationId",
      "orderId",
      "siteKey",
      "date",
      "slotId",
      "expectedOrderRevision",
      "expectedSiteRevision",
      "expectedSettingsRevision",
      "expectedBookingRevision",
    ],
    "request",
  );
  const slotId = value["slotId"];
  if (typeof slotId !== "string" || !/^[0-9a-f]{64}$/.test(slotId))
    invalid("slotId", "Select an authoritative available time.");
  return {
    operationId: uuid(value["operationId"], "operationId"),
    orderId: uuid(value["orderId"], "orderId"),
    siteKey: key(value["siteKey"], "siteKey"),
    date: pickupDate(value["date"]),
    slotId,
    expectedOrderRevision: integer(
      value["expectedOrderRevision"],
      "expectedOrderRevision",
      1,
      2147483647,
    ),
    expectedSiteRevision: integer(
      value["expectedSiteRevision"],
      "expectedSiteRevision",
      1,
      2147483647,
    ),
    expectedSettingsRevision: integer(
      value["expectedSettingsRevision"],
      "expectedSettingsRevision",
      1,
      2147483647,
    ),
    expectedBookingRevision:
      value["expectedBookingRevision"] === null
        ? null
        : integer(
            value["expectedBookingRevision"],
            "expectedBookingRevision",
            1,
            2147483647,
          ),
  };
}

export function validateSettingsMutation(input: unknown, actorId: string) {
  const value = object(input, "request");
  only(value, ["operationId", "expectedRevision", "enabled"], "request");
  if (typeof actorId !== "string" || !/^[a-zA-Z0-9._:-]{1,128}$/.test(actorId))
    invalid("actor", "A trusted operator is required.");
  return {
    identity: {
      operationId: uuid(value["operationId"], "operationId"),
      actorId,
    },
    expectedRevision: integer(
      value["expectedRevision"],
      "expectedRevision",
      1,
      2147483647,
    ),
    enabled: bool(value["enabled"], "enabled"),
  };
}

export function validateOrderMutation(input: unknown, withBooking: boolean) {
  const value = object(input, "request");
  only(
    value,
    [
      "operationId",
      "orderId",
      "expectedOrderRevision",
      ...(withBooking ? ["expectedBookingRevision"] : []),
    ],
    "request",
  );
  return {
    operationId: uuid(value["operationId"], "operationId"),
    orderId: uuid(value["orderId"], "orderId"),
    expectedOrderRevision: integer(
      value["expectedOrderRevision"],
      "expectedOrderRevision",
      1,
      2147483647,
    ),
    ...(withBooking
      ? {
          expectedBookingRevision:
            value["expectedBookingRevision"] === null
              ? null
              : integer(
                  value["expectedBookingRevision"],
                  "expectedBookingRevision",
                  1,
                  2147483647,
                ),
        }
      : {}),
  };
}

export class PickupError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string> | undefined;
  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string>,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export interface PickupIdentity {
  operationId: string;
  actorId: string;
}

export class PickupImpactError extends PickupError {
  readonly impact: PickupSiteImpact;
  constructor(impact: PickupSiteImpact) {
    super(
      409,
      "PICKUP_IMPACT_REVIEW_REQUIRED",
      "Review the affected appointments before changing this pickup point.",
    );
    this.impact = impact;
  }
}

function uuid(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    invalid(field, "A UUID operation or order identity is required.");
  return value.toLowerCase();
}

export function validateSiteMutation(
  input: unknown,
  actorId: string,
  editing = false,
) {
  const value = object(input, "request");
  only(
    value,
    editing
      ? ["operationId", "expectedRevision", "site", "impactAck"]
      : ["operationId", "site"],
    "request",
  );
  if (typeof actorId !== "string" || !/^[a-zA-Z0-9._:-]{1,128}$/.test(actorId))
    invalid("actor", "A trusted operator is required.");
  const impactAck = value["impactAck"];
  if (
    impactAck !== undefined &&
    (typeof impactAck !== "string" || !/^[0-9a-f]{64}$/.test(impactAck))
  )
    invalid("impactAck", "Review the current affected appointments.");
  return {
    identity: {
      operationId: uuid(value["operationId"], "operationId"),
      actorId,
    },
    site: validatePickupSite(value["site"]),
    ...(editing
      ? {
          expectedRevision: integer(
            value["expectedRevision"],
            "expectedRevision",
            1,
            2147483647,
          ),
        }
      : {}),
    ...(typeof impactAck === "string" ? { impactAck } : {}),
  };
}
function invalid(field: string, message: string): never {
  throw new PickupError(400, "INVALID_PICKUP_INPUT", message, {
    [field]: message,
  });
}

function object(input: unknown, field: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    invalid(field, "A pickup JSON object is required.");
  return input as Record<string, unknown>;
}

function only(
  input: Record<string, unknown>,
  allowed: string[],
  field: string,
) {
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    invalid(field, "Unsupported pickup fields were provided.");
}

function text(
  value: unknown,
  field: string,
  maximum: number,
  empty = false,
): string {
  if (
    typeof value !== "string" ||
    (!empty && !value.trim()) ||
    [...value].length > maximum ||
    value.includes("\0") ||
    /[\ud800-\udfff]/u.test(value)
  )
    invalid(
      field,
      `Use ${empty ? "at most" : "1 to"} ${maximum} characters of plain text.`,
    );
  return value.trim();
}

function integer(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  )
    invalid(field, `Choose a whole number from ${min} to ${max}.`);
  return value;
}

function bool(value: unknown, field: string): boolean {
  if (typeof value !== "boolean")
    invalid(field, "An explicit choice is required.");
  return value;
}

function key(value: unknown, field: string): string {
  if (!isRecordKey(value)) invalid(field, "Choose a valid stable record key.");
  return value;
}

export function pickupDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    invalid("date", "Choose a valid calendar date.");
  try {
    Temporal.PlainDate.from(value);
  } catch {
    invalid("date", "Choose a real calendar date.");
  }
  return value;
}

function windows(value: unknown, field: string): PickupWindow[] {
  if (!Array.isArray(value) || value.length > 4)
    invalid(field, "Use at most four non-overlapping windows.");
  const result = value
    .map((input) => {
      const window = object(input, field);
      only(window, ["start", "end"], field);
      const start = text(window["start"], field, 5);
      const end = text(window["end"], field, 5);
      try {
        if (wallMinutes(end) <= wallMinutes(start)) throw new RangeError();
      } catch {
        invalid(
          field,
          "End must be after start on the same day. Use HH:MM times.",
        );
      }
      return { start, end };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
  if (
    result.some(
      (window, index) => index > 0 && result[index - 1]!.end > window.start,
    )
  )
    invalid(field, "Pickup windows cannot overlap.");
  return result;
}

export function validatePickupSite(input: unknown): PickupSiteFields {
  const value = object(input, "site");
  only(
    value,
    [
      "key",
      "label",
      "area",
      "timezone",
      "privateInstructions",
      "active",
      "stockLocationKeys",
      "slotMinutes",
      "capacity",
      "noticeHours",
      "horizonDays",
      "rescheduleCutoffHours",
      "travelBufferMinutes",
      "weekly",
      "exceptions",
    ],
    "site",
  );
  const zone = text(value["timezone"], "timezone", 80);
  let timezone: string;
  try {
    if (/^[+-]/.test(zone)) throw new RangeError();
    timezone = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
    }).resolvedOptions().timeZone;
  } catch {
    invalid("timezone", "Choose an IANA timezone, not a fixed UTC offset.");
  }
  const locations = value["stockLocationKeys"];
  if (
    !Array.isArray(locations) ||
    locations.length < 1 ||
    locations.length > 20 ||
    new Set(locations).size !== locations.length
  )
    invalid(
      "stockLocationKeys",
      "Choose 1 to 20 distinct fulfillment-stock locations.",
    );
  const stockLocationKeys = locations
    .map((location) => key(location, "stockLocationKeys"))
    .sort();
  const week = object(value["weekly"], "weekly");
  if (
    Object.keys(week).length !== 7 ||
    Object.keys(week).some((day) => !/^[0-6]$/.test(day))
  )
    invalid(
      "weekly",
      "Specify all seven weekdays; use empty windows for closed days.",
    );
  const weekly = Object.fromEntries(
    Array.from({ length: 7 }, (_, day) => [
      day,
      windows(week[day], `weekly.${day}`),
    ]),
  ) as PickupWeeklyHours;
  const overrides = object(value["exceptions"], "exceptions");
  if (Object.keys(overrides).length > 128)
    invalid("exceptions", "Keep at most 128 dated exceptions.");
  const exceptions = Object.fromEntries(
    Object.entries(overrides)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, hours]) => [
        pickupDate(date),
        windows(hours, `exceptions.${date}`),
      ]),
  );
  const active = bool(value["active"], "active");
  if (
    active &&
    ![...Object.values(weekly), ...Object.values(exceptions)].some(
      (hours) => hours.length,
    )
  )
    invalid(
      "weekly",
      "An active pickup point needs at least one collection window.",
    );
  const slotMinutes = integer(value["slotMinutes"], "slotMinutes", 15, 60);
  if (![15, 30, 60].includes(slotMinutes))
    invalid("slotMinutes", "Choose 15, 30 or 60 minute appointments.");
  return {
    key: key(value["key"], "key"),
    label: text(value["label"], "label", 160),
    area: text(value["area"], "area", 160, true),
    timezone,
    privateInstructions: text(
      value["privateInstructions"],
      "privateInstructions",
      2000,
      true,
    ),
    active,
    stockLocationKeys,
    weekly,
    exceptions,
    slotMinutes: slotMinutes as 15 | 30 | 60,
    capacity: integer(value["capacity"], "capacity", 1, 20),
    noticeHours: integer(value["noticeHours"], "noticeHours", 0, 168),
    horizonDays: integer(value["horizonDays"], "horizonDays", 1, 28),
    rescheduleCutoffHours: integer(
      value["rescheduleCutoffHours"],
      "rescheduleCutoffHours",
      0,
      168,
    ),
    travelBufferMinutes: integer(
      value["travelBufferMinutes"],
      "travelBufferMinutes",
      0,
      240,
    ),
  };
}
