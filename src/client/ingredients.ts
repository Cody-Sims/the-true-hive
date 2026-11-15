import {
  extractIngredientsFromDetails,
  formatIngredientLabel,
} from "../domain/ingredients.ts";

for (const form of document.querySelectorAll<HTMLFormElement>(
  '[data-admin-form="product"]',
)) {
  const tools = form.querySelector<HTMLElement>("[data-ingredient-tools]");
  const ingredients = form.querySelector<HTMLTextAreaElement>(
    '[name="ingredients"]',
  );
  const details = form.querySelector<HTMLTextAreaElement>('[name="details"]');
  const fields = form.querySelector<HTMLFieldSetElement>(
    "[data-intent-fields]",
  );
  const preview = tools?.querySelector<HTMLTextAreaElement>(
    "[data-ingredient-label]",
  );
  const help = tools?.querySelector<HTMLElement>("[data-ingredient-help]");
  const status = tools?.querySelector<HTMLElement>("[data-ingredient-status]");
  const move = tools?.querySelector<HTMLButtonElement>(
    "[data-import-ingredients]",
  );
  const copy = tools?.querySelector<HTMLButtonElement>(
    "[data-copy-ingredients]",
  );
  if (
    !ingredients ||
    !details ||
    !fields ||
    !preview ||
    !help ||
    !status ||
    !move ||
    !copy
  )
    continue;

  const entries = () =>
    ingredients.value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  const editable = () =>
    !fields.disabled && (!form.dataset.phase || form.dataset.phase === "idle");
  function update() {
    try {
      preview!.value = formatIngredientLabel(entries());
      copy!.disabled = !preview!.value;
      if (ingredients!.value.trim()) {
        move!.disabled = true;
        help!.textContent =
          "Existing ingredients will not be overwritten. Clear them intentionally before importing.";
      } else {
        extractIngredientsFromDetails(details!.value.split(/\r?\n/));
        move!.disabled = false;
        help!.textContent =
          "An explicit ingredient block is available to move. Size and other notes will be kept.";
      }
    } catch (error) {
      move!.disabled = true;
      help!.textContent =
        error instanceof Error ? error.message : "Review the ingredient text.";
      if (ingredients!.value.trim()) {
        preview!.value = "";
        copy!.disabled = true;
      }
    }
  }
  form.addEventListener("input", (event) => {
    if (event.target !== ingredients && event.target !== details) return;
    status.textContent = "";
    update();
  });
  move.addEventListener("click", () => {
    if (!editable()) return;
    if (ingredients.value.trim()) {
      status.textContent =
        "Existing ingredients were kept. Clear them intentionally before importing.";
      update();
      return;
    }
    try {
      const imported = extractIngredientsFromDetails(
        details.value.split(/\r?\n/),
      );
      ingredients.value = imported.ingredients.join("\n");
      details.value = imported.details.join("\n");
      ingredients.dispatchEvent(new Event("input", { bubbles: true }));
      details.dispatchEvent(new Event("input", { bubbles: true }));
      status.textContent =
        "Ingredient entries moved; changes are not saved. Size and other notes were kept. Review and save the product to record them.";
      ingredients.focus();
    } catch (error) {
      status.textContent =
        error instanceof Error
          ? error.message
          : "Review the details before importing.";
      status.focus();
    }
  });
  copy.addEventListener("click", async () => {
    if (!editable()) return;
    try {
      const label = formatIngredientLabel(entries());
      if (!label) return;
      await navigator.clipboard.writeText(label);
      status.textContent =
        "Ingredient text copied. Review the wording and order before printing.";
    } catch {
      status.textContent =
        "Copy is unavailable. Select the generated ingredient text and copy it manually.";
      preview.focus();
      preview.select();
    }
  });
  update();
}
