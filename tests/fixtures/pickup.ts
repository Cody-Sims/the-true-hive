import type { PickupSite } from "../../src/domain/pickup.ts";

export function pickupSite(overrides: Partial<PickupSite> = {}): PickupSite {
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
    ...overrides,
  };
}
