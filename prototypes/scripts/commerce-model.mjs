import { findVariant } from "./catalog.mjs";

const maximumQuantity = 99;

export function getAvailability(snapshot, variantId, fulfillment = "pickup", pickupLocationId = null) {
  if (!["pickup", "shipping"].includes(fulfillment)) {
    throw new RangeError("Unknown fulfillment method.");
  }
  if (snapshot.status === "unavailable") {
    return { status: "unknown", quantity: null, message: "Sample inventory is unavailable. Try another scenario." };
  }
  if (snapshot.status !== "ready") {
    throw new TypeError("Inventory snapshot has an unexpected status.");
  }
  let locations = snapshot.locations.filter((location) => location.channels.includes(fulfillment));
  if (fulfillment === "pickup" && locations.length > 1 && !pickupLocationId) {
    return { status: "unknown", quantity: null, message: "Choose a pickup location before checking its sample stock." };
  }
  if (fulfillment === "pickup" && pickupLocationId) {
    locations = locations.filter((location) => location.id === pickupLocationId);
  }
  if (locations.length === 0) {
    return { status: "not_offered", quantity: null, message: fulfillment === "shipping"
      ? "Shipping is a later phase; this preview is pickup-first."
      : "Pickup is not enabled at the selected sample location." };
  }
  const levels = snapshot.levels.filter((level) =>
    level.variantId === variantId && locations.some((location) => location.id === level.locationId));
  if (levels.length === 0 || levels.some((level) => !Number.isSafeInteger(level.available) || level.available < 0)) {
    return { status: "unknown", quantity: null, message: "A usable sample inventory record is missing." };
  }
  const quantity = levels.reduce((total, level) => total + level.available, 0);
  if (!Number.isSafeInteger(quantity)) {
    return { status: "unknown", quantity: null, message: "The sample inventory count could not be validated." };
  }
  return quantity > 0
    ? { status: "available", quantity, message: `Sample pickup stock: ${quantity}. Not real availability.` }
    : { status: "sold_out", quantity: 0, message: "Sold out in this demo scenario. Not a real stock claim." };
}

function isQuantity(value, allowZero = false) {
  return Number.isSafeInteger(value) && value >= (allowZero ? 0 : 1) && value <= maximumQuantity;
}

export function changeCart(lines, change, context) {
  const { variantId, quantity, operation } = change;
  if (!["add", "set"].includes(operation)) {
    return { ok: false, error: "The requested demo cart operation is not supported." };
  }
  if (!isQuantity(quantity, operation === "set")) {
    return { ok: false, error: "Choose a whole quantity from 1 to 99, or remove the item." };
  }
  if (operation === "set" && quantity === 0) {
    return { ok: true, lines: lines.filter((line) => line.variantId !== variantId)
      .map((line) => ({ variantId: line.variantId, quantity: line.quantity })) };
  }
  if (!findVariant(variantId, context.products)) {
    return { ok: false, error: "That sample variant is no longer in the demo catalog." };
  }
  const existing = lines.find((line) => line.variantId === variantId);
  const nextQuantity = operation === "add" ? (existing?.quantity ?? 0) + quantity : quantity;
  if (!isQuantity(nextQuantity)) {
    return { ok: false, error: "The total quantity must be a whole number from 1 to 99." };
  }
  const availability = getAvailability(context.snapshot, variantId, context.fulfillment, context.pickupLocationId);
  if (availability.status !== "available") return { ok: false, error: availability.message };
  if (nextQuantity > availability.quantity) {
    return { ok: false, error: `Only ${availability.quantity} units are available in this sample scenario. Your cart was not changed.` };
  }
  const next = lines.map((line) => ({
    variantId: line.variantId,
    quantity: line.variantId === variantId ? nextQuantity : line.quantity,
  }));
  if (!existing) next.push({ variantId, quantity: nextQuantity });
  return { ok: true, lines: next };
}

export function readCart(raw, products) {
  if (raw === null) return { ok: true, lines: [] };
  const invalid = { ok: false, error: "The saved demo cart is invalid or out of date. Reset it before adding items." };
  if (typeof raw !== "string" || raw.length > 32768) return invalid;
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) return invalid;
    throw error;
  }
  if (!value || value.version !== 1 || !Array.isArray(value.lines) || value.lines.length > 50) return invalid;
  const ids = new Set();
  const lines = [];
  for (const line of value.lines) {
    if (!line || typeof line.variantId !== "string" || !isQuantity(line.quantity)
      || ids.has(line.variantId) || !findVariant(line.variantId, products)) return invalid;
    ids.add(line.variantId);
    lines.push({ variantId: line.variantId, quantity: line.quantity });
  }
  return { ok: true, lines };
}

export function priceCart(lines, products, snapshot, fulfillment, pickupLocationId = null) {
  const items = [];
  const issues = [];
  let subtotalMinor = 0;
  let itemCount = 0;
  for (const line of lines) {
    const found = findVariant(line.variantId, products);
    if (!found || !isQuantity(line.quantity)) {
      issues.push("A saved sample cart line is no longer valid. Reset the demo cart.");
      continue;
    }
    const { product, variant } = found;
    const availability = getAvailability(snapshot, variant.id, fulfillment, pickupLocationId);
    let issue = null;
    if (availability.status !== "available") issue = availability.message;
    else if (line.quantity > availability.quantity) {
      issue = `This scenario now has ${availability.quantity} available. Reduce the quantity or remove the item.`;
    }
    if (issue) issues.push(`${product.title}: ${issue}`);
    const lineTotalMinor = variant.priceMinor * line.quantity;
    subtotalMinor += lineTotalMinor;
    itemCount += line.quantity;
    items.push({ product, variant, quantity: line.quantity, lineTotalMinor, availability, issue });
  }
  return { items, subtotalMinor, itemCount, canReview: items.length > 0 && issues.length === 0, issues };
}
