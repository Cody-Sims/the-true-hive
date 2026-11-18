import assert from "node:assert/strict";
import test from "node:test";
import { pickupSite } from "../fixtures/pickup.ts";
import {
  PickupError,
  validatePickupSite,
} from "../../src/server/pickup/rules.ts";

function fields() {
  const { revision: _revision, ...input } = pickupSite();
  return input;
}

test("pickup site validation requires explicit bounded settings and rejects malformed or overlapping schedules", () => {
  assert.deepEqual(validatePickupSite(fields()), fields());
  const invalid = [
    { ...fields(), timezone: "Not/AZone" },
    { ...fields(), timezone: "-05:00" },
    { ...fields(), capacity: "1" },
    { ...fields(), capacity: 0 },
    { ...fields(), noticeHours: null },
    { ...fields(), horizonDays: 29 },
    { ...fields(), active: "false" },
    { ...fields(), stockLocationKeys: ["test-stock", "test-stock"] },
    { ...fields(), weekly: { ...fields().weekly, 8: [] } },
    {
      ...fields(),
      weekly: { ...fields().weekly, 2: [{ start: "20:00", end: "18:00" }] },
    },
    {
      ...fields(),
      weekly: {
        ...fields().weekly,
        2: [
          { start: "18:00", end: "19:00" },
          { start: "18:30", end: "20:00" },
        ],
      },
    },
    { ...fields(), exceptions: { "2027-02-29": [] } },
    { ...fields(), privateInstructions: "x".repeat(2001) },
    { ...fields(), onHand: 100 },
    {
      ...fields(),
      weekly: { ...fields().weekly, 2: [{ start: ["18:00"], end: "19:00" }] },
    },
  ];
  for (const input of invalid)
    assert.throws(
      () => validatePickupSite(input),
      (error) => error instanceof PickupError && error.status === 400,
    );
});
