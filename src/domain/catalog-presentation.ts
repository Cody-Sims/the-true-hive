import type { Product, ProductVariant } from "./catalog.ts";
import { pricedVariants, projectedStock } from "./cart.ts";

function stockedVariants(product: Product): ProductVariant[] {
  return pricedVariants(product).filter((variant) =>
    ["available", "low_stock"].includes(projectedStock(variant)?.state ?? ""),
  );
}

function rank(product: Product): number {
  if (stockedVariants(product).length) return 0;
  if (
    pricedVariants(product).some(
      (variant) =>
        !["out_of_stock", "not_offered"].includes(
          projectedStock(variant)?.state ?? "",
        ),
    )
  )
    return 1;
  return product.kind === "active" ? 2 : 3;
}

export function prioritizeProducts(products: readonly Product[]): Product[] {
  return [...products].sort((left, right) => rank(left) - rank(right));
}

export interface HeroProduct {
  product: Product;
  variant: ProductVariant | undefined;
}

function displayVariants(product: Product): ProductVariant[] {
  const stocked = stockedVariants(product);
  if (stocked.length) return stocked;
  const priced = pricedVariants(product);
  const offered = priced.filter(
    (variant) =>
      !["out_of_stock", "not_offered"].includes(
        projectedStock(variant)?.state ?? "",
      ),
  );
  return offered.length ? offered : priced.length ? priced : product.variants;
}

export function homeSelection(products: readonly Product[]): {
  stocked: boolean;
  featured: Product[];
  hero: HeroProduct[];
} {
  const ordered = prioritizeProducts(products);
  const ready = ordered.filter((product) => stockedVariants(product).length);
  const featured = (ready.length ? ready : ordered).slice(0, 4);
  const hero = featured.slice(0, 2).map((product) => ({
    product,
    variant: displayVariants(product)[0],
  }));
  const companion = hero[1] ?? hero[0];
  const additional = companion && displayVariants(companion.product)[1];
  if (companion && additional)
    hero.push({ product: companion.product, variant: additional });
  return { stocked: ready.length > 0, featured, hero };
}
