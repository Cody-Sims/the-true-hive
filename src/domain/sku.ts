export function suggestVariantIdentifiers(
  productKey: string,
  variantLabel: string,
): { key: string; sku: string } {
  if (
    !/^[a-z0-9][a-z0-9-]{0,79}$/.test(productKey) ||
    !variantLabel.trim() ||
    [...variantLabel].length > 160 ||
    /[\x00-\x1f\x7f]|\p{Surrogate}/u.test(variantLabel)
  )
    throw new Error(
      "Confirm a valid product key and the actual variant name first.",
    );
  const label = variantLabel
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!label)
    throw new Error("Enter identifiers manually for this variant name.");
  // The suffix distinguishes truncated identities, not a uniqueness guarantee.
  let hash = 2166136261;
  for (const character of `${productKey}\0${variantLabel.trim()}`)
    hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619) >>> 0;
  const suffix = hash.toString(16).padStart(8, "0");
  const stem = `${productKey.slice(0, 30).replace(/-$/, "")}-${label.slice(0, 30).replace(/-$/, "")}`;
  return {
    key: `${stem}-${suffix}`,
    sku: `TH-${stem.toUpperCase()}-${suffix.toUpperCase()}`,
  };
}
