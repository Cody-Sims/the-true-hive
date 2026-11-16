import type { AdminInventoryLevel, AdminProduct } from "../../domain/admin.ts";
import { pageHref, pageQuery } from "./presentation.ts";

export const inventoryCategories = [
  ["honey", "Honey"],
  ["soap", "Soap"],
  ["candles", "Candles"],
  ["gifts", "Gifts"],
] as const;
export const stockFilters = [
  ["all", "All inventory"],
  ["in", "In stock"],
  ["out", "Out of stock"],
  ["untracked", "Not tracked"],
] as const;

export function inventoryQuery(url: URL) {
  const category = url.searchParams.get("category") ?? "all";
  const stock = url.searchParams.get("stock") ?? "all";
  const locationKey = url.searchParams.get("locationKey") ?? "";
  return {
    ...pageQuery(url),
    category: inventoryCategories.some(([key]) => key === category)
      ? category
      : "all",
    stock: stockFilters.some(([key]) => key === stock) ? stock : "all",
    locationKey: /^[a-z0-9][a-z0-9-]{0,79}$/.test(locationKey)
      ? locationKey
      : "",
  };
}
export type InventoryQuery = ReturnType<typeof inventoryQuery>;

export function inventoryHref(
  query: InventoryQuery,
  changes: Partial<InventoryQuery> & { variant?: string } = {},
) {
  const next = { ...query, ...changes };
  return pageHref("/inventory/products", next.offset, next.search, {
    locationKey: next.locationKey,
    category: next.category,
    stock: next.stock,
    ...(changes.variant ? { variant: changes.variant } : {}),
  });
}

export function stockState(level: AdminInventoryLevel | null) {
  return !level ? "untracked" : level.sellable === 0 ? "out" : "in";
}

export function inventoryRows(products: AdminProduct[], query: InventoryQuery) {
  const search = query.search.toLocaleLowerCase();
  return products.flatMap((product) =>
    product.variants.flatMap((variant) => {
      const level =
        variant.levels.find(
          (entry) => entry.locationKey === query.locationKey,
        ) ?? null;
      const matchesSearch =
        !search ||
        [product.title, product.slug, variant.sku].some((value) =>
          value.toLocaleLowerCase().includes(search),
        );
      if (
        !matchesSearch ||
        (query.category !== "all" && query.category !== product.category) ||
        (query.stock !== "all" && query.stock !== stockState(level))
      )
        return [];
      return [{ product, variant, level }];
    }),
  );
}
