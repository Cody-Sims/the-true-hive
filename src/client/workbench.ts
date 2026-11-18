import {
  decodeDraft,
  encodeDraft,
  draftTextLimits,
  reserveDraftSlot,
} from "./workbench-draft.ts";
import type {
  DraftFields,
  EditableDraft,
  LocalDraft,
} from "./workbench-draft.ts";
import type { AdminProduct } from "../domain/admin.ts";

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const field = (root: ParentNode, name: string) =>
  root.querySelector<Field>(`[name="${name}"]`)!;
const rows = (form: HTMLFormElement) => [
  ...form.querySelectorAll<HTMLElement>(
    "[data-admin-variants] > [data-admin-variant]",
  ),
];

export function workbenchFingerprint(form: HTMLFormElement) {
  return JSON.stringify(
    [
      ...form.querySelectorAll<Field>(
        "[data-intent-fields] input, [data-intent-fields] textarea, [data-intent-fields] select",
      ),
    ].map((node) => [
      node.name,
      node.type === "checkbox"
        ? (node as HTMLInputElement).checked
        : node.value,
    ]),
  );
}

export function setupWorkbench(form: HTMLFormElement) {
  if (!form.hasAttribute("data-workbench")) return;
  const storageKey = form.dataset.workbenchStorage;
  let baseRevision = Number(form.dataset.workbenchBaseRevision) || null;
  let baseline = workbenchFingerprint(form);
  form.dataset.workbenchBaseline = baseline;
  let baselineFields = Object.fromEntries(
    Object.keys(draftTextLimits).map((name) => [name, field(form, name).value]),
  ) as DraftFields;
  let baselineRows = rows(form).map(
    (row) => row.cloneNode(true) as HTMLElement,
  );
  const status = form.querySelector<HTMLElement>(
    "[data-workbench-draft-status]",
  )!;
  const restore = form.querySelector<HTMLButtonElement>(
    "[data-workbench-restore]",
  )!;
  const review = form.querySelector<HTMLButtonElement>(
    "[data-workbench-review-draft]",
  )!;
  const keep = form.querySelector<HTMLButtonElement>("[data-workbench-keep]")!;
  const clear = form.querySelector<HTMLButtonElement>(
    "[data-workbench-clear]",
  )!;
  const reset = form.querySelector<HTMLButtonElement>(
    "[data-workbench-reset]",
  )!;
  const resolved = form.querySelector<HTMLButtonElement>(
    "[data-workbench-resolved]",
  )!;
  const safety = form.querySelector<HTMLElement>("[data-workbench-safety]")!;
  let seen: string | null = null;
  let recoverable: LocalDraft | null = null;
  let conflict = false;
  let paused = false;
  let storageAvailable = !!storageKey;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function lock(blocked: boolean) {
    form.dataset.workbenchBlocked = String(blocked);
    if (blocked)
      for (const button of form.querySelectorAll<HTMLButtonElement>(
        'button[type="submit"], [data-admin-delete-product], [data-admin-delete-variant]',
      ))
        button.disabled = true;
    else if (!form.dataset.phase || form.dataset.phase === "idle")
      for (const button of form.querySelectorAll<HTMLButtonElement>(
        'button[type="submit"], [data-admin-delete-product], [data-admin-delete-variant]',
      ))
        button.disabled = false;
  }
  function read() {
    return storageKey ? localStorage.getItem(storageKey) : null;
  }
  function unavailable() {
    storageAvailable = false;
    status.textContent =
      "Local draft storage is unavailable or full. Your edits remain in this tab only; server saving is separate.";
  }
  function inspect(raw: string | null, fromOtherTab = false) {
    recoverable = null;
    restore.hidden = true;
    review.hidden = true;
    keep.hidden = true;
    if (!raw) {
      if (fromOtherTab) {
        conflict = paused = true;
        lock(true);
        if (!safety.hidden) {
          status.textContent =
            "The other tab changed its unresolved-operation marker. Review the authoritative record and history before continuing here.";
          return;
        }
        keep.hidden = false;
        status.textContent =
          "The local draft was cleared in another tab. Review before keeping this tab's edits.";
      }
      return;
    }
    lock(true);
    try {
      recoverable = decodeDraft(raw);
      if (recoverable.kind === "safety") {
        paused = true;
        lock(true);
        clear.disabled = true;
        safety.hidden = false;
        resolved.hidden = false;
        status.textContent =
          "An unresolved operation has an unverified outcome. Review the authoritative record and history before any new mutation.";
        return;
      }
      if (fromOtherTab) {
        conflict = true;
        lock(true);
        keep.hidden = false;
      }
      paused = true;
      review.hidden = false;
      if (recoverable.baseRevision !== baseRevision) {
        status.textContent =
          "A stale draft belongs to a different server revision. Read-only review or discard only; it will not replace newer server values.";
      } else {
        restore.hidden = false;
        status.textContent = fromOtherTab
          ? "A local draft changed in another tab. Review and restore it, or explicitly keep this tab's edits. Server saving is blocked until resolved."
          : "A local draft is available. Review or restore it before editing. Local recovery is not a server save.";
      }
    } catch (error) {
      paused = true;
      if (fromOtherTab) {
        conflict = true;
        keep.hidden = false;
        lock(true);
      }
      status.textContent =
        error instanceof Error
          ? error.message
          : "The stored draft is unreadable.";
    }
  }
  function capture(): EditableDraft {
    const fields = Object.fromEntries(
      Object.keys(draftTextLimits).map((name) => [
        name,
        field(form, name).value,
      ]),
    ) as DraftFields;
    return {
      version: 1,
      kind: "editable",
      baseRevision,
      updatedAt: Date.now(),
      fields,
      variants: rows(form).map((row) => ({
        baselineIndex:
          row.dataset.baselineIndex === undefined
            ? null
            : Number(row.dataset.baselineIndex),
        label: field(row, "label").value,
        price: field(row, "priceMinor").value,
        active: (field(row, "variantActive") as HTMLInputElement).checked,
      })),
    };
  }
  function persist() {
    if (
      !storageAvailable ||
      paused ||
      conflict ||
      !["idle", undefined].includes(form.dataset.phase)
    )
      return;
    try {
      const current = read();
      if (current !== seen) {
        seen = current;
        inspect(current, true);
        return;
      }
      const raw = encodeDraft(capture());
      reserveDraftSlot(localStorage, storageKey!);
      localStorage.setItem(storageKey!, raw);
      seen = raw;
      status.textContent =
        "Editable text saved on this device only. Not saved to the server or published. Clear drafts on shared devices.";
    } catch {
      unavailable();
    }
  }
  function changed() {
    for (const row of rows(form)) {
      const toggle = row.querySelector("[data-workbench-toggle-variant]");
      if (toggle)
        toggle.textContent = (field(row, "variantActive") as HTMLInputElement)
          .checked
          ? "Archive variant"
          : "Restore variant";
    }
    if (paused) return;
    clearTimeout(timer);
    timer = setTimeout(persist, 300);
  }
  function removeStored() {
    clearTimeout(timer);
    try {
      if (storageAvailable && read() !== seen) {
        seen = read();
        inspect(seen, true);
        return false;
      }
      if (storageAvailable) localStorage.removeItem(storageKey!);
      seen = null;
      recoverable = null;
      conflict = paused = false;
      restore.hidden = review.hidden = keep.hidden = true;
      form.querySelector<HTMLElement>("[data-workbench-draft-review]")!.hidden =
        true;
      lock(false);
      return true;
    } catch {
      unavailable();
      return false;
    }
  }
  function restoreBaseline() {
    for (const [name, value] of Object.entries(baselineFields))
      field(form, name).value = value;
    form
      .querySelector("[data-admin-variants]")!
      .replaceChildren(...baselineRows.map((row) => row.cloneNode(true)));
    form.dispatchEvent(new Event("input", { bubbles: true }));
  }
  if (storageKey) {
    try {
      seen = read();
      inspect(seen);
    } catch {
      unavailable();
    }
  }
  restore.addEventListener("click", () => {
    if (
      !recoverable ||
      recoverable.kind !== "editable" ||
      recoverable.baseRevision !== baseRevision
    )
      return;
    try {
      if (read() !== seen) {
        seen = read();
        inspect(seen, true);
        return;
      }
    } catch {
      unavailable();
      return;
    }
    if (
      workbenchFingerprint(form) !== baseline &&
      !window.confirm(
        "Replace this tab's unsaved edits with the stored local draft?",
      )
    )
      return;
    const draft = recoverable;
    // Validate all baseline references before changing even one current field.
    const savedIndexes = draft.variants
      .filter((row) => row.baselineIndex !== null)
      .map((row) => row.baselineIndex);
    if (
      baselineRows.some(
        (row) =>
          row.dataset.baselineIndex !== undefined &&
          !savedIndexes.includes(Number(row.dataset.baselineIndex)),
      ) ||
      savedIndexes.some(
        (index) => !baselineRows[index!]?.hasAttribute("data-baseline-index"),
      )
    ) {
      status.textContent =
        "Stored variant references do not match the server baseline. Read-only review or discard only.";
      restore.hidden = true;
      return;
    }
    for (const [name, value] of Object.entries(draft.fields)) {
      const node = field(form, name);
      if (!(node instanceof HTMLInputElement && node.readOnly))
        node.value = value;
    }
    const list = form.querySelector("[data-admin-variants]")!;
    const template = form.querySelector<HTMLTemplateElement>(
      "[data-admin-variant-template]",
    )!;
    list.replaceChildren(
      ...draft.variants.map((variant) => {
        const row =
          variant.baselineIndex === null
            ? (template.content.firstElementChild!.cloneNode(
                true,
              ) as HTMLElement)
            : (baselineRows[variant.baselineIndex]!.cloneNode(
                true,
              ) as HTMLElement);
        field(row, "label").value = variant.label;
        field(row, "priceMinor").value = variant.price;
        (field(row, "variantActive") as HTMLInputElement).checked =
          variant.active;
        return row;
      }),
    );
    paused = conflict = false;
    lock(false);
    restore.hidden = review.hidden = keep.hidden = true;
    form.dispatchEvent(new Event("input", { bubbles: true }));
    status.textContent =
      "Local editable text restored, not server-saved. New unsaved variant identifiers and SKUs were not stored: re-enter and review them before saving.";
  });
  review.addEventListener("click", () => {
    const panel = form.querySelector<HTMLDetailsElement>(
      "[data-workbench-draft-review]",
    )!;
    panel.hidden = false;
    panel.open = true;
    form.querySelector<HTMLElement>(
      "[data-workbench-draft-text]",
    )!.textContent =
      recoverable?.kind === "editable"
        ? JSON.stringify(
            {
              baseRevision: recoverable.baseRevision,
              fields: recoverable.fields,
              variants: recoverable.variants,
            },
            null,
            2,
          )
        : "This draft could not be decoded safely.";
  });
  clear.addEventListener("click", () => {
    if (
      safety.hidden === false ||
      !window.confirm(
        "Clear the local draft on this device? Server records and this tab's current fields will not change.",
      )
    )
      return;
    if (removeStored())
      status.textContent =
        "Local draft cleared. Current fields remain in this tab; nothing changed on the server.";
  });
  reset.addEventListener("click", () => {
    if (!["idle", undefined].includes(form.dataset.phase) || !safety.hidden)
      return;
    if (
      !window.confirm(
        "Discard this tab's unsaved edits and local draft, and reset to the original server values?",
      )
    )
      return;
    if (storageAvailable && !removeStored()) return;
    restoreBaseline();
    clearTimeout(timer);
    status.textContent =
      "Reset to the server values originally loaded on this page. No server mutation was sent.";
  });
  keep.addEventListener("click", () => {
    if (
      !window.confirm(
        "Replace the other tab's local draft with this tab's edits? This is not a server save.",
      )
    )
      return;
    try {
      const current = read();
      if (current !== seen) {
        seen = current;
        inspect(current, true);
        return;
      }
      conflict = paused = false;
      lock(false);
      restore.hidden = review.hidden = keep.hidden = true;
      persist();
    } catch {
      unavailable();
    }
  });
  resolved.addEventListener("click", () => {
    if (!["idle", undefined].includes(form.dataset.phase)) return;
    if (
      !window.confirm(
        "Have you reviewed the current server record and operation history, and resolved the earlier outcome? Continuing permits a new operation; it must not duplicate the old one.",
      )
    )
      return;
    if (!removeStored()) return;
    safety.hidden = resolved.hidden = true;
    clear.disabled = false;
    status.textContent =
      "You acknowledged reviewing the authoritative outcome. Review the current fields carefully; any further save is a new operation.";
  });
  window.addEventListener("storage", (event) => {
    if (
      !storageKey ||
      event.storageArea !== localStorage ||
      (event.key !== storageKey && event.key !== null)
    )
      return;
    clearTimeout(timer);
    seen = event.newValue;
    inspect(event.newValue, true);
  });
  form.addEventListener(
    "submit",
    (event) => {
      if (storageAvailable) {
        try {
          if (read() !== seen) {
            seen = read();
            inspect(seen, true);
          }
          reserveDraftSlot(localStorage, storageKey!);
        } catch (error) {
          event.preventDefault();
          event.stopImmediatePropagation();
          status.textContent =
            error instanceof Error
              ? error.message
              : "Local recovery could not be verified. Keep this tab open and review storage before saving.";
          return;
        }
      }
      if (form.dataset.workbenchBlocked === "true" || paused) {
        event.preventDefault();
        event.stopImmediatePropagation();
        status.textContent =
          "Review, restore or clear the existing local draft before sending a new server operation.";
        status.focus();
      }
    },
    true,
  );
  form.addEventListener("input", changed);
  form.addEventListener("change", changed);
  form.addEventListener("admin:phase", () => {
    clearTimeout(timer);
    const phase = form.dataset.phase;
    reset.disabled = !["idle", undefined].includes(phase);
    if (phase === "pending" || phase === "uncertain") {
      paused = true;
      clear.disabled = true;
      form.dataset.workbenchSafetyStored = "false";
      if (storageKey)
        try {
          reserveDraftSlot(localStorage, storageKey);
          const raw = encodeDraft({
            version: 1,
            kind: "safety",
            baseRevision,
            updatedAt: Date.now(),
          });
          localStorage.setItem(storageKey, raw);
          seen = raw;
          form.dataset.workbenchSafetyStored = "true";
          status.textContent =
            "Only an unresolved-operation safety marker is stored while the server outcome is unverified. Keep this tab open to retry the same operation.";
        } catch {
          unavailable();
        }
    } else if (phase === "idle" && safety.hidden && !conflict) {
      paused = false;
      clear.disabled = !storageAvailable;
    }
    if (form.dataset.workbenchBlocked === "true") lock(true);
  });
  form.addEventListener("admin:product-receipt", (event) => {
    const receipt = (
      event as CustomEvent<AdminProduct & { action?: string; deleted: boolean }>
    ).detail;
    if (storageKey)
      try {
        // Do not delete another tab's independently updated local text.
        if (read() === seen) {
          localStorage.removeItem(storageKey);
          seen = null;
        }
      } catch {
        unavailable();
      }
    baseRevision = receipt.revision;
    if (
      receipt.variants &&
      !receipt.deleted &&
      receipt.action !== "archive" &&
      receipt.action !== "restore"
    ) {
      for (const row of rows(form)) {
        const index = receipt.variants.findIndex(
          (variant) => field(row, "variantKey").value === variant.key,
        );
        if (index < 0) continue;
        row.dataset.baselineIndex = String(index);
        for (const name of ["variantKey", "sku"])
          (field(row, name) as HTMLInputElement).readOnly = true;
        const remove = row.querySelector<HTMLButtonElement>(
          "[data-workbench-remove-variant]",
        );
        if (remove) {
          remove.removeAttribute("data-workbench-remove-variant");
          remove.setAttribute("data-admin-delete-variant", "");
          remove.className = "admin-danger";
          remove.textContent = "Delete saved variant";
        }
      }
      baselineRows = receipt.variants.map(
        (variant) =>
          rows(form)
            .find((row) => field(row, "variantKey").value === variant.key)!
            .cloneNode(true) as HTMLElement,
      );
      baselineFields = Object.fromEntries(
        Object.keys(draftTextLimits).map((name) => [
          name,
          field(form, name).value,
        ]),
      ) as DraftFields;
    }
    baseline = workbenchFingerprint(form);
    form.dataset.workbenchBaseline = baseline;
    paused = false;
    status.textContent =
      "Verified server receipt received. The local draft was cleared; authoritative refresh remains separate.";
  });
  form.addEventListener("click", (event) => {
    const target = event.target as Element;
    if (
      target.closest("[data-workbench-toggle-variant]") &&
      ["idle", undefined].includes(form.dataset.phase)
    ) {
      const row = target.closest<HTMLElement>("[data-admin-variant]")!;
      const active = field(row, "variantActive") as HTMLInputElement;
      active.checked = !active.checked;
      form.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (
      target.closest("[data-workbench-remove-variant]") &&
      ["idle", undefined].includes(form.dataset.phase)
    ) {
      target.closest("[data-admin-variant]")?.remove();
      form.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  const preview = form.querySelector<HTMLElement>("[data-product-preview]")!;
  const dialog = form.querySelector<HTMLDialogElement>(
    "[data-workbench-dialog]",
  )!;
  const home = document.createComment("Document-flow customer preview");
  preview.before(home);
  form.classList.add("workbench-enhanced");
  const open = form.querySelector<HTMLButtonElement>(
    "[data-workbench-open-preview]",
  )!;
  open.addEventListener("click", () => {
    dialog.querySelector("[data-workbench-dialog-content]")!.append(preview);
    preview.querySelector("details")!.open = true;
    dialog.showModal();
  });
  form
    .querySelector("[data-workbench-close-preview]")!
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    home.after(preview);
    open.focus({ preventScroll: true });
  });
  const mobile = window.matchMedia("(max-width: 760px)");
  mobile.addEventListener("change", () => {
    if (!mobile.matches && dialog.open) dialog.close();
  });
  window.addEventListener("pagehide", persist);
  window.addEventListener("beforeunload", (event) => {
    if (
      ["pending", "uncertain", "conflict"].includes(form.dataset.phase ?? "") ||
      (!storageAvailable && workbenchFingerprint(form) !== baseline)
    )
      event.preventDefault();
  });
}
