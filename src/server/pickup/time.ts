import { createHash } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import type {
  PickupBooking,
  PickupSite,
  PickupSlot,
} from "../../domain/pickup.ts";

export function slotHasCapacity(
  site: PickupSite,
  slot: Pick<PickupSlot, "startsAt" | "endsAt">,
  bookings: PickupBooking[],
  siteBuffers: ReadonlyMap<string, number> = new Map(),
  excludeOrderId?: string,
): boolean {
  const start = Date.parse(slot.startsAt);
  const end = Date.parse(slot.endsAt);
  if (
    !Number.isFinite(start) ||
    !(end > start) ||
    !Number.isInteger(site.capacity) ||
    site.capacity < 1 ||
    site.capacity > 20
  )
    throw new RangeError("Invalid pickup capacity interval.");
  const events: [number, number][] = [];
  for (const booking of bookings) {
    if (booking.status === "completed" || booking.orderId === excludeOrderId)
      continue;
    const otherStart = Date.parse(booking.startsAt);
    const otherEnd = Date.parse(booking.endsAt);
    if (!Number.isFinite(otherStart) || !(otherEnd > otherStart))
      throw new RangeError("Invalid reserved pickup interval.");
    if (booking.siteKey !== site.key) {
      const buffer = Math.max(
        site.travelBufferMinutes,
        booking.travelBufferMinutes,
        siteBuffers.get(booking.siteKey) ?? 0,
      );
      if (!Number.isInteger(buffer) || buffer < 0 || buffer > 240)
        throw new RangeError("Invalid pickup travel buffer.");
      if (
        start < otherEnd + buffer * 60_000 &&
        otherStart - buffer * 60_000 < end
      )
        return false;
    } else if (start < otherEnd && otherStart < end) {
      events.push(
        [Math.max(start, otherStart), 1],
        [Math.min(end, otherEnd), -1],
      );
    }
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let count = 0;
  for (const [, delta] of events) {
    count += delta;
    if (count >= site.capacity) return false;
  }
  return true;
}

export function wallMinutes(value: string): number {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))
    throw new RangeError("Invalid pickup window.");
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

function clock(value: Temporal.ZonedDateTime) {
  return `${value.hour % 12 || 12}:${String(value.minute).padStart(2, "0")} ${value.hour < 12 ? "AM" : "PM"}`;
}

export function generatePickupSlots(
  site: PickupSite,
  date: string,
  now = Date.now(),
): PickupSlot[] {
  if (
    ![15, 30, 60].includes(site.slotMinutes) ||
    !Number.isInteger(site.noticeHours) ||
    site.noticeHours < 0 ||
    site.noticeHours > 168 ||
    !Number.isInteger(site.horizonDays) ||
    site.horizonDays < 1 ||
    site.horizonDays > 28
  )
    throw new RangeError("Invalid pickup slot policy.");
  if (!site.active) return [];
  const day = Temporal.PlainDate.from(date);
  const today = Temporal.Instant.fromEpochMilliseconds(now)
    .toZonedDateTimeISO(site.timezone)
    .toPlainDate();
  const daysAhead = today.until(day, { largestUnit: "days" }).days;
  if (daysAhead < 0 || daysAhead >= site.horizonDays) return [];
  const windows =
    site.exceptions[date] ??
    site.weekly[(day.dayOfWeek % 7) as keyof typeof site.weekly];
  if (!Array.isArray(windows) || windows.length > 4)
    throw new RangeError("Invalid pickup windows.");
  const ranges = windows
    .map(
      (window) => [wallMinutes(window.start), wallMinutes(window.end)] as const,
    )
    .sort(([a], [b]) => a - b);
  if (
    ranges.some(
      ([start, end], index) =>
        end <= start || (index > 0 && ranges[index - 1]![1] > start),
    )
  )
    throw new RangeError("Pickup windows must be ordered and non-overlapping.");
  const slots = new Map<string, PickupSlot>();
  const cutoff = now + site.noticeHours * 3_600_000;
  for (const [from, until] of ranges) {
    for (
      let minute = from;
      minute + site.slotMinutes <= until;
      minute += site.slotMinutes
    ) {
      const local = day.toPlainDateTime({
        hour: Math.floor(minute / 60),
        minute: minute % 60,
      });
      for (const disambiguation of ["earlier", "later"] as const) {
        const start = Temporal.ZonedDateTime.from(
          {
            year: day.year,
            month: day.month,
            day: day.day,
            hour: local.hour,
            minute: local.minute,
            timeZone: site.timezone,
          },
          { disambiguation, overflow: "reject" },
        );
        if (
          !start.toPlainDateTime().equals(local) ||
          start.epochMilliseconds < cutoff
        )
          continue;
        const end = start.add({ minutes: site.slotMinutes });
        const transition = start.getTimeZoneTransition("next");
        if (
          !end.toPlainDate().equals(day) ||
          end.hour * 60 + end.minute > until ||
          start.offset !== end.offset ||
          (transition && transition.epochMilliseconds <= end.epochMilliseconds)
        )
          continue;
        const startsAt = new Date(start.epochMilliseconds).toISOString();
        const endsAt = new Date(end.epochMilliseconds).toISOString();
        slots.set(startsAt, {
          id: createHash("sha256")
            .update(JSON.stringify([site.key, site.revision, startsAt, endsAt]))
            .digest("hex"),
          siteKey: site.key,
          siteRevision: site.revision,
          date,
          timezone: site.timezone,
          startsAt,
          endsAt,
          label: `${clock(start)} - ${clock(end)} (UTC${start.offset})`,
        });
      }
    }
  }
  return [...slots.values()].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  );
}
