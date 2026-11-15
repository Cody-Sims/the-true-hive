// Enhances the generic admin adjustment protocol; never sends a mutation itself.
for (const form of document.querySelectorAll<HTMLFormElement>(
  "[data-stock-controls]",
)) {
  const amount = form.elements.namedItem("amount") as HTMLInputElement;
  const direction = form.elements.namedItem("direction") as HTMLSelectElement;
  const reason = form.elements.namedItem("reason") as HTMLTextAreaElement;
  const fields = form.querySelector<HTMLFieldSetElement>(
    "[data-intent-fields]",
  )!;
  const balance = form
    .closest("[data-stock-panel]")
    ?.querySelector("[data-level]");

  function validate() {
    const letters = reason.value.trim().match(/\p{L}/gu) ?? [];
    reason.setCustomValidity(
      letters.length >= 3
        ? ""
        : "Explain why stock changed, for example received delivery or damaged units.",
    );
    amount.setCustomValidity("");
    if (direction.value !== "reduce") return;
    const quantities = ["onHand", "held", "committed", "unavailable"].map(
      (key) => {
        const value = balance
          ?.querySelector(`[data-quantity="${key}"]`)
          ?.textContent?.trim();
        return value && /^\d+$/.test(value) ? Number(value) : NaN;
      },
    );
    if (!quantities.every(Number.isSafeInteger)) {
      amount.setCustomValidity(
        "Current server quantities are unverified. Refresh before reducing stock.",
      );
      return;
    }
    const [onHand, held, committed, unavailable] = quantities as [
      number,
      number,
      number,
      number,
    ];
    const removable = Math.max(0, onHand - held - committed - unavailable);
    if (Number(amount.value) > removable)
      amount.setCustomValidity(
        `Reduce by at most ${removable} units. Held, committed and unavailable stock must remain on hand.`,
      );
  }

  form.addEventListener("input", validate);
  form.addEventListener("change", validate);
  form.addEventListener(
    "submit",
    (event) => {
      if (form.dataset.phase && form.dataset.phase !== "idle") return;
      validate();
      if (!form.reportValidity()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );

  for (const preset of form.querySelectorAll<HTMLButtonElement>(
    "[data-stock-add]",
  )) {
    preset.addEventListener("click", () => {
      if (
        fields.disabled ||
        (form.dataset.phase && form.dataset.phase !== "idle")
      )
        return;
      direction.value = "increase";
      amount.value = preset.dataset.stockAdd!;
      validate();
      const status = form.querySelector<HTMLElement>("[data-admin-status]");
      if (status)
        status.textContent = `Prepared Add ${amount.value} units only. Nothing submitted. Review the amount and reason, then confirm.`;
      reason.focus();
    });
  }

  if (balance)
    new MutationObserver(validate).observe(balance, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  validate();
}
