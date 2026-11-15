import type { Catalog } from "../domain/catalog.ts";
import {
  CART_STORAGE_KEY,
  money,
  parseCart,
  pricedVariants,
  projectedStock,
  resolveCart,
  stockLabel,
  updateCart,
} from "../domain/cart.ts";
import { readStoredCart, saveStoredCart } from "./cart-storage.ts";
import { createCartCheckout } from "./cart-checkout.ts";

const storage = () => window.localStorage;
const saved = readStoredCart(storage);
let lines = saved.lines;
let persistent = saved.persistent;
let catalog: Catalog | null = null;
let refreshing = false;
let verifying = false;
const page = document.querySelector<HTMLElement>("[data-cart-page]");
const content = page?.querySelector<HTMLElement>("[data-cart-content]");
const list = page?.querySelector<HTMLUListElement>("[data-cart-lines]");
const empty = page?.querySelector<HTMLElement>("[data-cart-empty]");
const subtotal = page?.querySelector<HTMLElement>("[data-cart-subtotal]");
const clear = page?.querySelector<HTMLButtonElement>("[data-cart-clear]");
const refresh = page?.querySelector<HTMLButtonElement>("[data-cart-refresh]");
const submit = page?.querySelector<HTMLButtonElement>("[data-cart-checkout]");
const retry = page?.querySelector<HTMLButtonElement>("[data-cart-retry]");
const checkoutStatus = page?.querySelector<HTMLElement>(
  "[data-cart-checkout-status]",
);
const status = page?.querySelector<HTMLElement>("[data-cart-status]");
const storageStatus = page?.querySelector<HTMLElement>("[data-cart-storage]");
let recoveryNotice: HTMLElement | null = null;
let showingPendingSelection = false;
let latestCartUnavailable = false;

const checkout = createCartCheckout({
  pendingStorage: () => window.sessionStorage,
  operationId: () => crypto.randomUUID(),
  navigate: (url) => window.location.assign(url),
  onState(phase, message) {
    if (checkout.hasPendingIntent) {
      showingPendingSelection = true;
    } else if (
      showingPendingSelection &&
      (phase === "idle" || phase === "closed")
    ) {
      const current = readStoredCart(storage);
      if (current.persistent) lines = current.lines;
      persistent = current.persistent;
      latestCartUnavailable = !current.persistent;
      showingPendingSelection = false;
      if (storageStatus)
        storageStatus.textContent = persistent
          ? ""
          : "The latest saved cart could not be read. No saved selections have been overwritten; review browser storage before starting another checkout.";
    }
    if (checkoutStatus) {
      checkoutStatus.textContent = message;
      if (phase !== "pending") checkoutStatus.focus();
    }
    if (!checkoutStatus && phase !== "idle")
      showRecoveryNotice(
        message,
        phase === "closed" ? "New checkouts are paused" : undefined,
      );
    if (phase === "idle") {
      recoveryNotice?.remove();
      recoveryNotice = null;
    }
    if (retry) retry.hidden = !checkout.canRetry;
    page?.setAttribute("aria-busy", String(phase === "pending"));
    render();
  },
  async request(body) {
    return fetch("/api/checkout", {
      method: "POST",
      mode: "same-origin",
      credentials: "same-origin",
      redirect: "error",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body,
      signal: AbortSignal.timeout(15000),
    });
  },
});

function locked() {
  return (
    verifying ||
    refreshing ||
    latestCartUnavailable ||
    checkout.phase !== "idle"
  );
}

function cartLocked() {
  return (
    verifying ||
    refreshing ||
    latestCartUnavailable ||
    checkout.hasPendingIntent
  );
}

function announce(message: string) {
  if (status) status.textContent = message;
}

function showRecoveryNotice(
  message: string,
  heading = "TEST checkout — outcome not confirmed",
) {
  if (!recoveryNotice) {
    recoveryNotice = document.createElement("aside");
    recoveryNotice.className = "notice wrap";
    recoveryNotice.setAttribute("role", "status");
    recoveryNotice.append(text("h2", heading), text("p", ""));
    const link = document.createElement("a");
    link.href = "/cart";
    link.className = "text-link";
    link.textContent = "Review or retry the pending test checkout";
    recoveryNotice.append(link);
    document.querySelector("#main")?.prepend(recoveryNotice);
  }
  recoveryNotice.querySelector("p")!.textContent = message;
}

function updateCounts() {
  const count = lines.reduce((total, line) => total + line.quantity, 0);
  for (const badge of document.querySelectorAll<HTMLElement>(
    "[data-cart-count]",
  ))
    badge.textContent = count ? ` (${count})` : "";
}

function persist() {
  persistent = saveStoredCart(storage, lines);
  updateCounts();
  if (storageStatus)
    storageStatus.textContent = persistent
      ? ""
      : "Browser storage is unavailable. Changes last only on this page and will be lost when you navigate away.";
}

async function loadCatalog(): Promise<Catalog> {
  const response = await fetch("/api/catalog", {
    mode: "same-origin",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Catalog unavailable");
  const value = (await response.json()) as Catalog;
  if (
    !value ||
    !["database", "showcase"].includes(value.source) ||
    !Array.isArray(value.products) ||
    value.products.length > 100 ||
    value.products.some(
      (product) =>
        !product ||
        typeof product.title !== "string" ||
        typeof product.slug !== "string" ||
        !["active", "concept"].includes(product.kind) ||
        !Array.isArray(product.variants) ||
        product.variants.some(
          (variant) =>
            !variant ||
            typeof variant.key !== "string" ||
            typeof variant.label !== "string",
        ),
    )
  )
    throw new Error("Invalid catalog");
  return value;
}

function text(tag: "p" | "h2" | "span", value: string, className?: string) {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}

function focusHeading() {
  page?.querySelector<HTMLElement>("[data-cart-heading]")?.focus();
}

function render() {
  updateCounts();
  if (!page || !list || !empty || !subtotal || !clear || !refresh) return;
  const displayedLines = checkout.pendingLines ?? lines;
  const resolved = resolveCart(displayedLines, catalog);
  const busy = cartLocked();
  list.replaceChildren();
  for (const line of resolved.lines) {
    const item = document.createElement("li");
    item.className = "cart-line";
    const heading = document.createElement("h2");
    if (line.product) {
      const link = document.createElement("a");
      link.href = `/goods/${encodeURIComponent(line.product.slug)}`;
      link.textContent = line.product.title;
      heading.append(link);
    } else heading.textContent = "Unavailable product";
    item.append(heading);
    item.append(
      text("p", line.variant?.label ?? `Saved variant: ${line.variantKey}`),
    );
    item.append(
      text(
        "p",
        line.unitMinor === null
          ? "Price unavailable"
          : `${money(line.unitMinor)} each · ${money(line.lineMinor!)} for this line`,
      ),
    );
    if (line.product?.kind === "active" && line.variant)
      item.append(text("p", stockLabel(line.variant)));
    if (line.issue) item.append(text("p", line.issue, "cart-issue"));

    const form = document.createElement("form");
    const label = document.createElement("label");
    label.textContent = "Quantity";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.max = "100";
    input.step = "1";
    input.required = true;
    input.value = String(line.quantity);
    input.disabled = busy;
    input.setAttribute(
      "aria-label",
      `Quantity for ${line.product?.title ?? line.variantKey} ${line.variant?.label ?? ""}`,
    );
    label.append(input);
    const update = document.createElement("button");
    update.type = "submit";
    update.className = "button";
    update.textContent = "Update quantity";
    update.disabled = busy;
    form.append(label, update);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (cartLocked() || !form.reportValidity()) return;
      try {
        lines = updateCart(lines, line.variantKey, Number(input.value));
        persist();
        render();
        announce("Cart quantity updated. No stock has been reserved.");
        focusHeading();
      } catch (error) {
        announce(
          error instanceof Error
            ? error.message
            : "Quantity could not be updated.",
        );
      }
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button";
    remove.textContent = "Remove";
    remove.setAttribute(
      "aria-label",
      `Remove ${line.product?.title ?? line.variantKey} ${line.variant?.label ?? ""}`,
    );
    remove.disabled = busy;
    remove.addEventListener("click", () => {
      if (cartLocked()) return;
      lines = updateCart(lines, line.variantKey, 0);
      persist();
      render();
      announce("Item removed from your cart.");
      focusHeading();
    });
    form.append(remove);
    item.append(form);
    list.append(item);
  }
  empty.hidden = displayedLines.length > 0;
  subtotal.textContent =
    resolved.subtotalMinor === null
      ? "Unavailable until all prices are verified"
      : money(resolved.subtotalMinor);
  clear.disabled = busy || !lines.length;
  refresh.disabled = verifying || refreshing || checkout.hasPendingIntent;
  if (submit)
    submit.disabled =
      locked() || !resolved.canCheckout || page.dataset.testEnabled !== "true";
  if (retry) {
    retry.hidden = !checkout.canRetry;
    retry.disabled = refreshing || verifying;
  }
  content?.setAttribute("aria-busy", String(refreshing));
}

function displaySignature() {
  return JSON.stringify(
    resolveCart(lines, catalog).lines.map((line) => ({
      variantKey: line.variantKey,
      quantity: line.quantity,
      unitMinor: line.unitMinor,
      issue: line.issue,
      stock: line.variant ? stockLabel(line.variant) : null,
    })),
  );
}

async function refreshCatalog(initialRead = false) {
  if (cartLocked() && !initialRead) return false;
  refreshing = true;
  render();
  try {
    catalog = await loadCatalog();
    announce(
      checkout.phase !== "idle"
        ? "Current catalog prices loaded. These do not confirm the existing order total, payment or stock release. Pending checkout recovery is still required."
        : saved.recovered
          ? "Invalid saved cart data was removed. Current catalog prices are loaded; review your selections. No stock has been reserved."
          : "Current catalog prices loaded. Your cart does not reserve stock.",
    );
    return true;
  } catch {
    catalog = null;
    announce(
      "The catalog is unavailable. Saved selections are kept, but prices and availability cannot be verified. Try refreshing later.",
    );
    return false;
  } finally {
    refreshing = false;
    render();
  }
}

clear?.addEventListener("click", () => {
  if (cartLocked()) return;
  lines = [];
  persist();
  render();
  announce(
    "Your cart has been cleared. This does not cancel an existing checkout or release a stock hold.",
  );
  focusHeading();
});
refresh?.addEventListener("click", () => {
  if (latestCartUnavailable) {
    const current = readStoredCart(storage);
    if (!current.persistent) {
      announce(
        "The latest saved cart is still unavailable. Nothing has been overwritten.",
      );
      return;
    }
    lines = current.lines;
    persistent = true;
    latestCartUnavailable = false;
    if (storageStatus) storageStatus.textContent = "";
  }
  void refreshCatalog();
});
submit?.addEventListener("click", async () => {
  if (locked() || page?.dataset.testEnabled !== "true") return;
  const before = displaySignature();
  verifying = true;
  render();
  try {
    catalog = await loadCatalog();
  } catch {
    catalog = null;
    announce(
      "Current prices could not be verified. No new checkout was started.",
    );
    return;
  } finally {
    verifying = false;
    render();
  }
  if (before !== displaySignature()) {
    announce(
      "Prices or availability changed. Review the refreshed cart before continuing to TEST checkout.",
    );
    focusHeading();
    return;
  }
  if (resolveCart(lines, catalog).canCheckout) await checkout.start(lines);
});
retry?.addEventListener("click", () => {
  void checkout.retry();
});

for (const form of document.querySelectorAll<HTMLFormElement>(
  "[data-add-to-cart]",
)) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity() || form.getAttribute("aria-busy") === "true")
      return;
    const feedback = form.querySelector<HTMLElement>("[data-add-status]");
    if (checkout.hasPendingIntent) {
      if (feedback)
        feedback.textContent =
          "TEST checkout recovery is required before changing this selection. Open your cart to recover the same intent; no item was added.";
      return;
    }
    const button = form.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!;
    const data = new FormData(form);
    const variantKey = String(data.get("variantKey") ?? "");
    const quantity = Number(data.get("quantity"));
    button.disabled = true;
    form.setAttribute("aria-busy", "true");
    try {
      const current = await loadCatalog();
      const product = current.products.find((product) =>
        pricedVariants(product).some((variant) => variant.key === variantKey),
      );
      const variant = product?.variants.find(
        (variant) => variant.key === variantKey,
      );
      if (!variant)
        throw new Error(
          "This variant or price is no longer available. Reload the product page.",
        );
      const stock = projectedStock(variant);
      if (stock?.state === "out_of_stock" || stock?.state === "not_offered")
        throw new Error(
          "This variant is currently unavailable. Nothing was added.",
        );
      const next = updateCart(lines, variantKey, quantity, "add");
      if (
        stock?.state === "low_stock" &&
        next.find((line) => line.variantKey === variantKey)!.quantity >
          stock.remaining!
      )
        throw new Error(
          `Only ${stock.remaining} left. Reduce the quantity in your cart.`,
        );
      lines = next;
      persist();
      if (feedback)
        feedback.textContent = persistent
          ? "Added to your cart. No stock reserved. View your cart to review current prices."
          : "Added for this page only. Browser storage is blocked; navigating away will lose this selection.";
    } catch (error) {
      if (feedback)
        feedback.textContent =
          error instanceof Error
            ? error.message
            : "The selection could not be saved.";
    } finally {
      form.setAttribute("aria-busy", "false");
      button.disabled = false;
    }
  });
}

window.addEventListener("storage", (event) => {
  if (event.key !== CART_STORAGE_KEY && event.key !== null) return;
  if (checkout.hasPendingIntent || verifying) {
    announce(
      "The saved cart changed in another tab. This checkout intent remains unchanged. Do not start a second checkout.",
    );
    return;
  }
  lines = parseCart(event.key === null ? null : event.newValue).lines;
  render();
  announce(
    "Your cart was updated in another tab. Refresh current prices before checkout.",
  );
});
window.addEventListener("beforeunload", (event) => {
  if (
    checkout.phase === "pending" ||
    checkout.phase === "uncertain" ||
    (checkout.phase === "blocked" && checkout.hasPendingIntent)
  ) {
    event.preventDefault();
    event.returnValue = "";
  }
});

checkout.announceRecovery();
updateCounts();
if (page) {
  if (!checkout.hasPendingIntent) persist();
  if (saved.recovered)
    announce(
      "Some invalid saved cart data was removed. Please review your selections.",
    );
  render();
  void refreshCatalog(true);
}
