import {
  taskAssignees,
  taskStatuses,
  type TeamTask,
} from "../domain/team-board.ts";

const names = Object.fromEntries(taskAssignees);
const statuses = Object.fromEntries(taskStatuses);

export function mountTeamBoard(root: HTMLElement, token: string): void {
  const modal = root.querySelector("dialog");
  const edit = modal?.querySelector<HTMLFormElement>("[data-team-edit]");
  const assignee = edit?.querySelector<HTMLSelectElement>('[name="assignee"]');
  const status = edit?.querySelector<HTMLSelectElement>('[name="status"]');
  const submit = edit?.querySelector<HTMLButtonElement>('[type="submit"]');
  const detail = modal?.querySelector("[data-team-detail]");
  const title = modal?.querySelector("[data-team-modal-title]");
  const feedback = root.querySelector<HTMLElement>("[data-team-feedback]");
  const editFeedback = edit?.querySelector("[data-team-edit-feedback]");
  const search = root.querySelector<HTMLInputElement>("[data-team-search]");
  const ownerFilter =
    root.querySelector<HTMLSelectElement>("[data-team-owner]");
  const statusFilter =
    root.querySelector<HTMLSelectElement>("[data-team-status]");
  if (
    !modal ||
    !edit ||
    !assignee ||
    !status ||
    !submit ||
    !detail ||
    !title ||
    !feedback ||
    !editFeedback ||
    !search ||
    !ownerFilter ||
    !statusFilter
  )
    return;

  const cards = [...root.querySelectorAll<HTMLElement>("[data-team-card]")];
  const lanes = [...root.querySelectorAll<HTMLElement>("[data-team-lane]")];
  const saving = new Set<HTMLElement>();
  let active: HTMLElement | null = null;
  let dragged: HTMLElement | null = null;

  function filter() {
    const query = search!.value.trim().toLowerCase();
    const owner = ownerFilter!.value;
    const state = statusFilter!.value;
    for (const card of cards) {
      card.hidden =
        !(card.dataset["search"] ?? "").includes(query) ||
        (!!owner && (card.dataset["assignee"] || "unassigned") !== owner) ||
        (!!state && card.dataset["status"] !== state);
    }
    for (const lane of lanes) {
      lane.hidden = !!state && lane.dataset["teamLane"] !== state;
      const count = lane.querySelector("[data-team-count]");
      if (count)
        count.textContent = String(
          lane.querySelectorAll("[data-team-card]:not([hidden])").length,
        );
    }
    feedback!.textContent = `${cards.filter((card) => !card.hidden).length} of ${cards.length} tasks shown.`;
  }

  async function save(
    card: HTMLElement,
    nextStatus: string,
    nextAssignee: string,
    fromDialog: boolean,
  ) {
    if (saving.has(card)) return;
    const message = fromDialog ? editFeedback! : feedback!;
    if (
      card.dataset["status"] === nextStatus &&
      (card.dataset["assignee"] ?? "") === nextAssignee
    ) {
      if (fromDialog) modal!.close();
      return;
    }
    saving.add(card);
    card.setAttribute("aria-busy", "true");
    if (fromDialog) submit!.disabled = true;
    message.textContent = "Saving…";
    try {
      const response = await fetch(
        `/api/admin/team-tasks/${encodeURIComponent(card.dataset["teamCard"] ?? "")}`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": token,
          },
          body: JSON.stringify({
            expectedRevision: Number(card.dataset["revision"]),
            assignee: nextAssignee || null,
            status: nextStatus,
          }),
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) {
        message.textContent =
          response.status === 409
            ? "Someone changed this task. Reload the board before trying again."
            : response.status === 401 || response.status === 403
              ? "Your session may have expired. Reload and sign in before trying again."
              : "Couldn't save the task. Try again.";
        return;
      }
      const { task } = (await response.json()) as { task: TeamTask };
      const list = lanes
        .find((lane) => lane.dataset["teamLane"] === task.status)
        ?.querySelector("[data-team-list]");
      if (!list || task.id !== card.dataset["teamCard"]) throw new Error();
      const moved = task.status !== card.dataset["status"];
      card.dataset["status"] = task.status;
      card.dataset["assignee"] = task.assignee ?? "";
      card.dataset["revision"] = String(task.revision);
      const owner = card.querySelector("[data-team-assignee]");
      if (owner)
        owner.textContent =
          task.assignee === null
            ? "Unassigned"
            : (names[task.assignee] ?? "Unassigned");
      if (moved) {
        const next = [...list.children].find((item) => {
          if (!(item instanceof HTMLElement)) return false;
          const rankDifference = Number(item.dataset["rank"]) - task.rank;
          return (
            rankDifference > 0 ||
            (rankDifference === 0 && (item.dataset["teamCard"] ?? "") > task.id)
          );
        });
        list.insertBefore(card, next ?? null);
      }
      filter();
      feedback!.textContent = `${task.id} saved: ${statuses[task.status]}, ${task.assignee ? names[task.assignee] : "Unassigned"}.`;
      if (fromDialog && active === card) modal!.close();
    } catch {
      message.textContent =
        "Couldn't confirm the save. Reload to see the current board.";
    } finally {
      saving.delete(card);
      card.removeAttribute("aria-busy");
      if (fromDialog) submit!.disabled = false;
    }
  }

  root.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const trigger = event.target.closest("[data-team-open]");
    const card = trigger?.closest<HTMLElement>("[data-team-card]");
    const notes = card?.querySelector("template");
    if (!card || !notes || saving.has(card)) return;
    active = card;
    title.textContent =
      card.querySelector("[data-team-title]")?.textContent ?? "";
    detail.replaceChildren(notes.content.cloneNode(true));
    editFeedback.textContent = "";
    assignee.value = card.dataset["assignee"] ?? "";
    status.value = card.dataset["status"] ?? "";
    modal.showModal();
    modal.scrollTop = 0;
  });
  modal.addEventListener("close", () => {
    const trigger = active?.hidden
      ? null
      : active?.querySelector<HTMLButtonElement>("[data-team-open]");
    (trigger ?? feedback).focus({ preventScroll: true });
    active = null;
    detail.replaceChildren();
  });
  edit.addEventListener("submit", (event) => {
    event.preventDefault();
    if (active) void save(active, status.value, assignee.value, true);
  });

  root.addEventListener("dragstart", (event) => {
    if (!(event.target instanceof Element) || !event.dataTransfer) return;
    const card = event.target.closest<HTMLElement>("[data-team-card]");
    if (!card || saving.has(card)) return;
    dragged = card;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", card.dataset["teamCard"] ?? "");
  });
  root.addEventListener("dragover", (event) => {
    if (!dragged || !(event.target instanceof Element) || !event.dataTransfer)
      return;
    const lane = event.target.closest<HTMLElement>("[data-team-lane]");
    if (!lane) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    for (const other of lanes)
      other.toggleAttribute("data-over", other === lane);
  });
  function endDrag() {
    dragged = null;
    for (const lane of lanes) lane.removeAttribute("data-over");
  }
  root.addEventListener("dragend", endDrag);
  root.addEventListener("drop", (event) => {
    if (!dragged || !(event.target instanceof Element)) return;
    const lane = event.target.closest<HTMLElement>("[data-team-lane]");
    if (!lane?.dataset["teamLane"]) return;
    event.preventDefault();
    const card = dragged;
    endDrag();
    void save(
      card,
      lane.dataset["teamLane"],
      card.dataset["assignee"] ?? "",
      false,
    );
  });
  search.addEventListener("input", filter);
  ownerFilter.addEventListener("change", filter);
  statusFilter.addEventListener("change", filter);
}
