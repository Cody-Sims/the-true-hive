function normalizeIngredients(ingredients: readonly string[]): string[] {
  if (!Array.isArray(ingredients) || ingredients.length > 40)
    throw new Error("Use at most 40 confirmed ingredients.");
  return ingredients.map((value) => {
    if (typeof value !== "string")
      throw new Error("Each ingredient must be plain text.");
    const ingredient = value.trim();
    if (
      !ingredient ||
      [...ingredient].length > 200 ||
      /[\r\n\0]|\p{Surrogate}/u.test(ingredient)
    )
      throw new Error(
        "Each ingredient must be one nonempty line of at most 200 characters.",
      );
    return ingredient;
  });
}

export function formatIngredientLabel(ingredients: readonly string[]): string {
  const entries = normalizeIngredients(ingredients);
  return entries.length ? `Ingredients: ${entries.join(", ")}` : "";
}

export function extractIngredientsFromDetails(details: readonly string[]): {
  ingredients: string[];
  details: string[];
} {
  if (
    !Array.isArray(details) ||
    details.some((line) => typeof line !== "string")
  )
    throw new Error("Review the details as plain-text lines first.");
  const markers = details
    .map((line, index) => (/^\s*ingredients\s*:\s*$/iu.test(line) ? index : -1))
    .filter((index) => index >= 0);
  if (markers.length !== 1)
    throw new Error(
      "Use one Ingredients: heading followed by bulleted ingredients.",
    );
  const start = markers[0]!;
  const ingredients: string[] = [];
  let end = start + 1;
  for (; end < details.length; end++) {
    const line = details[end]!;
    if (!/^\s*[-*\u2022]/u.test(line)) {
      if (!line.trim() || /^\s*[^:\r\n]+:/u.test(line)) break;
      throw new Error(
        "Use one bulleted ingredient per line and a blank line or heading before other notes.",
      );
    }
    const entry = /^\s*[-*\u2022]\s*(.+?)\s*$/u.exec(line);
    if (!entry)
      throw new Error("Every ingredient bullet must contain a confirmed name.");
    ingredients.push(entry[1]!);
  }
  if (!ingredients.length)
    throw new Error("Add at least one confirmed ingredient after the heading.");
  return {
    ingredients: normalizeIngredients(ingredients),
    details: [...details.slice(0, start), ...details.slice(end)],
  };
}
