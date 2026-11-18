import test from "node:test";
import assert from "node:assert/strict";
import { createDemo, availableSlots, bookPickup, saveSchedule } from "../pickup/model.mjs";

test("pickup times respect each site's hours, date overrides, notice and horizon", () => {
  const state = createDemo();
  assert.deepEqual(availableSlots(state, "main", "2026-12-08").map((slot) => slot.time), ["18:00", "18:30", "19:00", "19:30"]);
  assert.deepEqual(availableSlots(state, "town", "2026-12-08"), []);
  assert.deepEqual(availableSlots(state, "town", "2026-12-12").map((slot) => slot.time), ["14:00", "14:30"]);
  state.sites[0].schedule.exceptions["2026-12-08"] = [];
  assert.deepEqual(availableSlots(state, "main", "2026-12-08"), []);
  state.sites[0].schedule.exceptions["2026-12-09"] = [{ start: "17:00", end: "18:00" }];
  assert.deepEqual(availableSlots(state, "main", "2026-12-09").map((slot) => slot.time), ["17:00", "17:30"]);
  state.now = "2026-12-09T05:30:00-05:00";
  assert.deepEqual(availableSlots(state, "main", "2026-12-09").map((slot) => slot.time), ["17:30"]);
  state.sites[0].schedule.policy.horizonDays = 1;
  assert.deepEqual(availableSlots(state, "main", "2026-12-10"), []);
  assert.deepEqual(availableSlots(state, "missing", "2026-12-09"), []);
  assert.deepEqual(availableSlots(state, "main", "not-a-date"), []);
});

test("booking rechecks capacity and payment, retries safely and keeps the old appointment on a failed change", () => {
  const state = createDemo();
  assert.equal(bookPickup(state, null).ok, false);
  const [first, second] = availableSlots(state, "main", "2026-12-08");
  const booked = bookPickup(state, { ...first, startsAt: "1900-01-01T00:00:00Z" });
  assert.equal(booked.ok, true);
  assert.equal(booked.booking.startsAt, first.startsAt, "use the canonical interval, not client-supplied times");
  assert.equal(state.bookings.length, 0, "input is unchanged");
  assert.deepEqual(booked.state.order, state.order, "booking is not payment or stock movement");
  const retried = bookPickup(booked.state, first);
  assert.equal(retried.state.bookings.length, 1);
  assert.equal(retried.booking.revision, booked.booking.revision);
  const occupied = structuredClone(booked.state);
  occupied.bookings.push({ ...second, orderId: "another-example", status: "scheduled" });
  assert.equal(bookPickup(occupied, second).ok, false);
  assert.equal(occupied.bookings.find((entry) => entry.orderId === state.order.id).id, first.id);
  const changed = bookPickup(booked.state, second);
  assert.equal(changed.ok, true);
  assert.equal(changed.state.bookings.length, 1);
  assert.equal(changed.booking.id, second.id);
  assert.equal(availableSlots(changed.state, "main", "2026-12-08").some((slot) => slot.id === first.id), true);
  state.order.payment = "pending";
  assert.equal(bookPickup(state, first).ok, false);
  assert.equal(state.bookings.length, 0);
});

test("operator hours are site-specific and changing booked hours requires explicit impact review", () => {
  const state = createDemo();
  const townSchedule = structuredClone(state.sites[1].schedule);
  townSchedule.weekly[5] = [{ start: "17:00", end: "18:00" }];
  const changedTown = saveSchedule(state, "town", townSchedule);
  assert.equal(changedTown.ok, true);
  assert.deepEqual(changedTown.state.sites[0], state.sites[0]);
  assert.deepEqual(availableSlots(changedTown.state, "town", "2026-12-11").map((slot) => slot.time), ["17:00", "17:30"]);
  const slot = availableSlots(state, "main", "2026-12-08")[0];
  const booked = bookPickup(state, slot).state;
  const closure = structuredClone(booked.sites[0].schedule);
  closure.exceptions[slot.date] = [];
  const blocked = saveSchedule(booked, "main", closure);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.affected[0].orderId, state.order.id);
  assert.equal(booked.bookings[0].status, "scheduled");
  const applied = saveSchedule(booked, "main", closure, { allowImpact: true });
  assert.equal(applied.ok, true);
  assert.equal(applied.state.bookings[0].startsAt, slot.startsAt);
  assert.equal(applied.state.bookings[0].status, "needs_review");
  assert.deepEqual(availableSlots(applied.state, "main", slot.date), []);
  const invalid = structuredClone(closure);
  invalid.weekly[4] = [{ start: "20:00", end: "18:00" }];
  assert.equal(saveSchedule(booked, "main", invalid).ok, false);
});

test("capacity uses concurrent occupancy when slot lengths change, not the sum of adjacent bookings", () => {
  const state = createDemo();
  state.sites[0].schedule.policy.duration = 15;
  const [first, second] = availableSlots(state, "main", "2026-12-08");
  state.bookings = [
    { ...first, orderId: "example-a", status: "scheduled" },
    { ...second, orderId: "example-b", status: "scheduled" },
  ];
  state.sites[0].schedule.policy.duration = 30;
  state.sites[0].schedule.policy.capacity = 2;
  assert.equal(availableSlots(state, "main", first.date).some((slot) => slot.time === "18:00"), true);
  state.sites[0].schedule.policy.capacity = 1;
  assert.equal(availableSlots(state, "main", first.date).some((slot) => slot.time === "18:00"), false);
});
