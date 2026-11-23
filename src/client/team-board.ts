import {
  taskAssignees,
  taskStatuses,
  type TeamTask,
} from "../domain/team-board.ts";

const names = Object.fromEntries(taskAssignees);
const statuses = Object.fromEntries(taskStatuses);
const noteLabels: Record<string, string> = {
  scope: "Description",
  acceptance: "Done when",
  prerequisites: "Prerequisites",
  checklist: "Checklist",
  iteration: "Iteration",
  pilot: "Pilot",
  timebox: "Timebox",
  phase: "Phase",
  size: "Size",
};
const editedNotes = [
  "scope",
  "checklist",
  "acceptance",
  "prerequisites",
] as const;

function validTask(value: unknown): value is TeamTask {
  if (!value || typeof value !== "object") return false;
  const task = value as TeamTask;
  return (
    typeof task.id === "string" &&
    typeof task.title === "string" &&
    typeof task.epic === "string" &&
    taskStatuses.some(([key]) => key === task.status) &&
    (task.assignee === null ||
      taskAssignees.some(([key]) => key === task.assignee)) &&
    ["P0", "P1", "P2"].includes(task.priority) &&
    Number.isInteger(task.rank) &&
    Number.isInteger(task.revision) &&
    task.revision > 0 &&
    !!task.detail &&
    typeof task.detail === "object" &&
    !Array.isArray(task.detail) &&
    Object.values(task.detail).every((text) => typeof text === "string") &&
    (task.archived === undefined || typeof task.archived === "boolean")
  );
}

export function mountTeamBoard(root: HTMLElement, token: string): void {
  if (root.dataset["mounted"]) return;
  const modal = root.querySelector<HTMLDialogElement>("dialog")!;
  const edit = root.querySelector<HTMLFormElement>("[data-team-edit]")!;
  const feedback = root.querySelector<HTMLElement>("[data-team-feedback]")!;
  const editFeedback = root.querySelector<HTMLElement>(
    "[data-team-edit-feedback]",
  )!;
  const detail = root.querySelector<HTMLElement>("[data-team-detail]")!;
  const title = root.querySelector<HTMLElement>("[data-team-modal-title]")!;
  const submit = root.querySelector<HTMLButtonElement>("[data-team-submit]")!;
  const archive = root.querySelector<HTMLButtonElement>("[data-team-archive]")!;
  const confirm = root.querySelector<HTMLElement>("[data-team-confirm]")!;
  const search = root.querySelector<HTMLInputElement>("[data-team-search]")!;
  const owner = root.querySelector<HTMLSelectElement>("[data-team-owner]")!;
  const status = root.querySelector<HTMLSelectElement>("[data-team-status]")!;
  const priority = root.querySelector<HTMLSelectElement>(
    "[data-team-priority]",
  )!;
  const view = root.querySelector<HTMLSelectElement>("[data-team-view]")!;
  const newButton = root.querySelector<HTMLButtonElement>("[data-team-new]")!;
  const refresh = root.querySelector<HTMLButtonElement>("[data-team-refresh]")!;
  if (!modal || !edit || !feedback || !submit || !view) return;
  root.dataset["mounted"] = "true";
  const lanes = [...root.querySelectorAll<HTMLElement>("[data-team-lane]")];
  const tasks = new Map<string, TeamTask>();
  const cards = new Map<string, HTMLElement>();
  let activeId: string | null = null;
  let creationId = "";
  let busy = false;
  let dragged: string | null = null;

  function field(name: string) {
    return edit.elements.namedItem(name) as
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  }
  function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = "") {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }
  function notes(task: TeamTask) {
    const container = element("div");
    container.className = "team-details";
    container.append(
      element("p", `${task.id} · ${task.priority} · ${task.epic}`),
    );
    for (const [key, text] of Object.entries(task.detail)) {
      if (!text) continue;
      const section = element("section");
      section.append(element("h3", noteLabels[key] ?? key), element("p", text));
      container.append(section);
    }
    return container;
  }
  function updateCard(task: TeamTask) {
    let card = cards.get(task.id);
    if (!card) {
      card = element("li");
      const open = element("button");
      open.type = "button";
      open.className = "team-card-button";
      open.dataset["teamOpen"] = "";
      open.setAttribute("aria-haspopup", "dialog");
      const meta = element("span");
      meta.className = "team-card-meta";
      meta.dataset["teamMeta"] = "";
      const heading = element("strong");
      heading.dataset["teamTitle"] = "";
      const assignee = element("span");
      assignee.className = "team-card-meta";
      assignee.dataset["teamAssignee"] = "";
      open.append(meta, heading, assignee);
      const actions = element("div");
      actions.className = "team-card-actions";
      const move = element("select");
      move.dataset["teamMove"] = "";
      move.setAttribute("aria-label", `Move ${task.id}`);
      for (const [key, name] of taskStatuses) {
        const option = element("option", name);
        option.value = key;
        move.append(option);
      }
      const discard = element("button");
      discard.type = "button";
      discard.dataset["teamDiscard"] = "";
      actions.append(move, discard);
      card.append(open, actions, element("template"));
      cards.set(task.id, card);
    }
    tasks.set(task.id, task);
    card.dataset["teamCard"] = task.id;
    card.dataset["status"] = task.status;
    card.dataset["assignee"] = task.assignee ?? "";
    card.dataset["revision"] = String(task.revision);
    card.dataset["rank"] = String(task.rank);
    card.dataset["search"] =
      `${task.id} ${task.title} ${task.epic} ${Object.values(task.detail).join(" ")}`.toLowerCase();
    card.draggable = !task.archived;
    card.querySelector("[data-team-title]")!.textContent = task.title;
    card.querySelector("[data-team-assignee]")!.textContent = task.assignee
      ? (names[task.assignee] ?? "Unassigned")
      : "Unassigned";
    const meta =
      card.querySelector("[data-team-meta]") ??
      card.querySelector(".team-card-meta");
    if (meta) meta.textContent = `${task.id} · ${task.priority} · ${task.epic}`;
    const move = card.querySelector<HTMLSelectElement>("[data-team-move]")!;
    move.value = task.status;
    move.disabled = !!task.archived;
    card.querySelector("[data-team-discard]")!.textContent = task.archived
      ? "Restore"
      : "Discard";
    card.querySelector("template")!.content.replaceChildren(notes(task));
    const list = lanes
      .find((lane) => lane.dataset["teamLane"] === task.status)!
      .querySelector("[data-team-list]")!;
    const next = [...list.children].find((item) => {
      if (item === card || !(item instanceof HTMLElement)) return false;
      const difference = Number(item.dataset["rank"]) - task.rank;
      return (
        difference > 0 ||
        (difference === 0 && (item.dataset["teamCard"] ?? "") > task.id)
      );
    });
    list.insertBefore(card, next ?? null);
  }
  function filter() {
    const query = search.value.trim().toLowerCase();
    const archived = view.value === "archived";
    let shown = 0;
    let total = 0;
    for (const [id, card] of cards) {
      const task = tasks.get(id)!;
      if (!!task.archived === archived) total += 1;
      card.hidden =
        !!task.archived !== archived ||
        !(card.dataset["search"] ?? "").includes(query) ||
        (!!owner.value && (task.assignee ?? "unassigned") !== owner.value) ||
        (!!status.value && task.status !== status.value) ||
        (!!priority.value && task.priority !== priority.value);
      if (!card.hidden) shown += 1;
    }
    for (const lane of lanes) {
      lane.hidden = !!status.value && lane.dataset["teamLane"] !== status.value;
      lane.querySelector("[data-team-count]")!.textContent = String(
        lane.querySelectorAll("[data-team-card]:not([hidden])").length,
      );
      const drop = lane.querySelector<HTMLElement>(".team-drop-note");
      if (drop) drop.hidden = archived;
    }
    feedback.textContent = `${shown} of ${total} ${archived ? "archived " : ""}tasks shown.`;
    const empty = root.querySelector<HTMLElement>("[data-team-empty]")!;
    empty.hidden = shown > 0;
    empty.textContent = total
      ? "No tasks match these filters. Clear filters to see more."
      : archived
        ? "No discarded tasks. Discarded tasks appear here for restoration."
        : "No tasks yet. Create your first task.";
  }
  for (const card of root.querySelectorAll<HTMLElement>("[data-team-card]")) {
    const task = JSON.parse(card.dataset["task"]!) as TeamTask;
    cards.set(task.id, card);
    updateCard(task);
  }
  filter();

  function open(id: string | null, discard = false) {
    if (busy) return;
    activeId = id;
    const task = id ? tasks.get(id)! : undefined;
    creationId = task ? "" : `TH-${crypto.randomUUID().replaceAll("-", "")}`;
    title.textContent = task?.title ?? "New task";
    detail.replaceChildren(...(task ? [notes(task)] : []));
    field("title").value = task?.title ?? "";
    field("epic").value = task?.epic ?? "General";
    field("priority").value = task?.priority ?? "P1";
    field("status").value = task?.status ?? "backlog";
    field("assignee").value = task?.assignee ?? "";
    for (const key of editedNotes) field(key).value = task?.detail[key] ?? "";
    for (const input of edit.querySelectorAll("input, select, textarea"))
      (input as HTMLInputElement).disabled = !!task?.archived;
    submit.hidden = !!task?.archived;
    submit.textContent = task ? "Save changes" : "Create task";
    archive.hidden = !task;
    archive.textContent = task?.archived ? "Restore task" : "Discard task";
    confirm.hidden = !discard;
    editFeedback.textContent = "";
    modal.showModal();
    modal.scrollTop = 0;
    if (!task) field("title").focus();
    else if (discard)
      confirm.querySelector<HTMLButtonElement>("button")!.focus();
  }
  function setBusy(value: boolean) {
    busy = value;
    newButton.disabled = value;
    refresh.disabled = value;
    for (const button of edit.querySelectorAll("button"))
      button.disabled = value;
    modal.querySelector<HTMLButtonElement>(".team-close")!.disabled = value;
    for (const input of edit.querySelectorAll("input, select, textarea"))
      (input as HTMLInputElement).disabled =
        value || !!(activeId && tasks.get(activeId)?.archived);
    modal.setAttribute("aria-busy", String(value));
  }
  async function save(
    id: string,
    change: Record<string, unknown>,
    fromDialog: boolean,
    create = false,
  ) {
    if (busy) return;
    const message = fromDialog ? editFeedback : feedback;
    setBusy(true);
    message.textContent = "Saving...";
    try {
      const response = await fetch(
        create
          ? "/api/admin/team-tasks"
          : `/api/admin/team-tasks/${encodeURIComponent(id)}`,
        {
          method: create ? "POST" : "PUT",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": token,
          },
          body: JSON.stringify(
            create
              ? { id, ...change }
              : { expectedRevision: tasks.get(id)!.revision, ...change },
          ),
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) {
        message.textContent =
          response.status === 409
            ? "Someone changed this task. Close this dialog and refresh the board before trying again."
            : response.status === 401 || response.status === 403
              ? "Your session may have expired. Reload and sign in before trying again."
              : response.status === 400
                ? "Review the fields: a title and epic are required; keep notes within the displayed limits."
                : "Couldn't save the task. Try again.";
        return;
      }
      const { task } = (await response.json()) as { task: TeamTask };
      if (!validTask(task) || task.id !== id) throw new Error();
      updateCard(task);
      filter();
      feedback.textContent =
        "archived" in change
          ? `${task.id} ${task.archived ? "discarded. Restore it from Archived." : "restored to the active board."}`
          : `${task.id} saved: ${statuses[task.status]}, ${task.assignee ? names[task.assignee] : "Unassigned"}.`;
      if (fromDialog) modal.close();
    } catch {
      message.textContent =
        "Couldn't confirm the save. Refresh the board to see the current task; your entered fields are still here.";
    } finally {
      setBusy(false);
      const card = cards.get(id);
      const move = card?.querySelector<HTMLSelectElement>("[data-team-move]");
      if (move && tasks.has(id)) move.value = tasks.get(id)!.status;
    }
  }
  root.addEventListener("click", (event) => {
    if (!(event.target instanceof Element) || busy) return;
    const card = event.target.closest<HTMLElement>("[data-team-card]");
    const id = card?.dataset["teamCard"];
    if (!id) return;
    if (event.target.closest("[data-team-open]")) open(id);
    if (event.target.closest("[data-team-discard]")) {
      if (tasks.get(id)!.archived) void save(id, { archived: false }, false);
      else open(id, true);
    }
  });
  root.addEventListener("change", (event) => {
    if (
      !(event.target instanceof HTMLSelectElement) ||
      !event.target.matches("[data-team-move]")
    )
      return;
    const id =
      event.target.closest<HTMLElement>("[data-team-card]")!.dataset[
        "teamCard"
      ]!;
    if (busy) event.target.value = tasks.get(id)!.status;
    else
      void save(
        id,
        { status: event.target.value, assignee: tasks.get(id)!.assignee },
        false,
      );
  });
  edit.addEventListener("submit", (event) => {
    event.preventDefault();
    const change: Record<string, unknown> = {
      title: field("title").value.trim(),
      epic: field("epic").value.trim(),
      priority: field("priority").value,
      status: field("status").value,
      assignee: field("assignee").value || null,
      detail: Object.fromEntries(
        editedNotes.map((key) => [key, field(key).value]),
      ),
    };
    if (activeId) {
      const task = tasks.get(activeId)!;
      for (const key of ["title", "epic", "priority"] as const) {
        if (change[key] === task[key]) delete change[key];
      }
      const changedNotes = Object.fromEntries(
        editedNotes
          .filter((key) => field(key).value !== (task.detail[key] ?? ""))
          .map((key) => [key, field(key).value]),
      );
      if (Object.keys(changedNotes).length) change["detail"] = changedNotes;
      else delete change["detail"];
    }
    if (edit.reportValidity())
      void save(activeId ?? creationId, change, true, !activeId);
  });
  archive.addEventListener("click", () => {
    if (!activeId) return;
    if (tasks.get(activeId)!.archived)
      void save(activeId, { archived: false }, true);
    else confirm.hidden = false;
  });
  root
    .querySelector("[data-team-confirm-discard]")!
    .addEventListener("click", () => {
      if (activeId) void save(activeId, { archived: true }, true);
    });
  root
    .querySelector("[data-team-cancel-discard]")!
    .addEventListener("click", () => {
      confirm.hidden = true;
    });
  newButton.addEventListener("click", () => open(null));
  modal.addEventListener("cancel", (event) => {
    if (busy) event.preventDefault();
  });
  modal.addEventListener("close", () => {
    const card = activeId ? cards.get(activeId) : undefined;
    const trigger =
      card && !card.hidden
        ? card.querySelector<HTMLButtonElement>("[data-team-open]")
        : newButton;
    (trigger ?? feedback).focus({ preventScroll: true });
    activeId = null;
    detail.replaceChildren();
  });
  refresh.addEventListener("click", async () => {
    if (busy) return;
    setBusy(true);
    feedback.textContent = "Refreshing...";
    try {
      const response = await fetch("/api/admin/team-tasks", {
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error();
      const result = (await response.json()) as { tasks: TeamTask[] };
      if (
        !Array.isArray(result.tasks) ||
        !result.tasks.every(validTask) ||
        new Set(result.tasks.map((task) => task.id)).size !==
          result.tasks.length
      )
        throw new Error();
      for (const card of cards.values()) card.remove();
      cards.clear();
      tasks.clear();
      for (const task of result.tasks) updateCard(task);
      filter();
    } catch {
      feedback.textContent =
        "Couldn't refresh the board. Your current tasks are still shown. Reload if your session expired.";
    } finally {
      setBusy(false);
    }
  });
  search.addEventListener("input", filter);
  for (const select of [owner, status, priority, view])
    select.addEventListener("change", filter);
  root.querySelector("[data-team-reset]")!.addEventListener("click", () => {
    search.value = "";
    owner.value = status.value = priority.value = "";
    filter();
  });
  root.addEventListener("dragstart", (event) => {
    if (busy || !(event.target instanceof Element) || !event.dataTransfer)
      return;
    const id =
      event.target.closest<HTMLElement>("[data-team-card]")?.dataset[
        "teamCard"
      ];
    if (!id || tasks.get(id)?.archived) return;
    dragged = id;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
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
    const id = dragged;
    endDrag();
    void save(
      id,
      { status: lane.dataset["teamLane"], assignee: tasks.get(id)!.assignee },
      false,
    );
  });
}
