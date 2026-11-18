import { exampleProduct } from "../editor/model.mjs";

export const draftKey = (mode) => `true-hive:prototype:workbench:v1:${mode === "new" ? "new" : "edit"}`;
const text = (value, limit) => typeof value === "string" && value.length <= limit;

export function encodeDraft(product, mode, hasPhoto, updatedAt = Date.now()) {
  const { title, summary, category, status, details } = product;
  return JSON.stringify({
    version: 1, mode, updatedAt, hasPhoto,
    product: {
      title, summary, category, status, details, ingredients: product.ingredients || "",
      variants: product.variants.map(({ id, label, price, active }) => ({ id, label, price, active })),
    },
  });
}

export function decodeDraft(raw, mode) {
  if (raw === null) return { state: "empty" };
  try {
    if (typeof raw !== "string" || raw.length > 131072) throw new Error();
    const saved = JSON.parse(raw);
    const p = saved?.product;
    if (saved?.version !== 1 || saved.mode !== mode || typeof saved.hasPhoto !== "boolean"
      || !Number.isSafeInteger(saved.updatedAt) || saved.updatedAt < 0 || saved.updatedAt > 8640000000000000
      || !p || !text(p.title, 160) || !text(p.summary, 1000) || !text(p.details, 24011)
      || !text(p.ingredients, 8192) || !["soap", "honey", "candles", "gifts"].includes(p.category)
      || !["draft", "published", "archived"].includes(p.status) || !Array.isArray(p.variants) || p.variants.length > 50
      || p.variants.some((v) => !v || !/^demo-[1-9]\d{0,5}$/.test(v.id) || !text(v.label, 160) || !text(v.price, 32) || typeof v.active !== "boolean")
      || new Set(p.variants.map((v) => v.id)).size !== p.variants.length) throw new Error();
    const baseline = exampleProduct(mode);
    return {
      state: "restored", updatedAt: saved.updatedAt, hasPhoto: saved.hasPhoto,
      product: {
        title: p.title, summary: p.summary, category: p.category, status: p.status,
        details: p.details, ingredients: p.ingredients,
        variants: p.variants.map(({ id, label, price, active }) => {
          const original = baseline.variants.find((variant) => variant.id === id);
          return { id, label, price, active, stock: original?.stock ?? 0, history: original?.history ?? false };
        }),
      },
    };
  } catch {
    return { state: "invalid" };
  }
}
