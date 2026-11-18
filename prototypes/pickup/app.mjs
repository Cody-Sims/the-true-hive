import { createDemo, availableSlots, bookPickup, saveSchedule, SAMPLE_DATES, ZONE, dateLabel, timeLabel } from "./model.mjs";
import { escapeHtml as e } from "../scripts/dom.mjs";

let state = createDemo();
const initialUI = (view = "customer") => ({ view, siteId: "main", date: "2026-12-08", week: 0, slot: null, rescheduling: false, operatorSite: "main", hoursDirty: false });
let ui = initialUI(new URLSearchParams(location.search).get("view") === "operator" ? "operator" : "customer");
let pendingSchedule;
const main = document.querySelector("#main");
const feedback = document.querySelector("#feedback");
const impactDialog = document.querySelector("#impact-review");
const weekdays = [[1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"], [6, "Saturday"], [0, "Sunday"]];
const currentBooking = () => state.bookings.find((booking) => booking.orderId === state.order.id && ["scheduled", "needs_review"].includes(booking.status));
const currentSite = () => state.sites.find((site) => site.id === ui.siteId);
const operatorSite = () => state.sites.find((site) => site.id === ui.operatorSite);
const interval = (slot) => [slot.startsAt, slot.endsAt].map((date) => new Date(date).toLocaleTimeString("en-US", { timeZone: ZONE, hour: "numeric", minute: "2-digit" })).join(" - ");
const message = (text, error = false) => { feedback.textContent = text; feedback.dataset.error = String(error); };
const focusHeading = () => main.querySelector("h1")?.focus();
const hero = (eyebrow, title, description) => `<div class="hero"><div><p class="eyebrow">${eyebrow}</p><h1 tabindex="-1">${title}</h1><p class="lede">${description}</p></div><div class="sample-stamp"><p class="eyebrow">Example calendar</p><strong>December</strong><small>7 - 20 / 2026</small><small>Eastern Time (EST)</small></div></div>`;

function chooseDate() {
  const dates = SAMPLE_DATES.slice(ui.week * 7, ui.week * 7 + 7);
  if (!dates.includes(ui.date) || !availableSlots(state, ui.siteId, ui.date).length)
    ui.date = dates.find((date) => availableSlots(state, ui.siteId, date).length) ?? dates[0];
}

function receipt(booking) {
  const site = state.sites.find((entry) => entry.id === booking.siteId);
  const review = booking.status === "needs_review";
  return `<section class="card receipt" aria-label="Demo booking receipt"><span class="tick" aria-hidden="true">${review ? "!" : "&#10003;"}</span><p class="eyebrow section-bottom">${e(state.order.id)} / Fictional confirmation</p><h1 tabindex="-1">${review ? "Your pickup needs review." : "Pickup confirmed."}</h1><p class="muted">${review ? "The hours changed. Your original appointment is kept while you arrange another time." : "A little local goodness, with a plan to pick it up."}</p><div class="receipt-grid"><dl><div><dt>Pickup point</dt><dd>${e(site.name)}<br><small>${e(site.area)} / no real address</small></dd></div><div><dt>Day and time</dt><dd>${e(dateLabel(booking.date))}, 2026<br>${e(interval(booking))} EST</dd></div><div><dt>Status</dt><dd>${review ? "Needs operator review" : "Scheduled in this demo"} / not collected</dd></div></dl><div class="arrival"><h2>Arrival details</h2><p class="section-bottom">Real directions would be shown privately after secure order verification. No private address or route is stored in this study.</p><p>No real order was booked and no confirmation message was sent.</p></div></div><div class="actions"><button type="button" data-action="reschedule">Change demo pickup</button><button type="button" class="secondary" data-view="operator">See operator queue</button></div></section>`;
}

function customer() {
  const booking = currentBooking();
  if (booking && !ui.rescheduling) return receipt(booking);
  chooseDate();
  const paid = state.order.payment === "paid";
  const dates = SAMPLE_DATES.slice(ui.week * 7, ui.week * 7 + 7);
  const slots = availableSlots(state, ui.siteId, ui.date);
  if (ui.slot && !slots.some((slot) => slot.id === ui.slot.id)) ui.slot = null;
  const site = currentSite();
  return `${hero(`${e(state.order.id)} / ${paid ? "Payment verified (demo)" : "Payment processing (demo)"}`, "Good things,<br>picked up.", "Choose the place and time that works for you. We'll keep the details together.")}
    ${!paid ? '<div class="warning"><strong>Payment is still being verified.</strong>No pickup can be booked until the server confirms payment. This example does not charge anything.</div>' : ""}
    ${booking ? `<div class="warning"><strong>Your current pickup is kept.</strong>${e(dateLabel(booking.date))} / ${e(interval(booking))} EST. It changes only after a new time is confirmed.<button type="button" class="text-button" data-action="keep-booking">Keep current pickup</button></div>` : ""}
    <div class="customer-grid"><fieldset class="booking-choices" ${paid ? "" : "disabled"} aria-label="Pickup choices">
      <section class="card"><div class="card-heading"><span class="number" aria-hidden="true">01</span><h2>Choose your pickup point.</h2></div><div class="sites" role="group" aria-label="Pickup location">${state.sites.map((entry, index) => `<button type="button" id="site-${entry.id}" class="site-choice" data-site="${entry.id}" aria-pressed="${entry.id === ui.siteId}"><span class="site-symbol" aria-hidden="true">${index === 0 ? "A" : "B"}</span><strong>${e(entry.name)}</strong><span>${e(entry.area)}</span><span>${e(entry.description)}</span></button>`).join("")}</div><p class="help section-bottom">Fictional points, not public pickup addresses. Real directions stay private.</p></section>
      <section class="card"><div class="card-heading"><span class="number" aria-hidden="true">02</span><h2>Find a little time.</h2></div><p class="help">All times are Eastern Time (EST / America/New_York), not your device's timezone.</p><div class="calendar-toolbar"><strong>December ${ui.week ? "14 - 20" : "7 - 13"}, 2026</strong><div class="week-buttons"><button type="button" class="secondary" data-week="0" ${ui.week === 0 ? "disabled" : ""}>Previous week</button><button type="button" class="secondary" data-week="1" ${ui.week === 1 ? "disabled" : ""}>Next week</button></div></div>
      <div class="dates" role="group" aria-label="Pickup date">${dates.map((date) => {
        const hasTimes = availableSlots(state, ui.siteId, date).length > 0;
        const weekday = dateLabel(date, true).split(",")[0];
        const day = Number(date.slice(-2));
        const availability = hasTimes ? "Available" : "No times";
        const label = `${weekday} ${day} ${availability}, ${dateLabel(date)}, 2026`;
        return `<button type="button" id="date-${date}" class="date" data-date="${date}" aria-label="${e(label)}" aria-pressed="${ui.date === date && hasTimes}" ${hasTimes ? "" : "disabled"}><span>${e(weekday)}</span> <b>${day}</b> <small>${availability}</small></button>`;
      }).join("")}</div>
      <h3 class="times-heading">${e(dateLabel(ui.date))}</h3>${slots.length ? `<div class="times" role="group" aria-label="Pickup time">${slots.map((slot) => `<button type="button" class="time" id="slot-${slot.id}" data-slot="${slot.id}" aria-pressed="${ui.slot?.id === slot.id}">${e(timeLabel(slot.time))}</button>`).join("")}</div>` : `<div class="empty"><strong>${paid ? "No times available here." : "Waiting for payment verification."}</strong><p class="help">${paid ? "Your demo order stays paid, not cancelled. Try another location or ask for help finding a time." : "Choose the paid example above to try booking."}</p>${paid ? '<button type="button" class="text-button" data-action="help">Ask for scheduling help</button>' : ""}</div>`}</section>
    </fieldset><aside class="card summary" aria-label="Your pickup summary"><p class="eyebrow">A final look</p><h2>Your pickup.</h2><span class="status-chip">${paid ? "Payment verified / demo" : "Payment processing / demo"}</span><dl class="section-bottom"><div><dt>Where</dt><dd>${e(site.name)}<br><small>${e(site.area)}</small></dd></div><div><dt>When</dt><dd>${ui.slot ? `${e(dateLabel(ui.slot.date))}<br>${e(interval(ui.slot))} EST` : "Choose an available time"}</dd></div></dl><button type="button" data-action="confirm" ${!paid || !ui.slot ? "disabled" : ""}>${booking ? "Confirm new demo time" : "Confirm demo pickup"}</button><p class="help">A time is secured only when confirmation succeeds. This study makes no real reservation.</p>${ui.slot ? '<button type="button" class="text-button" data-action="conflict">Test a slot conflict</button>' : ""}</aside></div>`;
}

function queue() {
  const own = currentBooking();
  return `<section class="card queue" aria-labelledby="queue-title"><div class="queue-heading"><div><p class="eyebrow">An easy handoff</p><h2 id="queue-title">Upcoming demo pickups.</h2></div><button type="button" class="secondary" data-view="customer">Try customer view &rarr;</button></div>
    ${state.order.payment !== "paid" ? '<div class="warning"><strong>Payment pending / not ready to schedule.</strong>There is no verified paid order awaiting a time in this example.</div>' : !own ? `<div class="warning"><strong>1 paid sample order needs a pickup time.</strong>${state.needsHelp ? "Scheduling help requested in this demo. No message was sent." : "Customers who leave checkout without a time stay visible here."}</div>` : ""}
    ${state.bookings.length ? state.bookings.map((booking) => `<div class="queue-row"><div><strong>${booking.orderId === state.order.id ? e(booking.orderId) : "Another example order"}</strong><small>${e(state.sites.find((site) => site.id === booking.siteId).name)}</small></div><p>${e(dateLabel(booking.date, true))}<small>${e(interval(booking))} EST</small></p><span class="status-chip">${booking.status === "needs_review" ? "Needs review / original kept" : "Scheduled / not collected"}</span></div>`).join("") : '<p class="help">No scheduled appointments yet. Book one in customer view to see it here.</p>'}
    <p class="help section-bottom">Scheduling never marks an order collected or changes stock. Actual handoff remains a separate authorized inventory action.</p></section>`;
}

function operator() {
  const site = operatorSite();
  const { weekly, policy, exceptions } = site.schedule;
  return `${hero("Operator / Availability workspace", "Your hours.<br>A clearer handoff.", "Set different collection windows for each location. Customers only choose from the hours you've applied in this tab.")}
    <div class="ops-grid"><nav class="site-menu" aria-label="Operator pickup sites">${state.sites.map((entry) => `<button type="button" data-operator-site="${entry.id}" aria-pressed="${entry.id === site.id}">${e(entry.name)}<small>${e(entry.area)} / fictional</small></button>`).join("")}<p class="help">All settings are examples. Shared-operator travel buffers and real opening hours need approval before launch.</p></nav>
    <div><div class="ops-panels"><section class="card"><p class="eyebrow">${e(site.name)}</p><h2>Weekly hours.</h2><p class="help">Eastern Time (EST). One window per day in this study.</p><form id="hours-form">
    ${weekdays.map(([day, name]) => { const window = weekly[day][0]; return `<div class="hours-row${window ? "" : " is-closed"}"><label class="day-label"><input type="checkbox" name="open-${day}" aria-label="${name} open" ${window ? "checked" : ""}>${name}</label><input type="time" name="start-${day}" aria-label="${name} start" value="${window?.start ?? "17:00"}" ${window ? "" : "disabled"} required><input type="time" name="end-${day}" aria-label="${name} end" value="${window?.end ?? "19:00"}" ${window ? "" : "disabled"} required><span class="closed-note">Closed</span></div>`; }).join("")}
    <div class="form-row"><label>Slot length<select name="duration">${[15, 30, 60].map((value) => `<option value="${value}" ${value === policy.duration ? "selected" : ""}>${value} minutes</option>`).join("")}</select></label><label>Orders per slot<input type="number" name="capacity" min="1" max="5" required value="${policy.capacity}"></label></div><div class="form-row"><label>Minimum notice (hours)<input type="number" name="noticeHours" min="0" max="168" required value="${policy.noticeHours}"></label><label>Days ahead<input type="number" name="horizonDays" min="1" max="14" required value="${policy.horizonDays}"></label></div>
    <span class="save-note" id="hours-status">Applied in this tab / resets on reload</span><div class="actions"><button type="submit">Apply demo hours</button><button type="button" class="text-button" data-action="discard-hours">Discard edits</button></div></form></section>
    <section class="card"><p class="eyebrow">Make an exception</p><h2>A day off. Or extra time.</h2><p class="help">A date override replaces that day's weekly window, only at this location.</p><form id="exception-form"><label class="field">Example date<input type="date" name="date" min="${SAMPLE_DATES[0]}" max="${SAMPLE_DATES.at(-1)}" value="2026-12-08" required></label><label class="field">Availability<select name="kind"><option value="closed">Closed all day</option><option value="custom">Custom hours</option></select></label><div class="form-row"><label>Override start<input type="time" name="start" value="17:00" required disabled></label><label>Override end<input type="time" name="end" value="19:00" required disabled></label></div><div class="actions"><button type="submit" class="secondary">Apply date exception</button></div></form>
    <ul class="exceptions">${Object.entries(exceptions).sort(([a], [b]) => a.localeCompare(b)).map(([date, windows]) => `<li><strong>${e(dateLabel(date, true))}</strong>${windows.length ? windows.map((window) => `${e(timeLabel(window.start))} - ${e(timeLabel(window.end))}`).join(", ") : "Closed all day"}<br><button type="button" class="text-button" data-remove-exception="${date}">Remove exception for ${e(dateLabel(date, true))}</button></li>`).join("")}</ul><p class="help section-bottom">Existing bookings are checked before changes apply. No one is silently moved.</p></section></div>${queue()}</div></div>`;
}

function render() {
  main.innerHTML = ui.view === "operator" ? operator() : customer();
  main.setAttribute("aria-busy", "false");
  for (const button of document.querySelectorAll(".view-switch [data-view]")) {
    button.disabled = false;
    button.setAttribute("aria-pressed", String(button.dataset.view === ui.view));
  }
  document.querySelector("#scenario").disabled = false;
  document.querySelector("#reset-demo").disabled = false;
  const url = new URL(location.href);
  url.searchParams.set("view", ui.view);
  history.replaceState(null, "", url);
}

function canLeaveHours() {
  return !ui.hoursDirty || window.confirm("Discard your unapplied demo hours? Applied hours and appointments will be kept.");
}

function applySchedule(siteId, schedule, allowImpact = false) {
  const result = saveSchedule(state, siteId, schedule, { allowImpact });
  if (!result.ok) {
    if (result.affected?.length) {
      pendingSchedule = { siteId, schedule };
      document.querySelector("#impact-message").textContent = result.message;
      document.querySelector("#impact-list").innerHTML = result.affected.map((booking) => `<li>${e(booking.orderId)} / ${e(dateLabel(booking.date, true))} / ${e(interval(booking))} EST</li>`).join("");
      impactDialog.returnValue = "";
      impactDialog.showModal();
      impactDialog.querySelector('[value="cancel"]').focus();
    } else message(result.message, true);
    return;
  }
  state = result.state;
  ui.hoursDirty = false;
  render();
  message(result.affected.length ? "Demo hours applied. Affected pickups keep their original details and are flagged for review. No messages sent." : "Demo availability applied in this tab. Try customer view to see the available times.");
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || button.disabled) return;
  const focusId = button.id;
  if (button.dataset.view) {
    if (!canLeaveHours()) return;
    ui.hoursDirty = false; ui.view = button.dataset.view;
    render(); message(""); focusHeading(); return;
  }
  if (button.id === "reset-demo") {
    if (!canLeaveHours()) return;
    state = createDemo(); ui = initialUI(ui.view);
    document.querySelector("#scenario").value = "paid";
    render(); message("The fictional example was reset. No browser storage was changed."); return;
  }
  if (button.dataset.operatorSite) {
    if (!canLeaveHours()) return;
    ui.operatorSite = button.dataset.operatorSite; ui.hoursDirty = false; render(); return;
  }
  if (button.dataset.removeException) {
    if (ui.hoursDirty) { message("Apply or discard your weekly-hour edits first.", true); return; }
    const schedule = structuredClone(operatorSite().schedule);
    delete schedule.exceptions[button.dataset.removeException];
    applySchedule(ui.operatorSite, schedule); return;
  }
  if (button.dataset.site) {
    ui.siteId = button.dataset.site; ui.slot = null;
  } else if (button.dataset.date) {
    ui.date = button.dataset.date; ui.slot = null;
  } else if (button.dataset.week) {
    ui.week = Number(button.dataset.week); ui.slot = null;
  } else if (button.dataset.slot) {
    ui.slot = availableSlots(state, ui.siteId, ui.date).find((slot) => slot.id === button.dataset.slot);
  } else if (button.dataset.action === "confirm") {
    const result = bookPickup(state, ui.slot);
    if (!result.ok) { ui.slot = null; render(); message(result.message, true); return; }
    state = result.state; ui.rescheduling = false; ui.slot = null; render();
    message("Demo pickup confirmed. No real booking, payment, stock change or message."); focusHeading(); return;
  } else if (button.dataset.action === "reschedule") {
    const booking = currentBooking();
    ui.siteId = booking.siteId; ui.date = booking.date; ui.week = SAMPLE_DATES.indexOf(booking.date) >= 7 ? 1 : 0;
    ui.rescheduling = true; ui.slot = null;
  } else if (button.dataset.action === "keep-booking") {
    ui.rescheduling = false; ui.slot = null;
  } else if (button.dataset.action === "help") {
    state.needsHelp = true;
    message("Your demo help request is in the operator queue. No message was sent."); return;
  } else if (button.dataset.action === "conflict" && ui.slot) {
    const capacity = currentSite().schedule.policy.capacity;
    for (let i = 0; i < capacity; i++) state.bookings.push({ ...ui.slot, orderId: `demo-other-${state.bookings.length}`, status: "scheduled" });
    message("A fictional buyer took the selected time. Confirm to test safe conflict recovery."); return;
  } else if (button.dataset.action === "discard-hours") {
    ui.hoursDirty = false; render(); message("Unapplied hours discarded. Applied availability is unchanged."); return;
  } else return;
  render();
  if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
});

document.addEventListener("input", (event) => {
  if (!event.target.closest("#hours-form")) return;
  ui.hoursDirty = true;
  document.querySelector("#hours-status").textContent = "Unapplied changes / apply before switching views";
});
document.addEventListener("change", (event) => {
  const input = event.target;
  if (input.id === "scenario") {
    if (!canLeaveHours()) { input.value = state.order.payment === "pending" ? "pending" : state.forceFull ? "full" : "paid"; return; }
    state = createDemo(); ui = initialUI();
    state.order.payment = input.value === "pending" ? "pending" : "paid";
    state.forceFull = input.value === "full";
    render(); message(""); return;
  }
  if (input.closest("#hours-form") && input.type === "checkbox") {
    input.closest(".hours-row").classList.toggle("is-closed", !input.checked);
    for (const field of input.closest(".hours-row").querySelectorAll('input[type="time"]')) field.disabled = !input.checked;
  }
  if (input.closest("#exception-form") && input.name === "kind") {
    for (const field of input.form.querySelectorAll('input[type="time"]')) field.disabled = input.value === "closed";
  }
});
document.addEventListener("submit", (event) => {
  if (!["hours-form", "exception-form"].includes(event.target.id)) return;
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const schedule = structuredClone(operatorSite().schedule);
  if (form.id === "hours-form") {
    for (const [day] of weekdays) schedule.weekly[day] = data.has(`open-${day}`) ? [{ start: data.get(`start-${day}`), end: data.get(`end-${day}`) }] : [];
    for (const field of ["duration", "capacity", "noticeHours", "horizonDays"]) schedule.policy[field] = Number(data.get(field));
  } else {
    if (ui.hoursDirty) { message("Apply or discard your weekly-hour edits first.", true); return; }
    schedule.exceptions[data.get("date")] = data.get("kind") === "closed" ? [] : [{ start: data.get("start"), end: data.get("end") }];
  }
  applySchedule(ui.operatorSite, schedule);
});
impactDialog.addEventListener("close", () => {
  const pending = pendingSchedule; pendingSchedule = null;
  if (impactDialog.returnValue === "confirm" && pending) applySchedule(pending.siteId, pending.schedule, true);
});

render();
