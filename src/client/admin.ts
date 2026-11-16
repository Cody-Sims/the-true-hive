import type {
  AdminInventoryLevel,
  AdminLocation,
  AdminOrder,
  AdminProduct,
} from "../domain/admin.ts";
import type { StoreSettings } from "../domain/storefront.ts";
import { initSkuSuggestions } from "./sku.ts";
import { initLabelPrinting } from "./barcode-print.ts";

initSkuSuggestions();
initLabelPrinting();

type Payload = Record<string, unknown>;
type Envelope = {
  product?: AdminProduct;
  location?: AdminLocation;
  locations?: AdminLocation[];
  order?: AdminOrder;
  settings?: StoreSettings;
  adjustment?: {
    operationId: string;
    beforeOnHand: number;
    onHand: number;
    replayed: boolean;
  };
  level?: AdminInventoryLevel;
  error?: { code?: string; message?: string; fields?: Record<string, string> };
};
type Phase = "idle" | "pending" | "uncertain" | "conflict" | "confirmed";

function input(form: HTMLFormElement, name: string) {
  return form.elements.namedItem(name) as HTMLInputElement | null;
}

function text(data: FormData, name: string) {
  return String(data.get(name) ?? "").trim();
}

function integer(value: string, label: string, min = 1) {
  const number = Number(value);
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(number) ||
    number < min ||
    number > 2147483647
  ) {
    throw new Error(`${label} must be a positive, bounded whole number.`);
  }
  return number;
}

function serialize(form: HTMLFormElement, action: string): Payload {
  const data = new FormData(form);
  const editing = form.dataset.method === "PUT";
  const revision =
    form.dataset.adminForm === "pickup" ||
    form.dataset.adminForm === "adjustment" ||
    editing
      ? {
          expectedRevision: integer(text(data, "expectedRevision"), "Revision"),
        }
      : {};
  switch (form.dataset.adminForm) {
    case "product": {
      if (editing && action === "archive") return { ...revision, action };
      const product = {
        key: text(data, "key"),
        slug: text(data, "slug"),
        title: text(data, "title"),
        summary: text(data, "summary"),
        details: text(data, "details")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
        ...(data.has("ingredients")
          ? {
              ingredients: text(data, "ingredients")
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean),
            }
          : {}),
        category: text(data, "category"),
        imageKey: text(data, "imageKey"),
        kind: text(data, "kind"),
      };
      const variants = [
        ...form.querySelectorAll<HTMLFieldSetElement>("[data-admin-variant]"),
      ].map((row) => {
        const value = (name: string) =>
          (
            row.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value ?? ""
          ).trim();
        const price = value("priceMinor");
        return {
          key: value("variantKey"),
          sku: row.querySelector<HTMLInputElement>('[name="sku"]')?.value ?? "",
          label: value("label"),
          priceMinor: price ? integer(price, "Variant price") : null,
          currency: "USD",
          active: row.querySelector<HTMLInputElement>('[name="variantActive"]')!
            .checked,
        };
      });
      if (
        action === "publish" &&
        (product.kind !== "active" ||
          !variants.some(
            (variant) => variant.active && variant.priceMinor !== null,
          ))
      ) {
        throw new Error(
          "Publication requires an active real product and an active positive-price USD variant.",
        );
      }
      if (variants.length > 50)
        throw new Error("Review no more than 50 variants at a time.");
      return { ...revision, ...(editing ? { action } : {}), product, variants };
    }
    case "location":
      return {
        ...revision,
        location: {
          key: text(data, "key"),
          name: text(data, "name"),
          publicLabel: text(data, "publicLabel") || null,
          active: data.has("active"),
          pickupEnabled: data.has("pickupEnabled"),
        },
      };
    case "store":
      return {
        ...revision,
        purchasesEnabled: data.has("purchasesEnabled"),
      };
    case "adjustment": {
      const amount = integer(text(data, "amount"), "Amount");
      const direction = text(data, "direction");
      if (direction !== "increase" && direction !== "reduce")
        throw new Error("Choose increase or reduce.");
      return {
        ...revision,
        variantKey: text(data, "variantKey"),
        locationKey: text(data, "locationKey"),
        delta: direction === "reduce" ? -amount : amount,
        reason: text(data, "reason"),
      };
    }
    case "pickup":
      if (!data.has("confirmedPickup"))
        throw new Error("Confirm physical pickup before recording it.");
      return revision;
    default:
      throw new Error(
        "This form is not configured for an inventory operation.",
      );
  }
}

async function request(path: string, method = "GET", body?: string) {
  const url = new URL(path, window.location.origin);
  if (
    url.origin !== window.location.origin ||
    !url.pathname.startsWith("/api/admin/")
  ) {
    throw new Error("Only same-origin inventory requests are allowed.");
  }
  const csrf = document.querySelector<HTMLMetaElement>(
    'meta[name="csrf-token"]',
  )?.content;
  if (method !== "GET" && !csrf)
    throw new Error("A signed session token is required. Sign in again.");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url.href, {
      method,
      credentials: "same-origin",
      mode: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(body
          ? { "Content-Type": "application/json", "X-CSRF-Token": csrf! }
          : {}),
      },
      ...(body ? { body } : {}),
    });
    const result = (await response.json()) as Envelope;
    return { response, body: result };
  } finally {
    window.clearTimeout(timeout);
  }
}

function showLevel(level: AdminInventoryLevel) {
  for (const node of document.querySelectorAll<HTMLElement>("[data-level]")) {
    if (
      node.dataset.variant !== level.variantKey ||
      node.dataset.location !== level.locationKey
    )
      continue;
    for (const key of [
      "onHand",
      "held",
      "committed",
      "unavailable",
      "sellable",
      "revision",
    ] as const) {
      const quantity = node.querySelector<HTMLElement>(
        `[data-quantity="${key}"]`,
      );
      if (quantity) quantity.textContent = String(level[key]);
    }
  }
  document.dispatchEvent(
    new CustomEvent("admin:stock-level", { detail: level }),
  );
}

function setupProductPreview(form: HTMLFormElement) {
  const preview = form.querySelector<HTMLElement>("[data-product-preview]");
  if (!preview) return;
  const image = preview.querySelector<HTMLImageElement>(
    ".product-illustration",
  )!;
  const labels = {
    soap: ["Soap", "The daily ritual"],
    honey: ["Honey", "For the table"],
    candles: ["Candles", "A slower moment"],
    gifts: ["Gifts", "For someone good"],
  };
  const value = (name: string) => input(form, name)?.value.trim() ?? "";
  const setText = (selector: string, text: string) => {
    preview.querySelector<HTMLElement>(selector)!.textContent = text;
  };
  const update = () => {
    setText("[data-preview-title-text]", value("title") || "Your product name");
    setText(
      ".shelf-description",
      value("summary") || "Your short summary will appear here.",
    );
    setText("[data-preview-url]", `/goods/${value("slug") || "your-product"}`);
    const category = value("category");
    const label = Object.hasOwn(labels, category)
      ? labels[category as keyof typeof labels]!
      : ["Choose a category", "The True Hive collection"];
    setText(".eyebrow", label[0]!);
    setText(".shelf-ticket", label[1]!);
    const concept = value("kind") === "concept";
    setText(".pill", concept ? "Concept product" : "Product information");
    const art = value("imageKey");
    const template = [
      ...preview.querySelectorAll<HTMLTemplateElement>("[data-preview-art]"),
    ].find((entry) => entry.dataset.previewArt === art);
    const illustration = template?.content.querySelector("img");
    const photo = !concept ? preview.dataset.previewPhotoSrc : undefined;
    const src = photo || illustration?.getAttribute("src");
    preview.toggleAttribute("data-preview-image-empty", !src);
    if (src && image.getAttribute("src") !== src) image.src = src;
    image.alt = photo ? (preview.dataset.previewPhotoAlt ?? "") : "";
    image.width = photo ? Number(preview.dataset.previewPhotoWidth) : 420;
    image.height = photo ? Number(preview.dataset.previewPhotoHeight) : 360;
    setText(
      ".art-caption",
      photo
        ? "Product photo"
        : src
          ? "Original illustration"
          : "Choose an illustration",
    );
    const artPanel = preview.querySelector<HTMLElement>(".shelf-art")!;
    artPanel.classList.remove("soap-art", "honey-art", "candle-art");
    if (template) artPanel.classList.add(`${art}-art`);
  };
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  update();
}

function setup(form: HTMLFormElement) {
  let phase: Phase = "idle";
  let intent: { payload: Payload; body: string } | null = null;
  let reviewedRevision: number | null = null;
  let currentOrder: AdminOrder | null = null;
  const fields = form.querySelector<HTMLFieldSetElement>(
    "[data-intent-fields]",
  )!;
  const status = form.querySelector<HTMLElement>("[data-admin-status]")!;
  const errors = form.querySelector<HTMLUListElement>("[data-admin-errors]")!;
  const retry = form.querySelector<HTMLButtonElement>("[data-admin-retry]")!;
  const refresh = form.querySelector<HTMLButtonElement>(
    "[data-admin-refresh]",
  )!;
  const review = form.querySelector<HTMLButtonElement>("[data-admin-review]")!;
  const receipt = form.querySelector<HTMLElement>("[data-admin-receipt]")!;
  const receiptText = form.querySelector<HTMLElement>(
    "[data-admin-receipt-text]",
  )!;
  const current = form.querySelector<HTMLElement>("[data-admin-current]")!;
  const currentText = form.querySelector<HTMLElement>(
    "[data-admin-current-text]",
  )!;
  const submitters = [
    ...form.querySelectorAll<HTMLButtonElement>('button[type="submit"]'),
  ];

  if (form.dataset.adminForm === "product" && form.dataset.method === "POST") {
    const name = input(form, "title")!;
    const identifiers = ["key", "slug"].map((key) => ({
      field: input(form, key)!,
      suggested: !input(form, key)!.value,
    }));
    for (const identifier of identifiers) {
      identifier.field.addEventListener("input", () => {
        identifier.suggested = false;
      });
    }
    name.addEventListener("input", () => {
      if (phase !== "idle") return;
      const suggestion = name.value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80)
        .replace(/-+$/g, "");
      for (const identifier of identifiers) {
        if (identifier.suggested) identifier.field.value = suggestion;
      }
    });
  }
  setupProductPreview(form);

  function state(next: Phase, message: string) {
    phase = next;
    form.dataset.phase = next;
    form.setAttribute("aria-busy", String(next === "pending"));
    fields.disabled = next !== "idle";
    for (const button of submitters) button.disabled = next !== "idle";
    retry.hidden = next !== "uncertain";
    refresh.hidden = next !== "conflict" && next !== "confirmed";
    refresh.disabled = !form.dataset.refresh;
    review.hidden = next !== "conflict" || reviewedRevision === null;
    status.textContent = message;
    form.dispatchEvent(new CustomEvent("admin:phase", { bubbles: true }));
    if (next !== "pending") status.focus();
  }

  function clearCompactCount() {
    if (!form.hasAttribute("data-stock-compact")) return;
    for (const name of ["amount", "reason"]) {
      const field = input(form, name);
      if (field) field.value = "";
    }
  }

  function fieldErrors(fields?: Record<string, string>) {
    errors.replaceChildren();
    for (const node of form.querySelectorAll("[aria-invalid]"))
      node.removeAttribute("aria-invalid");
    for (const [key, message] of Object.entries(fields ?? {}).slice(0, 30)) {
      const item = document.createElement("li");
      item.textContent = `${key.slice(0, 100)}: ${String(message).slice(0, 500)}`;
      errors.append(item);
      input(form, key)?.setAttribute("aria-invalid", "true");
    }
    errors.hidden = !errors.childElementCount;
  }

  function applyRecord(body: Envelope) {
    const product = body.product;
    if (product) {
      for (const variant of product.variants)
        for (const level of variant.levels) showLevel(level);
    }
    if (body.level) showLevel(body.level);
    let revision: number | undefined;
    switch (form.dataset.adminForm) {
      case "product":
        revision = product?.revision;
        break;
      case "location":
        revision = (
          body.location ??
          body.locations?.find(
            (location) => location.key === input(form, "key")?.value,
          )
        )?.revision;
        break;
      case "adjustment":
        revision =
          body.level?.revision ??
          product?.variants
            .find((variant) => variant.key === input(form, "variantKey")?.value)
            ?.levels.find(
              (level) =>
                level.locationKey === input(form, "locationKey")?.value,
            )?.revision;
        break;
      case "pickup":
        currentOrder = body.order ?? null;
        revision = body.order?.revision;
        if (body.order) {
          const orderState = document.querySelector("[data-order-state]");
          const orderRevision = document.querySelector("[data-order-revision]");
          if (orderState) orderState.textContent = body.order.state;
          if (orderRevision)
            orderRevision.textContent = String(body.order.revision);
        }
        break;
      case "store":
        if (typeof body.settings?.purchasesEnabled !== "boolean")
          throw new Error("The current store setting could not be verified.");
        revision = body.settings.revision;
        break;
    }
    if (!Number.isInteger(revision) || revision! < 1)
      throw new Error("A current revision could not be verified.");
    if (form.dataset.adminForm === "store" && body.settings) {
      for (const node of form.querySelectorAll("[data-store-status]"))
        node.textContent = body.settings.purchasesEnabled
          ? "New checkouts allowed"
          : "New checkouts paused";
      for (const node of form.querySelectorAll("[data-store-revision]"))
        node.textContent = String(revision);
    }
    const location =
      body.location ??
      body.locations?.find(
        (location) => location.key === input(form, "key")?.value,
      );
    const record =
      form.dataset.adminForm === "store"
        ? body.settings
        : product
          ? {
              key: product.key,
              revision: product.revision,
              title: product.title,
              slug: product.slug,
              summary: product.summary,
              details: product.details,
              ingredients: product.ingredients ?? [],
              category: product.category,
              imageKey: product.imageKey,
              kind: product.kind,
              status: product.status,
              variants: product.variants.map((variant) => ({
                key: variant.key,
                sku: variant.sku,
                label: variant.label,
                active: variant.active,
                priceMinor: variant.priceMinor,
                currency: variant.currency,
                levels: variant.levels,
              })),
            }
          : (location ??
            (body.order
              ? {
                  id: body.order.id,
                  state: body.order.state,
                  revision: body.order.revision,
                  locationKey: body.order.locationKey,
                  lines: body.order.lines,
                  totalMinor: body.order.totalMinor,
                }
              : body.level));
    currentText.textContent = JSON.stringify(record, null, 2);
    current.hidden = false;
    return revision!;
  }

  async function authoritative() {
    if (!form.dataset.refresh)
      throw new Error(
        "Open the newly created record to review its current state.",
      );
    const { response, body } = await request(form.dataset.refresh);
    if (!response.ok) throw new Error("Current server record is unavailable.");
    return applyRecord(body);
  }

  async function resolveConflict() {
    reviewedRevision = null;
    refresh.disabled = true;
    review.hidden = true;
    try {
      reviewedRevision = await authoritative();
      state(
        "conflict",
        `Conflict: current server revision ${reviewedRevision} is shown. Your form values are preserved. Review the refreshed record before allowing a new operation.`,
      );
    } catch {
      state(
        "conflict",
        "Conflict: current records could not be verified. Your values are preserved; refresh and review before submitting a new intent.",
      );
    }
  }

  function showReceipt(body: Envelope) {
    receipt.hidden = false;
    const operationId = String(intent!.payload.operationId);
    if (form.dataset.adminForm === "store" && body.settings) {
      receiptText.textContent = `Operation ${operationId} confirmed: ${body.settings.purchasesEnabled ? "New checkouts allowed" : "New checkouts paused"}, revision ${body.settings.revision}. Payment and tax configuration remain separate.`;
    } else if (body.adjustment) {
      const result = body.adjustment;
      receiptText.textContent = `Operation ${result.operationId}: recorded on hand ${result.beforeOnHand} → ${result.onHand}${result.replayed ? " (same operation replayed)" : ""}. Current quantities are shown separately and may differ from this original receipt.`;
    } else if (body.product) {
      receiptText.textContent = `Operation ${operationId} confirmed: product ${body.product.key}, ${body.product.status}, revision ${body.product.revision}.`;
    } else if (body.location) {
      receiptText.textContent = `Operation ${operationId} confirmed: location ${body.location.key}, revision ${body.location.revision}.`;
    } else if (body.order) {
      receiptText.textContent = `Operation ${operationId} confirmed: order ${body.order.id}, ${body.order.state}, revision ${body.order.revision}.`;
    }
    const resource = body.settings
      ? "store"
      : body.product
        ? `products/${encodeURIComponent(body.product.key)}`
        : body.location
          ? `locations/${encodeURIComponent(body.location.key)}`
          : null;
    if (resource) {
      const link = document.createElement("a");
      link.href = `/inventory/${resource}`;
      link.textContent = "Open the authoritative record";
      receipt.querySelector("a")?.remove();
      receipt.append(link);
    }
  }

  async function send() {
    if (!intent || phase === "pending") return;
    state(
      "pending",
      form.dataset.adminForm === "store"
        ? "Waiting for a verified store-setting receipt. No change has been assumed."
        : "Waiting for a verified server response. No quantity change has been assumed.",
    );
    let response: Response;
    let body: Envelope;
    try {
      ({ response, body } = await request(
        form.dataset.endpoint!,
        form.dataset.method ?? "POST",
        intent.body,
      ));
    } catch {
      state(
        "uncertain",
        "Outcome unverified. The server may have recorded this operation. Retry the same operation without changing its values; do not submit a new intent.",
      );
      return;
    }
    if (response.status === 409) {
      fieldErrors(body.error?.fields);
      if (
        form.dataset.adminForm === "product" &&
        body.error?.code === "DUPLICATE_RECORD"
      ) {
        intent = null;
        state(
          "idle",
          "A product key, URL name or SKU is already in use. Change the duplicate identifier and try again. Your other draft details are preserved.",
        );
        return;
      }
      state(
        "conflict",
        "Conflict: refreshing the authoritative record before another intent.",
      );
      await resolveConflict();
      return;
    }
    if (!response.ok) {
      fieldErrors(body.error?.fields);
      if (response.status >= 500) {
        state(
          "uncertain",
          "Outcome unverified during a server outage. Retry this unchanged operation; no new correction is allowed yet.",
        );
      } else {
        intent = null;
        state(
          "idle",
          (
            body.error?.message ??
            "The server rejected this request. Your values are preserved."
          ).slice(0, 500),
        );
      }
      return;
    }
    let revision: number;
    try {
      if (
        form.dataset.adminForm === "adjustment" &&
        (!body.adjustment || !body.level)
      )
        throw new Error("Incomplete adjustment receipt.");
      if (
        form.dataset.adminForm === "pickup" &&
        body.order?.state !== "picked_up"
      )
        throw new Error("Pickup is not confirmed.");
      revision = applyRecord(body);
      showReceipt(body);
    } catch {
      state(
        "uncertain",
        form.dataset.adminForm === "store"
          ? "The response did not verify the store setting. Retry the same unchanged intent; no setting change is assumed."
          : "The response did not verify the operation. Retry the same unchanged intent; no quantity success is assumed.",
      );
      return;
    }
    fieldErrors();
    state(
      "confirmed",
      "Server receipt confirmed. Refreshing the current record separately.",
    );
    try {
      if (form.dataset.refresh) revision = await authoritative();
      const expected = input(form, "expectedRevision");
      if (expected) expected.value = String(revision);
      intent = null;
      clearCompactCount();
      const terminal =
        form.dataset.method === "POST" &&
        form.dataset.adminForm !== "adjustment";
      state(
        terminal ? "confirmed" : "idle",
        form.dataset.adminForm === "store"
          ? "Server receipt confirmed; current store setting/revision verified. A further change is a new operation."
          : "Server receipt confirmed; current quantities/revision verified. A further change is a new operation.",
      );
    } catch {
      state(
        "confirmed",
        "The operation is confirmed, but refreshed current records are unavailable. Refresh before another intent; do not repeat a confirmed stock change.",
      );
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (phase !== "idle") return;
    const action =
      (event.submitter as HTMLButtonElement | null)?.value || "save";
    if (action !== "archive" && !form.reportValidity()) return;
    try {
      const payload = {
        ...serialize(form, action),
        operationId: crypto.randomUUID(),
      };
      intent = { payload, body: JSON.stringify(payload) };
      fieldErrors();
      void send();
    } catch (error) {
      state(
        "idle",
        error instanceof Error ? error.message : "Review this form.",
      );
    }
  });
  retry.addEventListener("click", () => {
    if (phase === "uncertain") void send();
  });
  refresh.addEventListener("click", async () => {
    if (phase === "conflict") {
      await resolveConflict();
      return;
    }
    if (phase !== "confirmed") return;
    refresh.disabled = true;
    try {
      const revision = await authoritative();
      const expected = input(form, "expectedRevision");
      if (expected) expected.value = String(revision);
      intent = null;
      clearCompactCount();
      const terminal =
        form.dataset.method === "POST" &&
        form.dataset.adminForm !== "adjustment";
      state(
        terminal ? "confirmed" : "idle",
        "Current server records verified. The earlier operation remains confirmed.",
      );
    } catch {
      state(
        "confirmed",
        "Current records remain unavailable. The earlier operation is confirmed; do not resubmit it.",
      );
    }
  });
  review.addEventListener("click", () => {
    if (phase !== "conflict" || reviewedRevision === null) return;
    if (form.dataset.adminForm === "pickup" && currentOrder?.state !== "paid") {
      state(
        "confirmed",
        "The current order is not paid and eligible for pickup. No new pickup action is permitted.",
      );
      return;
    }
    const expected = input(form, "expectedRevision");
    if (expected) expected.value = String(reviewedRevision);
    intent = null;
    reviewedRevision = null;
    state(
      "idle",
      "Current record reviewed. Check your preserved values before confirming a new operation.",
    );
  });
  form
    .querySelector("[data-admin-add-variant]")
    ?.addEventListener("click", () => {
      if (phase !== "idle") return;
      const template = form.querySelector<HTMLTemplateElement>(
        "[data-admin-variant-template]",
      );
      const list = form.querySelector("[data-admin-variants]");
      if (template && list && list.childElementCount < 50) {
        list.append(template.content.cloneNode(true));
        list.lastElementChild
          ?.querySelector<HTMLInputElement>("input")
          ?.focus();
      }
    });
}

for (const form of document.querySelectorAll<HTMLFormElement>(
  "[data-admin-form]",
))
  setup(form);

type StockRecord = {
  productKey: string;
  title: string;
  status: string;
  variant: {
    key: string;
    sku: string;
    label: string;
    active: boolean;
    priceMinor: number | null;
  };
  level: AdminInventoryLevel | null;
  locationKey: string;
  locationName: string;
};

function setupInventoryWorkspace(workspace: HTMLElement) {
  const inspectorNode = workspace.querySelector<HTMLElement>(
    "[data-stock-inspector]",
  );
  const dialogNode = workspace.querySelector<HTMLDialogElement>(
    "[data-stock-dialog]",
  );
  if (!inspectorNode || !dialogNode) return;
  const inspector = inspectorNode;
  const dialog = dialogNode;
  const home = inspector.parentElement!;
  const formHost = inspector.querySelector<HTMLElement>(
    "[data-stock-form-host]",
  )!;
  const originalForm = formHost
    .querySelector<HTMLFormElement>("form")
    ?.cloneNode(true) as HTMLFormElement | undefined;
  const status = workspace.querySelector<HTMLElement>(
    "[data-stock-workspace-status]",
  )!;
  const mobile = window.matchMedia("(max-width: 760px)");
  const rows = [...workspace.querySelectorAll<HTMLElement>("[data-stock-row]")];
  const selectedRow = () =>
    rows.find((row) => row.classList.contains("is-selected"))!;
  const recordFor = (row: HTMLElement) =>
    JSON.parse(row.dataset.stockRecord!) as StockRecord;
  const currentForm = () => formHost.querySelector<HTMLFormElement>("form");
  const locked = () =>
    !["idle", undefined].includes(currentForm()?.dataset.phase);
  const dirty = () => {
    const form = currentForm();
    return (
      !!form &&
      !formHost.hidden &&
      !!(input(form, "amount")?.value || input(form, "reason")?.value)
    );
  };
  let leaving = false;
  const announce = (message: string) => {
    status.textContent = message;
    status.focus();
    if (dialog.open) {
      const feedback = currentForm()?.querySelector<HTMLElement>(
        "[data-admin-status]",
      );
      if (feedback) {
        feedback.textContent = message;
        feedback.focus();
      }
    }
  };
  const canLeave = () => {
    if (locked()) {
      announce(
        "Resolve the current stock operation before changing products or filters. Retry or review the existing operation.",
      );
      return false;
    }
    return (
      !dirty() ||
      window.confirm(
        "Discard the unsubmitted quantity and reason? No new stock update has been sent.",
      )
    );
  };
  const stockLabel = (level: AdminInventoryLevel | null) =>
    !level ? "Not tracked" : level.sellable === 0 ? "Out of stock" : "In stock";
  const stockKey = (level: AdminInventoryLevel | null) =>
    !level ? "untracked" : level.sellable === 0 ? "out" : "in";
  function updatePreview() {
    const form = currentForm();
    const preview = form?.querySelector<HTMLElement>("[data-stock-preview]");
    const record = recordFor(selectedRow());
    if (!form || !preview || !record.level) return;
    const raw = input(form, "amount")?.value ?? "";
    const reason = input(form, "reason")!;
    reason.setCustomValidity(
      (reason.value.trim().match(/\p{L}/gu) ?? []).length >= 3
        ? ""
        : "Explain why stock changed, for example received delivery or damaged units.",
    );
    const amount = Number(raw);
    const valid =
      /^\d+$/.test(raw) &&
      Number.isSafeInteger(amount) &&
      amount >= 1 &&
      amount <= 2147483647;
    const delta =
      input(form, "direction")?.value === "reduce" ? -amount : amount;
    const next = record.level.onHand + delta;
    const available = record.level.sellable + delta;
    const safe = valid && next <= 2147483647 && available >= 0;
    preview.textContent = !raw
      ? "Enter units to preview the new balance. No stock has changed."
      : !safe
        ? "Enter positive whole units. Reductions cannot use held, committed, or unavailable units."
        : `Preview only: on hand ${record.level.onHand} → ${next}; available ${record.level.sellable} → ${available}. No stock has changed.`;
    const submit = form.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!;
    submit.disabled = locked() || !safe;
  }
  function openInspector() {
    if (!mobile.matches) return;
    dialog.append(inspector);
    if (!dialog.open) dialog.showModal();
    const target = formHost.hidden
      ? inspector.querySelector<HTMLElement>("[data-stock-edit]")
      : currentForm()?.querySelector<HTMLElement>('[name="amount"]');
    target?.focus();
  }
  function select(row: HTMLElement) {
    if (row === selectedRow()) {
      openInspector();
      if (!mobile.matches)
        inspector
          .querySelector<HTMLElement>("[data-stock-title]")!
          .focus({ preventScroll: true });
      return;
    }
    if (!canLeave()) return;
    const record = recordFor(row);
    for (const candidate of rows) {
      const active = candidate === row;
      candidate.classList.toggle("is-selected", active);
      const link = candidate.querySelector("[data-stock-select]")!;
      if (active) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    }
    status.textContent = "";
    const set = (selector: string, value: string) => {
      inspector.querySelector<HTMLElement>(selector)!.textContent = value;
    };
    set("[data-stock-title]", record.title);
    set(
      "[data-stock-variant]",
      `${record.variant.label} / ${record.variant.sku}`,
    );
    set("[data-stock-location-name]", record.locationName);
    set(
      "[data-stock-record-meta]",
      `${record.status}${record.variant.active ? "" : " / inactive variant"} / ${record.variant.priceMinor === null ? "No price" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(record.variant.priceMinor / 100)}`,
    );
    const badge = inspector.querySelector<HTMLElement>(
      "[data-inspector-stock-state]",
    )!;
    badge.textContent = stockLabel(record.level);
    badge.dataset.stockState = stockKey(record.level);
    inspector.querySelector<HTMLAnchorElement>("[data-stock-edit]")!.href =
      `/inventory/products/${encodeURIComponent(record.productKey)}`;
    inspector.querySelector<HTMLAnchorElement>("[data-stock-history]")!.href =
      `/inventory/history?${new URLSearchParams({ variantKey: record.variant.key, locationKey: record.locationKey })}`;
    inspector.querySelector<HTMLAnchorElement>("[data-stock-labels]")!.href =
      `/inventory/products/${encodeURIComponent(record.productKey)}/labels`;
    inspector.querySelector<HTMLElement>("[data-stock-untracked]")!.hidden =
      !!record.level;
    inspector.querySelector<HTMLElement>("[data-stock-balances]")!.hidden =
      !record.level;
    formHost.hidden = !record.level;
    if (record.level && originalForm) {
      const form = originalForm.cloneNode(true) as HTMLFormElement;
      form.dataset.refresh = `/api/admin/products/${encodeURIComponent(record.productKey)}`;
      for (const [name, value] of Object.entries({
        variantKey: record.variant.key,
        locationKey: record.locationKey,
        expectedRevision: record.level.revision,
      }))
        input(form, name)!.value = String(value);
      formHost.replaceChildren(form);
      setup(form);
      const quantities = inspector.querySelector<HTMLElement>("[data-level]")!;
      quantities.dataset.variant = record.variant.key;
      quantities.dataset.location = record.locationKey;
      for (const key of [
        "onHand",
        "held",
        "committed",
        "unavailable",
        "sellable",
        "revision",
      ] as const) {
        quantities.querySelector<HTMLElement>(
          `[data-quantity="${key}"]`,
        )!.textContent = String(record.level[key]);
      }
    }
    updatePreview();
    openInspector();
    if (!mobile.matches) {
      inspector
        .querySelector<HTMLElement>("[data-stock-title]")!
        .focus({ preventScroll: true });
    }
  }
  workspace.classList.add("is-enhanced");
  workspace.addEventListener("click", (event) => {
    const target = event.target as Element;
    const link = target.closest<HTMLAnchorElement>("[data-stock-select]");
    if (
      link &&
      !(event as MouseEvent).metaKey &&
      !(event as MouseEvent).ctrlKey &&
      !(event as MouseEvent).shiftKey
    ) {
      event.preventDefault();
      select(link.closest<HTMLElement>("[data-stock-row]")!);
    }
    const preset = target.closest<HTMLElement>("[data-stock-preset]");
    if (preset && !locked()) {
      input(currentForm()!, "direction")!.value = "increase";
      input(currentForm()!, "amount")!.value = preset.dataset.stockPreset!;
      updatePreview();
    }
    if (target.closest("[data-stock-close]") && !locked()) dialog.close();
    else if (target.closest("[data-stock-close]"))
      announce(
        "Resolve the current stock operation before closing its details.",
      );
  });
  workspace.addEventListener("input", updatePreview);
  workspace.addEventListener("change", updatePreview);
  workspace.addEventListener("admin:phase", updatePreview);
  workspace
    .querySelector("[data-stock-filters]")
    ?.addEventListener("submit", (event) => {
      if (!canLeave()) event.preventDefault();
      else leaving = true;
    });
  document.addEventListener("click", (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>(
      "a[href]",
    );
    if (
      event.defaultPrevented ||
      !link ||
      link.target === "_blank" ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      link.getAttribute("href")?.startsWith("#")
    )
      return;
    if (!canLeave()) event.preventDefault();
    else leaving = true;
  });
  window.addEventListener("beforeunload", (event) => {
    if (!leaving && (locked() || dirty())) event.preventDefault();
  });
  dialog.addEventListener("cancel", (event) => {
    if (locked()) {
      event.preventDefault();
      announce(
        "Resolve the current stock operation before closing its details.",
      );
    }
  });
  dialog.addEventListener("close", () => {
    home.append(inspector);
    selectedRow()
      .querySelector<HTMLElement>("[data-stock-select]")
      ?.focus({ preventScroll: true });
  });
  mobile.addEventListener("change", () => {
    if (!mobile.matches && dialog.open) dialog.close();
  });
  document.addEventListener("admin:stock-level", (event) => {
    const level = (event as CustomEvent<AdminInventoryLevel>).detail;
    for (const row of rows) {
      const record = recordFor(row);
      if (
        record.variant.key !== level.variantKey ||
        record.locationKey !== level.locationKey
      )
        continue;
      record.level = level;
      row.dataset.stockRecord = JSON.stringify(record);
      row.querySelector<HTMLElement>("[data-stock-on-hand]")!.textContent =
        String(level.onHand);
      row.querySelector<HTMLElement>("[data-stock-available]")!.textContent =
        String(level.sellable);
      const badge = row.querySelector<HTMLElement>("[data-stock-state]")!;
      badge.dataset.stockState = stockKey(level);
      badge.textContent = stockLabel(level);
      if (row === selectedRow()) {
        const selectedBadge = inspector.querySelector<HTMLElement>(
          "[data-inspector-stock-state]",
        )!;
        selectedBadge.dataset.stockState = stockKey(level);
        selectedBadge.textContent = stockLabel(level);
      }
      workspace.querySelector<HTMLElement>(
        "[data-stock-snapshot-note]",
      )!.hidden = false;
    }
    updatePreview();
  });
  updatePreview();
}

for (const workspace of document.querySelectorAll<HTMLElement>(
  "[data-inventory-workspace]",
))
  setupInventoryWorkspace(workspace);

function dismissFieldHelp(event: Event) {
  for (const help of document.querySelectorAll<HTMLDetailsElement>(
    ".admin-field-help[open]",
  )) {
    if (event.target instanceof Node && !help.contains(event.target))
      help.open = false;
  }
}
document.addEventListener("pointerdown", dismissFieldHelp);
document.addEventListener("focusin", dismissFieldHelp);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const help = document.querySelector<HTMLDetailsElement>(
    ".admin-field-help[open]",
  );
  if (!help) return;
  event.preventDefault();
  for (const open of document.querySelectorAll<HTMLDetailsElement>(
    ".admin-field-help[open]",
  ))
    open.open = false;
  help.querySelector<HTMLElement>("summary")?.focus();
});

const logout = document.querySelector<HTMLButtonElement>("[data-admin-logout]");
logout?.addEventListener("click", async () => {
  if (logout.disabled) return;
  logout.disabled = true;
  const status = document.querySelector<HTMLElement>(
    "[data-admin-logout-status]",
  )!;
  status.textContent = "Signing out on the server…";
  try {
    const { response } = await request("/api/admin/logout", "POST", "{}");
    if (!response.ok) throw new Error("Sign-out was not confirmed.");
    window.location.assign("/inventory/login");
  } catch {
    logout.disabled = false;
    status.textContent =
      "Sign-out is unverified. Retry server sign-out; hiding this page does not revoke a session.";
    status.focus();
  }
});
