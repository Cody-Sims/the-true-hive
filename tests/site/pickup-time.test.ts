import assert from "node:assert/strict";
import test from "node:test";
import type { PickupBooking, PickupSite } from "../../src/domain/pickup.ts";
import {
  generatePickupSlots,
  slotHasCapacity,
} from "../../src/server/pickup/time.ts";

function site(): PickupSite {
  return {
    key: "test-point",
    label: "Test collection point",
    area: "Test-only area",
    timezone: "America/New_York",
    privateInstructions: "",
    active: true,
    stockLocationKeys: ["test-stock"],
    slotMinutes: 30,
    capacity: 1,
    noticeHours: 12,
    horizonDays: 14,
    rescheduleCutoffHours: 0,
    travelBufferMinutes: 0,
    weekly: {
      0: [],
      1: [],
      2: [{ start: "18:00", end: "20:00" }],
      3: [],
      4: [],
      5: [],
      6: [],
    },
    exceptions: {},
    revision: 1,
  };
}

test("pickup availability uses site-local weekly hours and dated replacements", () => {
  const point = site();
  const now = Date.parse("2026-12-07T17:00:00Z");
  assert.deepEqual(
    generatePickupSlots(point, "2026-12-08", now).map((slot) => slot.startsAt),
    [
      "2026-12-08T23:00:00.000Z",
      "2026-12-08T23:30:00.000Z",
      "2026-12-09T00:00:00.000Z",
      "2026-12-09T00:30:00.000Z",
    ],
  );
  point.exceptions["2026-12-08"] = [];
  assert.deepEqual(generatePickupSlots(point, "2026-12-08", now), []);
  point.exceptions["2026-12-09"] = [{ start: "17:15", end: "18:15" }];
  assert.deepEqual(
    generatePickupSlots(point, "2026-12-09", now).map((slot) => slot.startsAt),
    ["2026-12-09T22:15:00.000Z", "2026-12-09T22:45:00.000Z"],
  );
});

test("pickup capacity counts simultaneous orders and enforces cross-site travel without releasing a rescheduled order first", () => {
  const point = site();
  point.capacity = 2;
  const slot = generatePickupSlots(
    point,
    "2026-12-08",
    Date.parse("2026-12-07T17:00:00Z"),
  )[0]!;
  const booking = (overrides: Partial<PickupBooking> = {}): PickupBooking => ({
    id: "test-booking",
    orderId: "test-order",
    siteKey: point.key,
    siteLabel: point.label,
    timezone: point.timezone,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    travelBufferMinutes: 0,
    status: "scheduled",
    rescheduleCutoffHours: 0,
    revision: 1,
    ...overrides,
  });
  const adjacent = [
    booking({ orderId: "first", endsAt: "2026-12-08T23:15:00.000Z" }),
    booking({ orderId: "second", startsAt: "2026-12-08T23:15:00.000Z" }),
  ];
  assert.equal(slotHasCapacity(point, slot, adjacent), true);
  assert.equal(
    slotHasCapacity(point, slot, [...adjacent, booking({ orderId: "third" })]),
    false,
  );
  point.capacity = 1;
  const own = booking({ status: "needs_review" });
  assert.equal(slotHasCapacity(point, slot, [own]), false);
  assert.equal(
    slotHasCapacity(point, slot, [own], new Map(), own.orderId),
    true,
  );
  assert.equal(
    slotHasCapacity(point, slot, [booking({ status: "completed" })]),
    true,
  );
  const town = booking({
    siteKey: "test-town",
    startsAt: "2026-12-09T00:00:00.000Z",
    endsAt: "2026-12-09T00:30:00.000Z",
  });
  const buffers = new Map([["test-town", 30]]);
  assert.equal(slotHasCapacity(point, slot, [town], buffers), true);
  assert.equal(
    slotHasCapacity(
      point,
      slot,
      [{ ...town, startsAt: "2026-12-08T23:59:00.000Z" }],
      buffers,
    ),
    false,
  );
  assert.equal(
    slotHasCapacity(
      point,
      slot,
      [{ ...town, travelBufferMinutes: 45 }],
      new Map(),
    ),
    false,
  );
});

test("pickup notice is inclusive at the boundary and the calendar horizon is site-local", () => {
  const point = site();
  assert.deepEqual(
    generatePickupSlots(
      point,
      "2026-12-08",
      Date.parse("2026-12-08T12:00:00Z"),
    ).map((slot) => slot.startsAt),
    ["2026-12-09T00:00:00.000Z", "2026-12-09T00:30:00.000Z"],
  );
  point.horizonDays = 1;
  assert.deepEqual(
    generatePickupSlots(
      point,
      "2026-12-08",
      Date.parse("2026-12-07T17:00:00Z"),
    ),
    [],
  );
  point.horizonDays = 14;
  point.timezone = "Asia/Kathmandu";
  assert.equal(
    generatePickupSlots(
      point,
      "2026-12-08",
      Date.parse("2026-12-07T00:00:00Z"),
    )[0]?.startsAt,
    "2026-12-08T12:15:00.000Z",
  );
  point.active = false;
  assert.deepEqual(
    generatePickupSlots(
      point,
      "2026-12-08",
      Date.parse("2026-12-07T00:00:00Z"),
    ),
    [],
  );
});

test("pickup slots skip DST gaps/transitions and distinguish repeated wall times by instant and offset", () => {
  const point = site();
  point.noticeHours = 0;
  point.weekly[0] = [{ start: "01:00", end: "04:00" }];
  const spring = generatePickupSlots(
    point,
    "2027-03-14",
    Date.parse("2027-03-13T12:00:00Z"),
  );
  assert.deepEqual(
    spring.map((slot) => slot.startsAt),
    [
      "2027-03-14T06:00:00.000Z",
      "2027-03-14T07:00:00.000Z",
      "2027-03-14T07:30:00.000Z",
    ],
  );
  point.weekly[0] = [{ start: "01:00", end: "03:00" }];
  const autumn = generatePickupSlots(
    point,
    "2026-11-01",
    Date.parse("2026-10-31T12:00:00Z"),
  );
  const repeated = autumn.filter((slot) => slot.label.startsWith("1:00 AM"));
  assert.equal(repeated.length, 2);
  assert.notEqual(repeated[0]!.id, repeated[1]!.id);
  assert.match(repeated[0]!.label, /UTC-04:00/);
  assert.match(repeated[1]!.label, /UTC-05:00/);
  for (const slot of [...spring, ...autumn])
    assert.equal(
      Date.parse(slot.endsAt) - Date.parse(slot.startsAt),
      30 * 60_000,
    );
});
