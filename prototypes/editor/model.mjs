export function exampleProduct(mode = "edit") {
  return mode === "new"
    ? { title: "", summary: "", category: "candles", status: "draft", details: "", variants: [{ id: "demo-1", label: "", price: "", active: true, stock: 0, history: false }] }
    : {
      title: "Amber candle", summary: "Fictional candle used only to compare editor layouts.",
      category: "candles", status: "published", details: "Demo size: 8 oz or 12 oz.\nAll content on this page is fictional.",
      variants: [
        { id: "demo-1", label: "Amber / 8 oz", price: "18.00", active: true, stock: 8, history: true },
        { id: "demo-2", label: "Amber / 12 oz", price: "24.00", active: true, stock: 0, history: false },
        { id: "demo-3", label: "Earlier tin", price: "12.00", active: false, stock: 0, history: true },
      ],
    };
}

export function changeVariant(product, id, action) {
  const variant = product.variants.find((entry) => entry.id === id);
  if (!variant) return { product, error: "Variant not found." };
  if (!["archive", "restore", "delete"].includes(action))
    return { product, error: "Choose an available variant action." };
  if (action === "delete" && (variant.stock > 0 || variant.history))
    return { product, error: "Stock or history prevents permanent deletion. Archive this variant instead." };
  if (action !== "restore" && product.status === "published" &&
    !product.variants.some((entry) => entry.id !== id && entry.active && validPrice(entry.price)))
    return { product, error: "The last active priced variant cannot be removed from a published product. Archive the product first." };
  const updated = structuredClone(product);
  if (action === "delete") updated.variants = updated.variants.filter((entry) => entry.id !== id);
  else updated.variants.find((entry) => entry.id === id).active = action === "restore";
  return { product: updated };
}

export function validPrice(value) {
  return /^\d+(?:\.\d{1,2})?$/.test(value) && Number(value) > 0 && Number(value) <= 21474836.47;
}

export function productIssues(product, publish = false) {
  const issues = [];
  if (!product.title.trim()) issues.push("Enter a product name.");
  if (!product.summary.trim()) issues.push("Add a short description.");
  if (product.variants.some((variant) => !variant.label.trim()))
    issues.push("Give every variant a name.");
  if (product.variants.some((variant) => variant.price !== "" && !validPrice(variant.price)))
    issues.push("Use a positive USD price with no more than two decimal places.");
  if ((publish || product.status === "published") &&
    !product.variants.some((variant) => variant.active && validPrice(variant.price)))
    issues.push("Publication needs at least one active variant with a price.");
  return issues;
}
