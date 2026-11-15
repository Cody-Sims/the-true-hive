import type { Catalog, Product, ProductVariant } from "./catalog.ts";

export interface CartLine {
  variantKey: string;
  quantity: number;
}

export const CART_STORAGE_KEY = "true-hive-cart";
export const MAX_CART_LINES = 20;
export const MAX_CART_QUANTITY = 100;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validKey(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/.test(value);
}

function validQuantity(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_CART_QUANTITY
  );
}

export function parseCart(raw: string | null): {
  lines: CartLine[];
  recovered: boolean;
} {
  if (raw === null) return { lines: [], recovered: false };
  try {
    if (raw.length > 8192) throw new Error();
    const value: unknown = JSON.parse(raw);
    if (
      !record(value) ||
      value["version"] !== 1 ||
      !Array.isArray(value["lines"])
    )
      throw new Error();
    const lines: CartLine[] = [];
    let recovered = Object.keys(value).some(
      (key) => key !== "version" && key !== "lines",
    );
    for (const entry of value["lines"]) {
      if (
        !record(entry) ||
        !validKey(entry["variantKey"]) ||
        !validQuantity(entry["quantity"])
      ) {
        recovered = true;
        continue;
      }
      if (
        Object.keys(entry).some(
          (key) => key !== "variantKey" && key !== "quantity",
        )
      )
        recovered = true;
      const existing = lines.find(
        (line) => line.variantKey === entry["variantKey"],
      );
      if (existing) {
        existing.quantity = Math.min(
          MAX_CART_QUANTITY,
          existing.quantity + entry["quantity"],
        );
        recovered = true;
      } else if (lines.length < MAX_CART_LINES) {
        lines.push({
          variantKey: entry["variantKey"],
          quantity: entry["quantity"],
        });
      } else {
        recovered = true;
      }
    }
    return { lines, recovered };
  } catch {
    return { lines: [], recovered: true };
  }
}

export function serializeCart(lines: CartLine[]): string {
  const clean = parseCart(JSON.stringify({ version: 1, lines })).lines;
  return JSON.stringify({ version: 1, lines: clean });
}

export function updateCart(
  lines: CartLine[],
  variantKey: string,
  quantity: number,
  mode: "add" | "set" = "set",
): CartLine[] {
  if (!validKey(variantKey)) throw new Error("Choose a valid variant.");
  if (quantity !== 0 && !validQuantity(quantity))
    throw new Error("Choose a whole quantity from 1 to 100.");
  if (mode === "add" && quantity === 0)
    throw new Error("Choose a whole quantity from 1 to 100.");
  const next = lines.map((line) => ({ ...line }));
  const index = next.findIndex((line) => line.variantKey === variantKey);
  if (quantity === 0)
    return next.filter((line) => line.variantKey !== variantKey);
  const total =
    quantity + (mode === "add" && index >= 0 ? next[index]!.quantity : 0);
  if (total > MAX_CART_QUANTITY)
    throw new Error("A cart variant can contain at most 100 items.");
  if (index >= 0) next[index]!.quantity = total;
  else {
    if (next.length >= MAX_CART_LINES)
      throw new Error("A cart can contain at most 20 distinct variants.");
    next.push({ variantKey, quantity: total });
  }
  return next;
}

interface StockProjection {
  state:
    "available" | "low_stock" | "out_of_stock" | "not_offered" | "unverified";
  remaining?: number;
}

export function projectedStock(
  variant: ProductVariant,
): StockProjection | undefined {
  const stock = (variant as ProductVariant & { stock?: StockProjection }).stock;
  if (
    stock?.state === "low_stock" &&
    (!Number.isInteger(stock.remaining) ||
      stock.remaining! < 1 ||
      stock.remaining! > 5)
  )
    return { state: "unverified" };
  return stock;
}

export function stockLabel(variant: ProductVariant): string {
  const stock = projectedStock(variant);
  switch (stock?.state) {
    case "available":
      return "Available";
    case "low_stock":
      return `Only ${stock.remaining} left`;
    case "out_of_stock":
      return "Sold out";
    case "not_offered":
      return "Not offered for pickup";
    default:
      return "Availability unverified";
  }
}

export function pricedVariants(product: Product): ProductVariant[] {
  return product.kind === "active"
    ? product.variants.filter(
        (variant) =>
          variant.currency === "USD" &&
          Number.isSafeInteger(variant.priceMinor) &&
          variant.priceMinor! > 0,
      )
    : [];
}

export function money(minor: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(minor / 100);
}

export interface ResolvedCartLine extends CartLine {
  product: Product | null;
  variant: ProductVariant | null;
  unitMinor: number | null;
  lineMinor: number | null;
  issue: string | null;
}

export function resolveCart(
  lines: CartLine[],
  catalog: Catalog | null,
): {
  lines: ResolvedCartLine[];
  subtotalMinor: number | null;
  canCheckout: boolean;
} {
  const resolved: ResolvedCartLine[] = lines.map((line) => {
    const product =
      catalog?.products.find((entry) =>
        entry.variants.some((variant) => variant.key === line.variantKey),
      ) ?? null;
    const variant =
      product?.variants.find((entry) => entry.key === line.variantKey) ?? null;
    const priced =
      product && variant && pricedVariants(product).includes(variant);
    const unitMinor = priced ? variant.priceMinor : null;
    const lineMinor = unitMinor === null ? null : unitMinor * line.quantity;
    const stock = variant ? projectedStock(variant) : undefined;
    let issue: string | null = null;
    if (!catalog)
      issue = "The catalog is unavailable. Try refreshing before checkout.";
    else if (!product || !variant)
      issue = "This variant is no longer published. Remove it to continue.";
    else if (product.kind === "concept")
      issue = "Concept only — not available to purchase.";
    else if (!priced) issue = "A current price is not available.";
    else if (stock?.state === "out_of_stock")
      issue = "Sold out. Remove this variant to continue.";
    else if (stock?.state === "not_offered") issue = "Not offered for pickup.";
    else if (stock?.state === "unverified")
      issue = "Availability unverified. Refresh before checkout.";
    else if (stock?.state === "low_stock" && line.quantity > stock.remaining!)
      issue = `Only ${stock.remaining} left. Reduce this quantity to continue.`;
    return { ...line, product, variant, unitMinor, lineMinor, issue };
  });
  const subtotalMinor = resolved.every((line) => line.lineMinor !== null)
    ? resolved.reduce((total, line) => total + line.lineMinor!, 0)
    : null;
  return {
    lines: resolved,
    subtotalMinor,
    canCheckout: resolved.length > 0 && resolved.every((line) => !line.issue),
  };
}
