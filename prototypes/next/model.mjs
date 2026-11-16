import { concepts } from "./manifest.mjs";
import { products } from "./data.mjs";

export function resolveReview(params = new URLSearchParams()) {
  const concept =
    concepts.find((entry) => entry.id === params.get("design")) ?? concepts[0];
  const product =
    products.find((entry) => entry.key === params.get("product")) ??
    products[0];
  const variant =
    product.variants.find((entry) => entry.key === params.get("variant")) ??
    product.variants[0];
  const requested = params.get("view");
  const view = [
    "home",
    "store",
    "product",
    "services",
    "about",
    "contact",
    "privacy",
    "accessibility",
    "cart",
  ].includes(requested)
    ? requested
    : "home";
  return { concept, view, product, variant };
}

export function reviewUrl(state, patch = {}) {
  const params = new URLSearchParams({
    design: state.concept.id,
    view: state.view,
    product: state.product.key,
    variant: state.variant.key,
    ...patch,
  });
  const resolved = resolveReview(params);
  return `concept.html?${new URLSearchParams({
    design: resolved.concept.id,
    view: resolved.view,
    product: resolved.product.key,
    variant: resolved.variant.key,
  })}`;
}

const findVariant = (key) =>
  products
    .flatMap((product) =>
      product.variants.map((variant) => ({ product, variant })),
    )
    .find((entry) => entry.variant.key === key);
const quantityValid = (quantity) =>
  Number.isInteger(quantity) && quantity > 0 && quantity <= 100;

export function cartSummary(lines = []) {
  const seen = new Set();
  const resolved = [];
  for (const line of Array.isArray(lines) ? lines.slice(0, 20) : []) {
    const entry = findVariant(line?.variantKey);
    if (!entry || seen.has(line.variantKey) || !quantityValid(line.quantity))
      continue;
    seen.add(line.variantKey);
    resolved.push({ ...entry, quantity: line.quantity });
  }
  return {
    lines: resolved,
    totalMinor: resolved.reduce(
      (sum, line) => sum + line.quantity * line.variant.priceMinor,
      0,
    ),
  };
}

export function updatePreviewCart(lines, variantKey, quantity) {
  if (!findVariant(variantKey) || !quantityValid(quantity))
    throw new Error("Choose a known format and 1-100 whole preview units.");
  const current = cartSummary(lines).lines.map((line) => ({
    variantKey: line.variant.key,
    quantity: line.quantity,
  }));
  const existing = current.find((line) => line.variantKey === variantKey);
  if (existing) {
    if (!quantityValid(existing.quantity + quantity))
      throw new Error("Preview quantity exceeds 100.");
    existing.quantity += quantity;
  } else current.push({ variantKey, quantity });
  return current;
}
