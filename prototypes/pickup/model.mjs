export const SAMPLE_DATES = Array.from({ length: 14 }, (_, day) => `2026-12-${String(7 + day).padStart(2, "0")}`);
export const ZONE = "America/New_York";
export const SAMPLE_OFFSET = "-05:00";

export function createDemo() {
  const weekly = (entries) => Object.fromEntries(Array.from({ length: 7 }, (_, day) => [day, entries[day] ?? []]));
  const policy = { duration: 30, capacity: 1, noticeHours: 12, horizonDays: 14 };
  return {
    now: "2026-12-07T12:00:00-05:00",
    order: { id: "TH-DEMO-1048", payment: "paid", collected: false, stockLocation: "demo-stock-authority" },
    forceFull: false,
    needsHelp: false,
    sites: [
      { id: "main", name: "Main pickup point", area: "Example area A", description: "More evening options. A simple, local collection.", schedule: { policy: { ...policy }, weekly: weekly({ 2: [{ start: "18:00", end: "20:00" }], 4: [{ start: "18:00", end: "20:00" }], 6: [{ start: "10:00", end: "12:00" }] }), exceptions: {} } },
      { id: "town", name: "Town meetup point", area: "Example area B", description: "A smaller weekend window, planned in advance.", schedule: { policy: { ...policy }, weekly: weekly({ 6: [{ start: "14:00", end: "15:00" }] }), exceptions: {} } },
    ],
    bookings: [],
  };
}

const minutes = (time) => typeof time === "string" && /^\d{2}:\d{2}$/.test(time) && Number(time.slice(0, 2)) < 24 && Number(time.slice(3)) < 60
  ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : NaN;
const clock = (value) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const active = (booking) => ["scheduled", "needs_review"].includes(booking.status);
const overlaps = (a, b) => Date.parse(a.startsAt) < Date.parse(b.endsAt) && Date.parse(b.startsAt) < Date.parse(a.endsAt);
const windowsFor = (site, date) => site.schedule.exceptions[date]
  ?? site.schedule.weekly[new Date(`${date}T12:00:00${SAMPLE_OFFSET}`).getUTCDay()] ?? [];

function peakOccupancy(bookings, interval) {
  const events = bookings.filter((booking) => active(booking) && overlaps(booking, interval)).flatMap((booking) => [
    [Math.max(Date.parse(booking.startsAt), Date.parse(interval.startsAt)), 1],
    [Math.min(Date.parse(booking.endsAt), Date.parse(interval.endsAt)), -1],
  ]);
  // Ends sort before starts: back-to-back appointments do not overlap.
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let count = 0;
  let peak = 0;
  for (const [, delta] of events) { count += delta; peak = Math.max(peak, count); }
  return peak;
}

// Only the two labeled December example weeks use this fixed offset.
function rawSlots(site, date) {
  if (!SAMPLE_DATES.includes(date) || ![15, 30, 60].includes(site.schedule.policy.duration)) return [];
  const slots = [];
  const duration = site.schedule.policy.duration;
  for (const window of windowsFor(site, date)) {
    for (let start = minutes(window.start); start + duration <= minutes(window.end); start += duration) {
      const time = clock(start);
      slots.push({
        id: `${site.id}:${date}:${time}`, siteId: site.id, date, time,
        startsAt: new Date(`${date}T${time}:00${SAMPLE_OFFSET}`).toISOString(),
        endsAt: new Date(`${date}T${clock(start + duration)}:00${SAMPLE_OFFSET}`).toISOString(),
      });
    }
  }
  return slots;
}

export function availableSlots(state, siteId, date) {
  const site = state.sites.find((entry) => entry.id === siteId);
  if (!site || !SAMPLE_DATES.includes(date) || state.forceFull || state.order.payment !== "paid" || state.order.collected) return [];
  const today = new Date(state.now).toLocaleDateString("en-CA", { timeZone: ZONE });
  const daysAhead = (Date.parse(`${date}T12:00:00${SAMPLE_OFFSET}`) - Date.parse(`${today}T12:00:00${SAMPLE_OFFSET}`)) / 86400000;
  const policy = site.schedule.policy;
  if (daysAhead < 0 || daysAhead >= policy.horizonDays) return [];
  return rawSlots(site, date).filter((slot) => Date.parse(slot.startsAt) >= Date.parse(state.now) + policy.noticeHours * 3600000
    && peakOccupancy(state.bookings.filter((booking) => booking.siteId === siteId
      && booking.orderId !== state.order.id), slot) < policy.capacity);
}

export function dateLabel(date, short = false) {
  return new Date(`${date}T12:00:00${SAMPLE_OFFSET}`).toLocaleDateString("en-US", {
    timeZone: ZONE, weekday: short ? "short" : "long", month: short ? "short" : "long", day: "numeric",
  });
}

export function timeLabel(time) {
  return new Date(`2026-12-07T${time}:00${SAMPLE_OFFSET}`).toLocaleTimeString("en-US", { timeZone: ZONE, hour: "numeric", minute: "2-digit" });
}

export function bookPickup(state, requested) {
  if (state.order.payment !== "paid" || state.order.collected)
    return { ok: false, message: "Payment must be verified and the order still awaiting pickup." };
  const previous = state.bookings.find((booking) => booking.orderId === state.order.id && active(booking));
  if (previous && previous.id === requested?.id && previous.status === "scheduled")
    return { ok: true, state, booking: previous };
  const slot = availableSlots(state, requested?.siteId, requested?.date).find((entry) => entry.id === requested?.id);
  if (!slot) return { ok: false, message: `That time is no longer available. Choose another time.${previous ? " Your current pickup is unchanged." : ""}` };
  const booking = { ...slot, orderId: state.order.id, status: "scheduled", revision: (previous?.revision ?? 0) + 1 };
  return {
    ok: true, booking,
    state: { ...state, needsHelp: false, bookings: [...state.bookings.filter((entry) => entry.orderId !== state.order.id), booking] },
  };
}
function validWindows(windows) {
  if (!Array.isArray(windows) || windows.length > 4
    || windows.some((window) => !window || !Number.isFinite(minutes(window.start)) || !(minutes(window.end) > minutes(window.start)))) return false;
  return [...windows].sort((a, b) => minutes(a.start) - minutes(b.start))
    .every((window, index, all) => index === 0 || minutes(all[index - 1].end) <= minutes(window.start));
}

export function saveSchedule(state, siteId, schedule, { allowImpact = false } = {}) {
  const site = state.sites.find((entry) => entry.id === siteId);
  if (!site) return { ok: false, message: "Choose an example location." };
  const p = schedule?.policy;
  if (!p || ![15, 30, 60].includes(p.duration) || !Number.isInteger(p.capacity) || p.capacity < 1 || p.capacity > 5
    || !Number.isInteger(p.noticeHours) || p.noticeHours < 0 || p.noticeHours > 168
    || !Number.isInteger(p.horizonDays) || p.horizonDays < 1 || p.horizonDays > 14
    || !schedule.weekly || Array.from({ length: 7 }, (_, day) => day).some((day) => !validWindows(schedule.weekly[day]))
    || !schedule.exceptions || Object.entries(schedule.exceptions).some(([date, windows]) => !SAMPLE_DATES.includes(date) || !validWindows(windows)))
    return { ok: false, message: "Check the hours and limits. End must be after start, windows cannot overlap, and this study has 14 example days." };
  const nextSite = { ...site, schedule: structuredClone(schedule) };
  const appointments = state.bookings.filter((booking) => active(booking) && booking.siteId === siteId);
  const affected = appointments.filter((booking) => {
    const start = minutes(booking.time);
    const end = start + (Date.parse(booking.endsAt) - Date.parse(booking.startsAt)) / 60000;
    return !windowsFor(nextSite, booking.date).some((window) => minutes(window.start) <= start && minutes(window.end) >= end)
      || peakOccupancy(appointments, booking) > p.capacity;
  });
  if (affected.length && !allowImpact)
    return { ok: false, affected, message: `${affected.length} existing demo pickup(s) need review before applying these hours.` };
  return {
    ok: true, affected,
    state: {
      ...state, sites: state.sites.map((entry) => entry.id === siteId ? nextSite : entry),
      bookings: state.bookings.map((booking) => affected.includes(booking) ? { ...booking, status: "needs_review" } : booking),
    },
  };
}
