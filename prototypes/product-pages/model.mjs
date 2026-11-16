import { products } from "../next/data.mjs";
import { studies } from "./manifest.mjs";

export function selectStudy(params = new URLSearchParams()) {
  const design =
    studies.find((entry) => entry.id === params.get("design")) ?? studies[0];
  const product =
    products.find((entry) => entry.key === params.get("product")) ??
    products[0];
  const variant =
    product.variants.find((entry) => entry.key === params.get("variant")) ??
    product.variants[0];
  return { design, product, variant };
}
export function studyUrl(state, patch = {}) {
  const next = selectStudy(
    new URLSearchParams({
      design: state.design.id,
      product: state.product.key,
      variant: state.variant.key,
      ...patch,
    }),
  );
  return `index.html?${new URLSearchParams({ design: next.design.id, product: next.product.key, variant: next.variant.key })}`;
}
export function previewLine(state, quantity) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100)
    throw new Error("Choose 1-100 whole units.");
  return {
    variantKey: state.variant.key,
    quantity,
    unitPriceMinor: state.variant.priceMinor,
    totalMinor: state.variant.priceMinor * quantity,
  };
}
