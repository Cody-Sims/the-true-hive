import type {
  AdminPickupDashboard,
  CustomerPickupContext,
  CustomerPickupOrder,
  OperatorPickupOrder,
  PickupAvailability,
  PickupSite,
  PickupSiteFields,
  PickupSiteImpact,
  PickupWindow,
  PublicPickupSite,
} from "../domain/pickup.ts";
import {
  PickupWriter,
  pickupRead,
  pickupTime,
  record,
  revision,
  shiftDate,
  siteDate,
} from "./pickup-state.ts";
import type { WriteResult } from "./pickup-state.ts";

type Order = CustomerPickupOrder | OperatorPickupOrder;
const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  className = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(text: string, action: () => void, secondary = false) {
  const node = el("button", text, secondary ? "pickup-secondary" : "");
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}
function link(text: string, href: string) {
  const node = el("a", text);
  node.href = href;
  return node;
}
function field(label: string, control: HTMLElement) {
  const node = el("label", label);
  node.append(control);
  return node;
}
function option(value: string, text: string) {
  const node = el("option", text);
  node.value = value;
  return node;
}
function checkbox(label: string) {
  const input = el("input");
  input.type = "checkbox";
  const wrapper = field(label, input);
  wrapper.className = "pickup-check";
  wrapper.prepend(input);
  return { input, wrapper };
}
function textInput(type: string, value = "") {
  const node = el("input");
  node.type = type;
  node.value = value;
  return node;
}
function isSite(value: unknown): value is PublicPickupSite {
  if (
    !record(value) ||
    typeof value["key"] !== "string" ||
    typeof value["label"] !== "string" ||
    typeof value["area"] !== "string" ||
    typeof value["timezone"] !== "string" ||
    !revision(value["revision"])
  )
    return false;
  try {
    siteDate(value["timezone"]);
    return true;
  } catch {
    return false;
  }
}
function isConfiguredSite(value: unknown): value is PickupSite {
  if (!record(value)) return false;
  const fields = value;
  if (!isSite(value)) return false;
  const week = fields["weekly"];
  const dates = fields["exceptions"];
  const validWindows = (windows: unknown) =>
    Array.isArray(windows) &&
    windows.length <= 4 &&
    windows.every(
      (window: unknown) =>
        record(window) &&
        typeof window["start"] === "string" &&
        typeof window["end"] === "string" &&
        /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(window["start"]) &&
        /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(window["end"]),
    );
  return (
    typeof fields["active"] === "boolean" &&
    typeof fields["privateInstructions"] === "string" &&
    Array.isArray(fields["stockLocationKeys"]) &&
    fields["stockLocationKeys"].length <= 20 &&
    fields["stockLocationKeys"].every(
      (key: unknown) => typeof key === "string",
    ) &&
    typeof fields["slotMinutes"] === "number" &&
    [15, 30, 60].includes(fields["slotMinutes"]) &&
    [
      "capacity",
      "noticeHours",
      "horizonDays",
      "rescheduleCutoffHours",
      "travelBufferMinutes",
    ].every(
      (key) => Number.isSafeInteger(fields[key]) && Number(fields[key]) >= 0,
    ) &&
    record(week) &&
    Object.keys(week).length === 7 &&
    Array.from({ length: 7 }, (_, day) => String(day)).every((day) =>
      validWindows(week[day]),
    ) &&
    record(dates) &&
    Object.keys(dates).length <= 128 &&
    Object.entries(dates).every(
      ([date, windows]) =>
        /^\d{4}-\d{2}-\d{2}$/.test(date) && validWindows(windows),
    )
  );
}
function isOrder(value: unknown): value is Order {
  if (
    !record(value) ||
    typeof value["id"] !== "string" ||
    typeof value["state"] !== "string" ||
    !revision(value["revision"]) ||
    typeof value["helpRequested"] !== "boolean" ||
    !Array.isArray(value["sites"]) ||
    !value["sites"].every(isSite)
  )
    return false;
  const booking = value["booking"];
  return (
    booking === null ||
    (record(booking) &&
      typeof booking["id"] === "string" &&
      booking["orderId"] === value["id"] &&
      typeof booking["siteLabel"] === "string" &&
      typeof booking["timezone"] === "string" &&
      Number.isFinite(Date.parse(String(booking["startsAt"]))) &&
      Number.isFinite(Date.parse(String(booking["endsAt"]))) &&
      ["scheduled", "needs_review", "completed"].includes(
        String(booking["status"]),
      ) &&
      revision(booking["revision"]))
  );
}
function isAvailability(
  value: unknown,
  siteKey: string,
): value is PickupAvailability {
  if (!record(value) || !isSite(value["site"])) return false;
  const site = value["site"];
  return (
    site.key === siteKey &&
    revision(value["settingsRevision"]) &&
    revision(value["orderRevision"]) &&
    (value["bookingRevision"] === null || revision(value["bookingRevision"])) &&
    Array.isArray(value["slots"]) &&
    value["slots"].length <= 512 &&
    value["slots"].every(
      (slot: unknown) =>
        record(slot) &&
        typeof slot["id"] === "string" &&
        slot["siteKey"] === siteKey &&
        slot["siteRevision"] === site.revision &&
        slot["timezone"] === site.timezone &&
        typeof slot["date"] === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(slot["date"]) &&
        Number.isFinite(Date.parse(String(slot["startsAt"]))) &&
        Number.isFinite(Date.parse(String(slot["endsAt"]))) &&
        typeof slot["label"] === "string",
    )
  );
}
function validImpact(value: unknown): value is PickupSiteImpact {
  return (
    record(value) &&
    typeof value["ack"] === "string" &&
    /^[a-f0-9]{64}$/.test(value["ack"]) &&
    Array.isArray(value["bookings"]) &&
    value["bookings"].length > 0 &&
    value["bookings"].every(
      (booking: unknown) =>
        record(booking) &&
        typeof booking["orderId"] === "string" &&
        typeof booking["bookingId"] === "string" &&
        typeof booking["siteLabel"] === "string" &&
        Number.isFinite(Date.parse(String(booking["startsAt"]))) &&
        Array.isArray(booking["reasons"]) &&
        booking["reasons"].every(
          (reason: unknown) => typeof reason === "string",
        ),
    )
  );
}

export function initPickup(root: HTMLElement) {
  if (root.dataset["pickupReady"]) return;
  const admin = root.dataset["pickupMode"] === "admin";
  const locationsView = root.dataset["pickupView"] === "locations";
  const fixedLocation = root.dataset["pickupFixedLocation"] === "true";
  let selectedStock = root.dataset["pickupLocation"] ?? "";
  if (admin && root.dataset["pickupAuthorized"] !== "true") return;
  root.dataset["pickupReady"] = "true";
  const content = root.querySelector<HTMLElement>("[data-pickup-content]")!;
  const status = root.querySelector<HTMLElement>("[data-pickup-status]")!;
  const refresh = root.querySelector<HTMLButtonElement>(
    "[data-pickup-refresh]",
  )!;
  const retry = root.querySelector<HTMLButtonElement>("[data-pickup-retry]")!;
  let csrf = admin
    ? (document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
        ?.content ?? "")
    : "";
  if (admin && !csrf) {
    status.textContent =
      "A verified inventory session is required. Sign in again.";
    refresh.disabled = true;
    return;
  }
  const writer = new PickupWriter();
  const base = admin ? "/api/admin/pickup" : "/api/pickup";
  let dashboard: AdminPickupDashboard | null = null;
  let pending = false;
  let reading = false;
  let reviewPanel: HTMLElement | null = null;
  let siteEditor: HTMLElement | null = null;
  let siteEditorForm: HTMLFormElement | null = null;
  let siteEditGeneration = 0;
  const disabled = new Map<
    | HTMLInputElement
    | HTMLSelectElement
    | HTMLTextAreaElement
    | HTMLButtonElement,
    boolean
  >();

  function feedback(text: string, error = false) {
    status.textContent = text;
    status.dataset["tone"] = error ? "error" : "normal";
  }
  function lock() {
    for (const control of content.querySelectorAll<
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement
      | HTMLButtonElement
    >("input, select, textarea, button")) {
      if (!disabled.has(control)) disabled.set(control, control.disabled);
      control.disabled = true;
    }
  }
  function unlock() {
    for (const [control, wasDisabled] of disabled)
      control.disabled = wasDisabled;
    disabled.clear();
  }
  function resetEditor() {
    siteEditGeneration++;
    siteEditor?.remove();
    siteEditor = null;
    siteEditorForm = null;
  }
  function clearReview() {
    reviewPanel?.remove();
    reviewPanel = null;
  }
  async function load(after = "") {
    if (reading || pending || reviewPanel) return false;
    siteEditGeneration++;
    reading = true;
    refresh.disabled = true;
    try {
      const value = await pickupRead(admin ? base : `${base}/context`);
      if (
        !record(value) ||
        !Array.isArray(value["orders"]) ||
        !value["orders"].every(isOrder)
      )
        throw new Error(
          "Pickup records could not be verified. No change has been assumed.",
        );
      if (admin) {
        if (
          !record(value["settings"]) ||
          typeof value["settings"]["enabled"] !== "boolean" ||
          !revision(value["settings"]["revision"]) ||
          !Array.isArray(value["sites"]) ||
          value["sites"].length > 50 ||
          !value["sites"].every(isConfiguredSite) ||
          !Array.isArray(value["stockLocations"]) ||
          !value["stockLocations"].every(
            (location: unknown) =>
              record(location) &&
              typeof location["key"] === "string" &&
              typeof location["label"] === "string",
          ) ||
          typeof value["truncated"] !== "boolean"
        )
          throw new Error("Pickup dashboard is unreadable. Refresh records.");
        if (
          value["orders"].length > 200 ||
          !value["orders"].every(
            (order: unknown) =>
              record(order) &&
              typeof order["stockLocationKey"] === "string" &&
              typeof order["buyerAccessRevoked"] === "boolean",
          )
        )
          throw new Error("Pickup dashboard is unreadable. Refresh records.");
        dashboard = value as unknown as AdminPickupDashboard;
        resetEditor();
        content.replaceChildren();
        renderDashboard(dashboard);
      } else {
        if (
          typeof value["csrfToken"] !== "string" ||
          !value["csrfToken"] ||
          typeof value["enabled"] !== "boolean" ||
          !revision(value["settingsRevision"]) ||
          !value["orders"].every(
            (order: unknown) =>
              record(order) &&
              typeof order["canSchedule"] === "boolean" &&
              (order["instructions"] === null ||
                typeof order["instructions"] === "string"),
          )
        )
          throw new Error(
            "Test checkout status could not be verified. Refresh status.",
          );
        csrf = value["csrfToken"];
        content.replaceChildren();
        renderCustomer(value as unknown as CustomerPickupContext);
      }
      if (writer.frozen) {
        lock();
        feedback(
          "Current server records reloaded. The earlier request's outcome is still unknown. Retry the exact request to resolve it; do not make a replacement request.",
          true,
        );
      } else
        feedback(
          after ||
            "Current server records loaded. Availability is not a reservation.",
        );
      return true;
    } catch (error) {
      // Old choices must not remain actionable after a failed authoritative read.
      lock();
      feedback(
        `${error instanceof Error ? error.message : "Pickup records are unavailable."} Existing bookings have not been assumed changed.`,
        true,
      );
      return false;
    } finally {
      reading = false;
      refresh.disabled = false;
    }
  }
  async function mutate(
    path: string,
    payload: Record<string, unknown>,
    resourceKey: string,
    exactRetry = false,
  ) {
    if (pending || reading) return;
    const frozen = exactRetry ? writer.frozen : null;
    if (frozen) {
      path = frozen.path;
      payload = JSON.parse(frozen.body) as Record<string, unknown>;
      resourceKey = frozen.resourceKey;
    }
    pending = true;
    refresh.disabled = true;
    retry.disabled = true;
    lock();
    feedback(
      exactRetry
        ? "Retrying the exact frozen request…"
        : "Saving a frozen request. Keep this page open…",
    );
    let result: WriteResult;
    try {
      result = exactRetry
        ? await writer.retry(csrf)
        : await writer.send(path, payload, resourceKey, csrf);
    } catch (error) {
      pending = false;
      refresh.disabled = false;
      retry.disabled = false;
      unlock();
      feedback(
        error instanceof Error
          ? error.message
          : "The request could not be prepared.",
        true,
      );
      return;
    }
    pending = false;
    refresh.disabled = false;
    retry.disabled = false;
    if (result.kind === "uncertain" || result.kind === "blocked") {
      retry.hidden = !writer.frozen;
      feedback(
        "The outcome is unknown. The server may have saved this request. Edits are locked; use Retry exact request to send the same operation and bytes. Refresh records to inspect current truth. Reloading this page loses this in-memory retry, not the server's records.",
        true,
      );
      return;
    }
    retry.hidden = true;
    if (result.kind === "rejected") {
      if (
        result.error.code === "PICKUP_IMPACT_REVIEW_REQUIRED" &&
        validImpact(result.error.impact)
      ) {
        renderImpact(path, payload, resourceKey, result.error.impact);
        feedback(
          "Nothing was written. Review every affected appointment before explicitly acknowledging this exact site change.",
          true,
        );
        return;
      }
      clearReview();
      unlock();
      if (siteEditorForm && path.includes("/sites")) {
        feedback(
          `${result.error.message} Nothing was written. Your site form is retained. Refresh records before retrying stale revisions.`,
          true,
        );
      } else {
        const reloaded = await load();
        feedback(
          `${result.error.message} Nothing was written. ${
            reloaded
              ? "Review refreshed choices"
              : "Current records could not be reloaded; refresh records before choosing again"
          }; no replacement was booked.`,
          true,
        );
      }
      return;
    }
    // A replay can predate later edits: never replace authoritative UI with its receipt.
    clearReview();
    unlock();
    await load("Saved. Current server records reloaded.");
  }
  retry.addEventListener("click", () => {
    void mutate("", {}, "", true);
  });
  refresh.addEventListener("click", () => {
    void load();
  });

  function confirmAction(
    parent: HTMLElement,
    title: string,
    description: string,
    confirmLabel: string,
    action: () => void,
  ) {
    if (writer.frozen || pending || reading || reviewPanel) return;
    parent.querySelector("[data-pickup-confirm]")?.remove();
    const panel = el("section", "", "pickup-notice");
    panel.dataset["pickupConfirm"] = "true";
    panel.append(el("h4", title), el("p", description));
    const actions = el("div", "", "pickup-actions");
    actions.append(
      button(confirmLabel, () => {
        panel.remove();
        action();
      }),
      button("Cancel", () => panel.remove(), true),
    );
    panel.append(actions);
    parent.append(panel);
    actions.querySelector("button")?.focus();
  }

  function renderCustomer(context: CustomerPickupContext) {
    if (!context.enabled)
      content.append(
        el(
          "p",
          "Customer scheduling is disabled or not yet configured. Existing paid orders and appointments remain. You can still request pickup help.",
          "pickup-notice",
        ),
      );
    if (!context.orders.length)
      content.append(
        el(
          "section",
          "No accessible test orders were found in this browser. Use the same browser as checkout, refresh after checkout finishes, or contact the shop directly. Older, expired or revoked access cannot be recovered with a public order number.",
          "pickup-card",
        ),
      );
    for (const order of context.orders) renderOrder(order, context.enabled);
  }
  function renderOrder(order: Order, enabled: boolean) {
    const card = el("article", "", "pickup-card");
    card.append(
      el("p", order.state.replaceAll("_", " "), "pickup-badge"),
      el(
        "h3",
        order.state === "paid"
          ? "Your pickup"
          : order.state === "picked_up"
            ? "Pickup complete"
            : "Test checkout status",
      ),
      el("p", `Order ${order.id}`, "pickup-order-id"),
    );
    if (admin) {
      card.append(
        link(
          "Open order & record physical pickup",
          `/inventory/orders/${encodeURIComponent(order.id)}`,
        ),
      );
      const operator = order as OperatorPickupOrder;
      card.append(
        el(
          "p",
          `Fulfillment stock: ${operator.stockLocationKey}. Scheduling does not change this location.`,
          "pickup-muted",
        ),
      );
      if (operator.buyerAccessRevoked)
        card.append(
          el(
            "p",
            "Buyer browser access revoked. Existing booking and payment are unchanged.",
          ),
        );
    }
    const booking = order.booking;
    if (booking) {
      const receipt = el("section", "", "pickup-receipt");
      receipt.append(
        el(
          "h4",
          booking.status === "needs_review"
            ? "Appointment needs operator review"
            : order.state === "picked_up"
              ? "Completed pickup"
              : "Current appointment",
        ),
        el("p", booking.siteLabel),
        el(
          "p",
          `${pickupTime(booking.startsAt, booking.timezone)} – ${pickupTime(booking.endsAt, booking.timezone)}`,
        ),
        el("p", `Timezone: ${booking.timezone}`, "pickup-muted"),
      );
      if (booking.status === "needs_review")
        receipt.append(
          el(
            "p",
            "Do not treat this as a confirmed arrival time. Contact the shop or request help. Appointments have not been automatically cancelled or customers notified.",
          ),
        );
      else if (order.state === "paid" && booking.status === "scheduled") {
        receipt.append(
          el(
            "p",
            "This appointment does not mean your order has been collected.",
          ),
        );
        const customer = order as CustomerPickupOrder;
        if (!admin && customer.instructions)
          receipt.append(el("p", customer.instructions, "pickup-instructions"));
      }
      card.append(receipt);
    }
    if (order.state === "picked_up")
      card.append(
        el("p", "Physical pickup has been recorded by the shop. Thank you."),
      );
    else if (order.state !== "paid")
      card.append(
        el(
          "p",
          order.state === "creating" || order.state === "open"
            ? "Payment is not confirmed. Refresh status after test checkout finishes. Returning here does not mark your order paid."
            : "This order is not currently eligible for scheduling. Contact the shop if you need help.",
        ),
      );
    if (order.helpRequested)
      card.append(
        el(
          "p",
          "Pickup help requested. The shop's pickup queue has been updated. No time, email or notification is promised.",
        ),
      );
    if (order.state === "paid") {
      const canSchedule =
        admin || (enabled && (order as CustomerPickupOrder).canSchedule);
      if (canSchedule && order.sites.length) card.append(bookingForm(order));
      else
        card.append(
          el(
            "p",
            order.sites.length
              ? "Online scheduling is unavailable or the rescheduling cutoff has passed. Your paid order and current appointment remain. Request help to arrange a time."
              : "No pickup location is currently configured for this order. Your paid order remains. Request help to arrange collection.",
          ),
        );
      if (!admin && !order.helpRequested) {
        card.append(
          button(
            "Request pickup help",
            () =>
              confirmAction(
                card,
                "Ask the pickup desk for help",
                "This records a durable pickup help request for this paid order. It does not book, cancel, refund or send a message.",
                "Confirm help request",
                () => {
                  void mutate(
                    `${base}/help`,
                    {
                      operationId: crypto.randomUUID(),
                      orderId: order.id,
                      expectedOrderRevision: order.revision,
                      expectedBookingRevision: order.booking?.revision ?? null,
                    },
                    order.id,
                  );
                },
              ),
            true,
          ),
        );
      }
    }
    if (admin && !(order as OperatorPickupOrder).buyerAccessRevoked) {
      card.append(
        button(
          "Revoke buyer browser access",
          () =>
            confirmAction(
              card,
              "Permanently revoke browser access?",
              "This order will no longer be accessible using its original buyer browser credential. It cannot be undone here. Payment and appointments are not cancelled.",
              "Confirm access revocation",
              () => {
                void mutate(
                  `${base}/access`,
                  {
                    operationId: crypto.randomUUID(),
                    orderId: order.id,
                    expectedOrderRevision: order.revision,
                  },
                  order.id,
                );
              },
            ),
          true,
        ),
      );
    }
    content.append(card);
  }

  function bookingForm(order: Order) {
    const form = el("form");
    const group = el("fieldset");
    group.append(
      el(
        "legend",
        order.booking
          ? "Arrange a replacement appointment"
          : "Choose a pickup time",
      ),
    );
    if (order.booking)
      group.append(
        el(
          "p",
          "Your current appointment remains until a new booking succeeds. Availability is not a reservation.",
          "pickup-muted",
        ),
      );
    if (admin)
      group.append(
        el(
          "p",
          "Operator assistance can arrange paid orders while customer scheduling is disabled or after a customer cutoff. Only current server slots are offered.",
          "pickup-muted",
        ),
      );
    const site = el("select");
    site.required = true;
    site.append(option("", "Choose a pickup point"));
    for (const item of order.sites)
      site.append(
        option(
          item.key,
          `${item.label}${item.area ? ` · ${item.area}` : ""} (${item.timezone})`,
        ),
      );
    const date = textInput("date");
    date.required = true;
    date.disabled = true;
    const grid = el("div", "", "pickup-grid");
    grid.append(
      field("Pickup location", site),
      field("Pickup date (location timezone)", date),
    );
    const navigation = el("div", "", "pickup-actions");
    const results = el("div");
    const zoneNote = el("p", "", "pickup-muted");
    let available: PickupAvailability | null = null;
    let requestId = 0;
    let finding = false;
    const navButtons: HTMLButtonElement[] = [];
    function invalidate() {
      requestId++;
      available = null;
      results.replaceChildren();
      finding = false;
      find.disabled = !site.value;
      updateNavigation();
    }
    function selectedSite() {
      return order.sites.find((item) => item.key === site.value);
    }
    function updateNavigation() {
      const chosen = selectedSite();
      for (let index = 0; index < navButtons.length; index++) {
        const delta = [-7, -1, 1, 7][index]!;
        const next = date.value ? shiftDate(date.value, delta) : "";
        navButtons[index]!.disabled =
          !chosen || !next || next < date.min || next > date.max;
      }
    }
    for (const [label, delta] of [
      ["Previous week", -7],
      ["Previous day", -1],
      ["Next day", 1],
      ["Next week", 7],
    ] as const) {
      const node = button(
        label,
        () => {
          date.value = shiftDate(date.value, delta);
          invalidate();
        },
        true,
      );
      node.disabled = true;
      navButtons.push(node);
      navigation.append(node);
    }
    site.addEventListener("change", () => {
      const chosen = selectedSite();
      date.disabled = !chosen;
      date.min = chosen ? siteDate(chosen.timezone) : "";
      date.max = chosen ? shiftDate(date.min, 27) : "";
      date.value = date.min;
      zoneNote.textContent = chosen
        ? `Pickup dates and times use ${chosen.timezone}, not your device timezone.`
        : "";
      invalidate();
    });
    date.addEventListener("change", invalidate);
    const find = button(
      "Find available times",
      () => {
        void findTimes();
      },
      true,
    );
    find.disabled = true;
    async function findTimes() {
      if (
        finding ||
        pending ||
        reading ||
        writer.frozen ||
        !site.reportValidity() ||
        !date.reportValidity()
      )
        return;
      const chosen = selectedSite();
      if (!chosen || date.value < date.min || date.value > date.max) return;
      finding = true;
      const id = ++requestId;
      const requestedDate = date.value;
      available = null;
      results.replaceChildren(el("p", "Loading real server availability…"));
      find.disabled = true;
      try {
        const query = new URLSearchParams({
          orderId: order.id,
          siteKey: chosen.key,
          from: requestedDate,
          days: "1",
        });
        const value = await pickupRead(`${base}/availability?${query}`);
        if (id !== requestId || writer.frozen || pending || !form.isConnected)
          return;
        if (
          !isAvailability(value, chosen.key) ||
          value.slots.some((slot) => slot.date !== requestedDate)
        )
          throw new Error(
            "Availability could not be verified. Refresh choices.",
          );
        if (value.site.timezone !== chosen.timezone)
          throw new Error(
            "The pickup point's timezone changed. Refresh records before choosing a date.",
          );
        available = value;
        results.replaceChildren();
        if (!value.slots.length) {
          results.append(
            el(
              "p",
              "No times were returned for this date. Try another date or request pickup help. Your paid order and any existing appointment remain.",
            ),
          );
          return;
        }
        const times = el("select");
        times.required = true;
        times.append(option("", "Choose a returned time"));
        for (const slot of value.slots)
          times.append(
            option(
              slot.id,
              `${pickupTime(slot.startsAt, value.site.timezone)} – ${pickupTime(slot.endsAt, value.site.timezone)}`,
            ),
          );
        const confirm = checkbox("I confirm this pickup time");
        confirm.input.required = true;
        const submit = el(
          "button",
          order.booking ? "Confirm reschedule" : "Confirm pickup",
        );
        submit.type = "submit";
        results.append(
          field("Available time", times),
          confirm.wrapper,
          el(
            "p",
            `All times use ${value.site.timezone}, with UTC offsets shown to distinguish daylight-saving times. Only confirmation reserves a slot.`,
            "pickup-muted",
          ),
          submit,
        );
        form.onsubmit = (event) => {
          event.preventDefault();
          if (!available || available !== value || !form.reportValidity())
            return;
          const slot = available.slots.find((item) => item.id === times.value);
          if (!slot) return;
          void mutate(
            `${base}/booking`,
            {
              operationId: crypto.randomUUID(),
              orderId: order.id,
              siteKey: available.site.key,
              date: slot.date,
              slotId: slot.id,
              expectedOrderRevision: available.orderRevision,
              expectedSiteRevision: available.site.revision,
              expectedSettingsRevision: available.settingsRevision,
              expectedBookingRevision: available.bookingRevision,
            },
            order.id,
          );
        };
      } catch (error) {
        if (id === requestId)
          results.replaceChildren(
            el(
              "p",
              `${error instanceof Error ? error.message : "Availability is unavailable."} No appointment was changed. Refresh records before choosing again.`,
            ),
          );
      } finally {
        if (id === requestId) {
          finding = false;
          find.disabled = pending || Boolean(writer.frozen) || !site.value;
        }
      }
    }
    form.addEventListener("submit", (event) => event.preventDefault());
    group.append(grid, zoneNote, navigation, find, results);
    form.append(group);
    return form;
  }

  function renderDashboard(value: AdminPickupDashboard) {
    if (locationsView) {
      renderLocationDetails(value);
      return;
    }
    const settings = el("section", "", "pickup-card");
    settings.append(
      el(
        "h3",
        value.settings.enabled
          ? "Customer scheduling is enabled"
          : "Customer scheduling is disabled",
      ),
      el(
        "p",
        value.sites.length
          ? `${value.sites.filter((site) => site.active).length} active pickup points. Policies, mappings and hours are explicit per point.`
          : "Not configured. Create a pickup point, map stock locations, and set approved policies and collection windows before enabling customer scheduling.",
      ),
      el(
        "p",
        "Disabling does not erase or cancel appointments. Operators may assist paid orders even when customer scheduling is disabled.",
        "pickup-muted",
      ),
    );
    settings.append(
      button(
        value.settings.enabled
          ? "Disable customer scheduling"
          : "Enable customer scheduling",
        () =>
          confirmAction(
            settings,
            value.settings.enabled
              ? "Disable online scheduling?"
              : "Enable online scheduling?",
            "Existing appointments are retained. The server checks active pickup points and configuration before enabling.",
            value.settings.enabled ? "Confirm disable" : "Confirm enable",
            () => {
              void mutate(
                `${base}/settings`,
                {
                  operationId: crypto.randomUUID(),
                  expectedRevision: value.settings.revision,
                  enabled: !value.settings.enabled,
                },
                "pickup-settings",
              );
            },
          ),
      ),
    );
    content.append(settings);
    content.append(
      link("Edit locations, pickup details & hours", "/inventory/locations"),
    );
    const heading = el("section");
    heading.append(
      el("h3", "Paid orders, help & appointments"),
      el(
        "p",
        "Paid orders without a time, help requests and appointments needing review appear first. Booking never marks an order collected. Use the order record for physical pickup.",
      ),
    );
    if (value.truncated)
      heading.append(
        el(
          "p",
          "Showing at most 200 priority records. This is not the complete order history; use Orders & physical pickup for other records.",
          "pickup-notice",
        ),
      );
    if (!value.orders.length)
      heading.append(el("p", "No pickup orders in this queue."));
    content.append(heading);
    for (const order of value.orders)
      renderOrder(order, value.settings.enabled);
  }
  function renderLocationDetails(value: AdminPickupDashboard) {
    const sites = el("section", "", "pickup-card");
    const filter = el("select");
    filter.setAttribute("aria-label", "Inventory location");
    filter.append(option("", "All inventory locations"));
    for (const stock of value.stockLocations)
      filter.append(option(stock.key, stock.label));
    if (
      selectedStock &&
      !value.stockLocations.some((stock) => stock.key === selectedStock)
    ) {
      if (fixedLocation) {
        content.append(
          el(
            "p",
            "This location could not be verified. Refresh the location record before changing pickup details.",
            "pickup-notice",
          ),
        );
        return;
      }
      selectedStock = "";
    }
    filter.value = selectedStock;
    filter.disabled = fixedLocation;
    filter.addEventListener("change", () => {
      if (pending || reading || writer.frozen || reviewPanel) return;
      if (
        siteEditorForm &&
        !window.confirm(
          "Discard this pickup editor and choose another inventory location?",
        )
      ) {
        filter.value = selectedStock;
        return;
      }
      selectedStock = filter.value;
      resetEditor();
      content.replaceChildren();
      renderLocationDetails(value);
      content
        .querySelector<HTMLSelectElement>("select")
        ?.focus({ preventScroll: true });
    });
    sites.append(
      field("Inventory location", filter),
      el("h3", "Customer pickup points"),
    );
    const related = value.sites.filter(
      (site) =>
        !selectedStock || site.stockLocationKeys.includes(selectedStock),
    );
    if (!related.length)
      sites.append(
        el(
          "p",
          selectedStock
            ? "No pickup details added for this inventory location yet."
            : "No pickup points configured.",
        ),
      );
    for (const site of related) {
      const detail = el("details");
      detail.append(
        el(
          "summary",
          `${site.label} · ${site.active ? "Active" : "Inactive"} · ${site.timezone}`,
        ),
      );
      detail.append(
        el(
          "p",
          `Pickup address or area: ${site.area || "Not set"}. Supplied from inventory: ${site.stockLocationKeys.map((key) => value.stockLocations.find((location) => location.key === key)?.label ?? key).join(", ")}.`,
        ),
        el(
          "p",
          `${site.slotMinutes}-minute slots · capacity ${site.capacity} · notice ${site.noticeHours}h · horizon ${site.horizonDays} days · reschedule cutoff ${site.rescheduleCutoffHours}h · travel buffer ${site.travelBufferMinutes}m.`,
        ),
      );
      const hours = el("ul");
      for (let day = 0; day < 7; day++)
        hours.append(
          el(
            "li",
            `${weekdays[day]}: ${windowLabel(site.weekly[day as keyof typeof site.weekly])}`,
          ),
        );
      detail.append(hours, el("h4", "Dated exceptions"));
      const dates = Object.entries(site.exceptions).sort(([a], [b]) =>
        a.localeCompare(b),
      );
      if (!dates.length)
        detail.append(el("p", "No dated closures or alternate windows."));
      else
        for (const [date, windows] of dates)
          detail.append(el("p", `${date}: ${windowLabel(windows)}`));
      detail.append(
        button(
          `Edit ${site.label}`,
          () => {
            void editSite(site.key);
          },
          true,
        ),
      );
      sites.append(detail);
    }
    const add = button("Add pickup point", () => openSiteEditor());
    add.disabled = value.sites.length >= 50;
    sites.append(add);
    content.append(sites);
  }
  function windowLabel(windows: PickupWindow[]) {
    return windows.length
      ? windows.map((window) => `${window.start}–${window.end}`).join(", ")
      : "Closed";
  }
  async function editSite(key: string) {
    if (pending || reading || writer.frozen || reviewPanel) return;
    const generation = ++siteEditGeneration;
    try {
      const value = await pickupRead(
        `${base}/sites/${encodeURIComponent(key)}`,
      );
      if (generation !== siteEditGeneration) return;
      if (
        !record(value) ||
        !isConfiguredSite(value["site"]) ||
        value["site"].key !== key
      )
        throw new Error("The current pickup point could not be verified.");
      if (!pending && !reading && !writer.frozen && !reviewPanel)
        openSiteEditor(value["site"]);
    } catch (error) {
      if (
        generation !== siteEditGeneration ||
        pending ||
        reading ||
        writer.frozen ||
        reviewPanel
      )
        return;
      feedback(
        error instanceof Error ? error.message : "Pickup point unavailable.",
        true,
      );
    }
  }
  function openSiteEditor(site?: PickupSite) {
    if (pending || reading || writer.frozen || reviewPanel || !dashboard)
      return;
    resetEditor();
    const section = el("section", "", "pickup-card");
    siteEditor = section;
    section.append(
      el("h3", site ? `Edit ${site.label}` : "New pickup point"),
      el(
        "p",
        "Use approved operational details only. New points start inactive with no hours or policy defaults. Private instructions are returned to eligible confirmed paid appointments, not published as public hours.",
      ),
    );
    const form = el("form");
    siteEditorForm = form;
    const group = el("fieldset");
    const grid = el("div", "", "pickup-grid");
    const controls = new Map<
      string,
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >();
    function addText(
      key: keyof PickupSiteFields,
      label: string,
      required = true,
      maxLength = 160,
    ) {
      const input = textInput("text", String(site?.[key] ?? ""));
      input.required = required;
      input.maxLength = maxLength;
      controls.set(key, input);
      grid.append(field(label, input));
      return input;
    }
    const key = addText("key", "Immutable point key");
    key.readOnly = Boolean(site);
    key.pattern = "[a-z0-9][a-z0-9_-]*";
    key.maxLength = 80;
    addText("label", "Public point name");
    addText("area", "Public area (optional)", false);
    addText("timezone", "IANA timezone");
    const instructions = el("textarea");
    instructions.value = site?.privateInstructions ?? "";
    instructions.maxLength = 2000;
    instructions.rows = 3;
    controls.set("privateInstructions", instructions);
    const privateLabel = field(
      "Private arrival instructions (optional)",
      instructions,
    );
    privateLabel.className = "pickup-wide";
    grid.append(privateLabel);
    const active = checkbox("Active pickup point");
    active.input.checked = site?.active ?? false;
    grid.append(active.wrapper);
    const mappings = el("fieldset");
    mappings.className = "pickup-wide";
    mappings.append(
      el(
        "legend",
        "Approved fulfillment-stock locations (choose at least one)",
      ),
    );
    const locationInputs = dashboard.stockLocations.map((location) => {
      const check = checkbox(`${location.label} (${location.key})`);
      check.input.checked = site
        ? site.stockLocationKeys.includes(location.key)
        : location.key === selectedStock;
      mappings.append(check.wrapper);
      return { key: location.key, input: check.input };
    });
    if (!locationInputs.length)
      mappings.append(
        el(
          "p",
          "Create a physical stock location in Inventory → Locations before configuring a pickup point.",
        ),
      );
    grid.append(mappings);
    const slots = el("select");
    slots.required = true;
    slots.append(
      option("", "Choose explicitly"),
      ...[15, 30, 60].map((number) => option(String(number), String(number))),
    );
    slots.value = String(site?.slotMinutes ?? "");
    controls.set("slotMinutes", slots);
    grid.append(field("Slot length (minutes)", slots));
    for (const [name, label, min, max] of [
      ["capacity", "Capacity per slot", 1, 20],
      ["noticeHours", "Minimum notice (hours)", 0, 168],
      ["horizonDays", "Booking horizon (days)", 1, 28],
      ["rescheduleCutoffHours", "Customer reschedule cutoff (hours)", 0, 168],
      ["travelBufferMinutes", "Cross-point travel buffer (minutes)", 0, 240],
    ] as const) {
      const input = textInput("number", site ? String(site[name]) : "");
      input.required = true;
      input.min = String(min);
      input.max = String(max);
      input.step = "1";
      controls.set(name, input);
      grid.append(field(label, input));
    }
    group.append(
      grid,
      el("h4", "Weekly collection windows"),
      el(
        "p",
        "A day without windows is closed. Use local wall-clock times in the point's IANA timezone; at most four non-overlapping windows per day.",
        "pickup-muted",
      ),
    );
    const weekly: { read: () => PickupWindow[] }[] = [];
    for (let day = 0; day < 7; day++) {
      const windows = windowsEditor(
        weekdays[day]!,
        site?.weekly[day as keyof typeof site.weekly] ?? [],
      );
      weekly.push(windows);
      group.append(windows.node);
    }
    group.append(
      el("h4", "Dated closures & alternate windows"),
      el(
        "p",
        "A dated exception replaces that day's entire weekly schedule. Leave its windows empty to close the date. Removing an exception restores the weekly schedule.",
        "pickup-muted",
      ),
    );
    const dates = el("div");
    const exceptions: {
      node: HTMLElement;
      date: HTMLInputElement;
      windows: ReturnType<typeof windowsEditor>;
    }[] = [];
    function addException(date = "", windows: PickupWindow[] = []) {
      if (exceptions.length >= 128) return;
      const node = el("section", "", "pickup-day");
      const input = textInput("date", date);
      input.required = true;
      const editor = windowsEditor(
        date ? `${date} exception` : "New dated exception",
        windows,
      );
      input.addEventListener("change", () => {
        editor.setLabel(
          input.value ? `${input.value} exception` : "New dated exception",
        );
      });
      node.append(
        field("Exception date (point timezone)", input),
        editor.node,
        button(
          "Remove dated exception",
          () => {
            node.remove();
            exceptions.splice(
              exceptions.findIndex((entry) => entry.node === node),
              1,
            );
          },
          true,
        ),
      );
      exceptions.push({ node, date: input, windows: editor });
      dates.append(node);
    }
    for (const [date, windows] of Object.entries(site?.exceptions ?? {}))
      addException(date, windows);
    group.append(
      dates,
      button("Add closed date / alternate windows", () => addException(), true),
    );
    const submit = el("button", "Save pickup point");
    submit.type = "submit";
    const actions = el("div", "", "pickup-actions");
    actions.append(submit, button("Discard editor", resetEditor, true));
    group.append(actions);
    form.append(group);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (pending || reading || writer.frozen || !form.reportValidity()) return;
      try {
        const selected = locationInputs
          .filter((location) => location.input.checked)
          .map((location) => location.key);
        if (!selected.length)
          throw new Error(
            "Select at least one approved fulfillment-stock location.",
          );
        if (selected.length > 20)
          throw new Error("Select at most 20 stock locations.");
        const zone = controls.get("timezone")!.value.trim();
        if (/^[+-]/.test(zone))
          throw new Error("Use an IANA timezone, not a fixed offset.");
        siteDate(zone);
        const overrides: Record<string, PickupWindow[]> = {};
        for (const exception of exceptions) {
          const date = exception.date.value;
          if (Object.hasOwn(overrides, date))
            throw new Error("Use only one exception per date.");
          overrides[date] = exception.windows.read();
        }
        const values = Object.fromEntries(
          [...controls].map(([key, control]) => [key, control.value.trim()]),
        );
        const payload = {
          ...values,
          active: active.input.checked,
          stockLocationKeys: selected,
          slotMinutes: Number(values["slotMinutes"]),
          capacity: Number(values["capacity"]),
          noticeHours: Number(values["noticeHours"]),
          horizonDays: Number(values["horizonDays"]),
          rescheduleCutoffHours: Number(values["rescheduleCutoffHours"]),
          travelBufferMinutes: Number(values["travelBufferMinutes"]),
          weekly: Object.fromEntries(
            weekly.map((windows, day) => [day, windows.read()]),
          ),
          exceptions: overrides,
        };
        void mutate(
          site
            ? `${base}/sites/${encodeURIComponent(site.key)}`
            : `${base}/sites`,
          {
            operationId: crypto.randomUUID(),
            ...(site ? { expectedRevision: site.revision } : {}),
            site: payload,
          },
          site?.key ?? key.value.trim(),
        );
      } catch (error) {
        feedback(
          error instanceof Error ? error.message : "Review the point fields.",
          true,
        );
      }
    });
    section.append(form);
    content.append(section);
    section.scrollIntoView({ block: "start" });
    key.focus({ preventScroll: true });
  }
  function windowsEditor(label: string, initial: PickupWindow[]) {
    const node = el("section", "", "pickup-day");
    const heading = el("h4", label);
    node.append(heading);
    const list = el("div");
    const rows: {
      node: HTMLElement;
      start: HTMLInputElement;
      end: HTMLInputElement;
    }[] = [];
    const closed = el("p", "Closed — no windows.", "pickup-muted");
    function update() {
      closed.hidden = rows.length > 0;
      add.disabled = rows.length >= 4;
      rows.forEach((row, index) => {
        row.start.setAttribute(
          "aria-label",
          `${label} window ${index + 1} start`,
        );
        row.end.setAttribute("aria-label", `${label} window ${index + 1} end`);
        row.node
          .querySelector("button")!
          .setAttribute("aria-label", `${label} remove window ${index + 1}`);
      });
    }
    function addWindow(window?: PickupWindow) {
      if (rows.length >= 4) return;
      const row = el("div", "", "pickup-window");
      const start = textInput("time", window?.start ?? "");
      const end = textInput("time", window?.end ?? "");
      start.required = true;
      end.required = true;
      row.append(
        field("Start", start),
        field("End", end),
        button(
          "Remove window",
          () => {
            row.remove();
            rows.splice(
              rows.findIndex((item) => item.node === row),
              1,
            );
            update();
          },
          true,
        ),
      );
      rows.push({ node: row, start, end });
      list.append(row);
      update();
    }
    const add = button(
      `Add ${label.toLowerCase()} window`,
      () => addWindow(),
      true,
    );
    node.append(closed, list, add);
    for (const window of initial) addWindow(window);
    return {
      node,
      setLabel(next: string) {
        label = next;
        heading.textContent = next;
        add.textContent = `Add ${next.toLowerCase()} window`;
        update();
      },
      read() {
        const windows = rows
          .map((row) => ({ start: row.start.value, end: row.end.value }))
          .sort((a, b) => a.start.localeCompare(b.start));
        if (
          windows.some(
            (window, index) =>
              !window.start ||
              !window.end ||
              window.start >= window.end ||
              (index > 0 && windows[index - 1]!.end > window.start),
          )
        )
          throw new Error(
            `${label}: windows must end after their start and must not overlap.`,
          );
        return windows;
      },
    };
  }
  function renderImpact(
    path: string,
    payload: Record<string, unknown>,
    resourceKey: string,
    impact: PickupSiteImpact,
  ) {
    clearReview();
    // Clone before exposing acknowledgement controls: subsequent form edits cannot change the approved request.
    const frozen = JSON.stringify(payload);
    const panel = el("section", "", "pickup-notice");
    reviewPanel = panel;
    panel.append(
      el("h3", "Review affected appointments"),
      el(
        "p",
        "This exact site change has not been saved. The listed appointments will be retained and flagged for operator review where necessary. No cancellation or customer notification is implied.",
      ),
    );
    const list = el("ul");
    for (const affected of impact.bookings) {
      const item = el("li");
      item.append(
        link(
          affected.orderId,
          `/inventory/orders/${encodeURIComponent(affected.orderId)}`,
        ),
        el(
          "p",
          `${affected.siteLabel} · ${affected.startsAt} · booking ${affected.bookingId}`,
        ),
        el("p", affected.reasons.join("; ")),
      );
      list.append(item);
    }
    const acknowledge = checkbox("I reviewed every affected appointment");
    const accept = button("Acknowledge impact and save", () => {
      if (!acknowledge.input.checked) return;
      const exact = JSON.parse(frozen) as Record<string, unknown>;
      void mutate(
        path,
        { ...exact, operationId: crypto.randomUUID(), impactAck: impact.ack },
        resourceKey,
      );
    });
    accept.disabled = true;
    acknowledge.input.addEventListener("change", () => {
      accept.disabled = !acknowledge.input.checked;
    });
    panel.append(
      list,
      acknowledge.wrapper,
      accept,
      button(
        "Cancel impact review",
        () => {
          clearReview();
          unlock();
          refresh.disabled = false;
          feedback(
            "Impact review cancelled. Nothing was written; the site form is retained.",
          );
        },
        true,
      ),
    );
    content.append(panel);
    panel.scrollIntoView({ block: "start" });
    acknowledge.input.focus({ preventScroll: true });
    refresh.disabled = true;
  }
  void load();
}

if (typeof document !== "undefined") {
  for (const root of document.querySelectorAll<HTMLElement>(
    "[data-pickup-mode]",
  ))
    initPickup(root);
}
