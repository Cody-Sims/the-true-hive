import {
  checklistProgress,
  dueDateStatus,
  formatTaskDisplayId,
  isTaskBlocked,
  parseChecklist,
  taskAssignees,
  taskStatuses,
  toggleChecklistLine,
  type TaskStatus,
  type TeamTask,
} from "../domain/team-board.ts";

const names = Object.fromEntries(taskAssignees);
const statuses = Object.fromEntries(taskStatuses);
const priorityOrder: Record<TeamTask["priority"], number> = {
  P0: 0,
  P1: 1,
  P2: 2,
};
const BACKLOG_CAP = 8;
const CHEVRON_NS = "http://www.w3.org/2000/svg";

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
  dueDate: "Target date",
  blocker: "Blocked / waiting on",
};
const editedNotes = [
  "scope",
  "checklist",
  "acceptance",
  "prerequisites",
  "dueDate",
  "blocker",
  "size",
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

function ownerInitial(assignee: TeamTask["assignee"]): string {
  if (!assignee) return "–";
  return (names[assignee] ?? assignee).slice(0, 1).toUpperCase();
}

function formatShortDate(iso?: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function createChevronSvg(): SVGSVGElement {
  const svg = document.createElementNS(CHEVRON_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(CHEVRON_NS, "path");
  path.setAttribute("d", "m4 6 4 4 4-4");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.6");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  return svg;
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
  const extraDetails = root.querySelector<HTMLDetailsElement>(
    "[data-team-extra-details]",
  )!;
  const title = root.querySelector<HTMLElement>("[data-team-modal-title]")!;
  const kicker = root.querySelector<HTMLElement>("[data-team-modal-kicker]");
  const submit = root.querySelector<HTMLButtonElement>("[data-team-submit]")!;
  const archive = root.querySelector<HTMLButtonElement>("[data-team-archive]")!;
  const confirm = root.querySelector<HTMLElement>("[data-team-confirm]")!;
  const search = root.querySelector<HTMLInputElement>("[data-team-search]")!;
  const owner = root.querySelector<HTMLSelectElement>("[data-team-owner]")!;
  const epicFilter = root.querySelector<HTMLSelectElement>("[data-team-epic]");
  const sortSelect = root.querySelector<HTMLSelectElement>("[data-team-sort]");
  const status = root.querySelector<HTMLSelectElement>("[data-team-status]")!;
  const priority = root.querySelector<HTMLSelectElement>(
    "[data-team-priority]",
  )!;
  const view = root.querySelector<HTMLSelectElement>("[data-team-view]")!;
  const groupSelect =
    root.querySelector<HTMLSelectElement>("[data-team-group]");
  const lanesWrap = root.querySelector<HTMLElement>("[data-team-lanes]");
  const listSection = root.querySelector<HTMLElement>("[data-team-list-view]");
  const listGroups = root.querySelector<HTMLElement>("[data-team-list-groups]");
  const backlogMore = root.querySelector<HTMLButtonElement>(
    "[data-team-backlog-more]",
  );
  const epicsDatalist = root.querySelector<HTMLDataListElement>(
    "[data-team-epics-datalist]",
  );
  const resetButton =
    root.querySelector<HTMLButtonElement>("[data-team-reset]")!;
  const newButton = root.querySelector<HTMLButtonElement>("[data-team-new]")!;
  const refresh = root.querySelector<HTMLButtonElement>("[data-team-refresh]")!;
  if (!modal || !edit || !feedback || !submit || !view) return;
  root.dataset["mounted"] = "true";

  const lanes = [...root.querySelectorAll<HTMLElement>("[data-team-lane]")];
  const tasks = new Map<string, TeamTask>();
  const cards = new Map<string, HTMLElement>();
  const todayIso = new Date().toISOString().slice(0, 10);

  let activeId: string | null = null;
  let creationId = "";
  let busy = false;
  let dragged: string | null = null;
  let dropCardId: string | null = null;
  let dropPosition: "before" | "after" | null = null;
  let layoutMode: "board" | "list" = "board";
  let mobileStage: "all" | TaskStatus = "all";
  let backlogExpanded = false;
  let pulseFilter: "" | "sprint" | "doing" | "urgent" | "blocked" = "";

  function field(name: string) {
    return edit.elements.namedItem(name) as
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  }

  function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = "") {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  }

  function compareTasks(a: TeamTask, b: TeamTask): number {
    const mode = sortSelect?.value ?? "rank";
    if (mode === "priority") {
      const diff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (diff !== 0) return diff;
    } else if (mode === "due") {
      const aDue = a.detail.dueDate || "9999-99-99";
      const bDue = b.detail.dueDate || "9999-99-99";
      const diff = aDue.localeCompare(bDue);
      if (diff !== 0) return diff;
    } else if (mode === "title") {
      const diff = a.title.localeCompare(b.title);
      if (diff !== 0) return diff;
    }
    return a.rank - b.rank || a.id.localeCompare(b.id);
  }

  function syncEpics() {
    const epics = [
      ...new Set(
        [...tasks.values()].map((task) => task.epic.trim()).filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b));
    if (epicFilter) {
      const current = epicFilter.value;
      const options = [element("option", "All epics")];
      options[0]!.value = "";
      for (const epic of epics) {
        const option = element("option", epic);
        option.value = epic;
        options.push(option);
      }
      epicFilter.replaceChildren(...options);
      epicFilter.value = epics.includes(current) ? current : "";
    }
    if (epicsDatalist) {
      epicsDatalist.replaceChildren(
        ...epics.map((epic) => {
          const opt = element("option");
          opt.value = epic;
          return opt;
        }),
      );
    }
  }

  function notes(task: TeamTask) {
    const container = element("div");
    container.className = "team-details";
    const metaParts = [task.id, task.priority, task.epic];
    if (task.detail.size) metaParts.push(`Size ${task.detail.size}`);
    if (task.detail.dueDate)
      metaParts.push(`Target ${formatShortDate(task.detail.dueDate)}`);
    const meta = element("p", metaParts.join(" · "));
    meta.className = "team-card-meta";
    container.append(meta);

    if (task.detail.blocker?.trim()) {
      const callout = element("div");
      callout.className = "team-blocker-callout";
      const strong = element("strong", "Blocked / waiting on: ");
      callout.append(strong, document.createTextNode(task.detail.blocker));
      container.append(callout);
    }

    if (task.detail.scope) {
      const section = element("section");
      section.append(
        element("h3", "Description"),
        element("p", task.detail.scope),
      );
      container.append(section);
    }

    const checkItems = parseChecklist(task.detail.checklist);
    if (checkItems.length) {
      const progress = checklistProgress(task.detail.checklist);
      const section = element("section");
      section.append(
        element("h3", `Checklist (${progress.done}/${progress.total})`),
      );
      const list = element("ul");
      list.className = "team-live-checklist";
      checkItems.forEach((item, index) => {
        const li = element("li");
        const label = element("label");
        label.className = `team-live-check${item.done ? " is-done" : ""}`;
        const checkbox = element("input");
        checkbox.type = "checkbox";
        checkbox.checked = item.done;
        checkbox.disabled = !!task.archived;
        checkbox.dataset["teamCheckIndex"] = String(index);
        label.append(checkbox, element("span", item.label));
        li.append(label);
        list.append(li);
      });
      section.append(list);
      container.append(section);
    }

    for (const [key, text] of Object.entries(task.detail)) {
      if (
        !text ||
        ["scope", "checklist", "blocker", "size", "dueDate"].includes(key)
      )
        continue;
      const section = element("section");
      section.append(element("h3", noteLabels[key] ?? key), element("p", text));
      container.append(section);
    }
    return container;
  }

  function createMoveSelect(task: TeamTask, attr: "teamMove" | "listMove") {
    const wrap = element("span");
    wrap.className = "team-select team-select-compact";
    const move = element("select");
    move.dataset[attr] = "";
    move.setAttribute("aria-label", `Move ${task.id}`);
    for (const [key, label] of taskStatuses) {
      const option = element("option", label);
      option.value = key;
      option.selected = key === task.status;
      move.append(option);
    }
    move.value = task.status;
    move.disabled = !!task.archived;
    wrap.append(move, createChevronSvg());
    return wrap;
  }

  function buildCardShell(task: TeamTask): HTMLElement {
    const card = element("li");
    card.className = "team-card";
    const openBtn = element("button");
    openBtn.type = "button";
    openBtn.className = "team-card-button";
    openBtn.dataset["teamOpen"] = "";
    openBtn.setAttribute("aria-haspopup", "dialog");

    const top = element("span");
    top.className = "team-card-top";
    const idPill = element("span");
    idPill.className = "team-id-pill";
    idPill.dataset["teamId"] = "";
    const prioBadge = element("span");
    prioBadge.className = "team-priority-badge";
    prioBadge.dataset["teamPriorityBadge"] = "";
    top.append(idPill, prioBadge);

    const heading = element("strong");
    heading.className = "team-card-title";
    heading.dataset["teamTitle"] = "";

    const signals = element("span");
    signals.className = "team-card-signals";
    signals.dataset["teamSignals"] = "";

    const ownerRow = element("span");
    ownerRow.className = "team-card-owner-row";
    const ownerChip = element("span");
    ownerChip.className = "team-owner-chip";
    const avatar = element("span");
    avatar.className = "team-avatar";
    avatar.setAttribute("aria-hidden", "true");
    const assignee = element("span");
    assignee.dataset["teamAssignee"] = "";
    ownerChip.append(avatar, assignee);
    const openHint = element("span", "Details");
    openHint.className = "team-open-hint";
    openHint.setAttribute("aria-hidden", "true");
    ownerRow.append(ownerChip, openHint);

    openBtn.append(top, heading, signals, ownerRow);

    const actions = element("div");
    actions.className = "team-card-actions";
    const discard = element("button");
    discard.type = "button";
    discard.className = "team-card-discard";
    discard.dataset["teamDiscard"] = "";
    actions.append(createMoveSelect(task, "teamMove"), discard);

    card.append(openBtn, actions, element("template"));
    return card;
  }

  function updateCard(task: TeamTask) {
    let card = cards.get(task.id);
    if (!card) {
      card = buildCardShell(task);
      cards.set(task.id, card);
    }
    tasks.set(task.id, task);
    card.className = "team-card";
    card.dataset["teamCard"] = task.id;
    card.dataset["status"] = task.status;
    card.dataset["priority"] = task.priority;
    card.dataset["assignee"] = task.assignee ?? "";
    card.dataset["revision"] = String(task.revision);
    card.dataset["rank"] = String(task.rank);
    card.dataset["search"] =
      `${task.id} ${formatTaskDisplayId(task.id)} ${task.title} ${task.epic} ${Object.values(task.detail).join(" ")}`.toLowerCase();
    card.draggable = !task.archived;

    const idNode = card.querySelector<HTMLElement>("[data-team-id]");
    if (idNode) {
      idNode.textContent = formatTaskDisplayId(task.id);
      idNode.title = task.id;
    }
    const prioNode = card.querySelector<HTMLElement>(
      "[data-team-priority-badge]",
    );
    if (prioNode) {
      prioNode.textContent = task.priority;
      prioNode.dataset["priority"] = task.priority;
    }
    const top = card.querySelector<HTMLElement>(".team-card-top");
    const existingSize = card.querySelector<HTMLElement>("[data-team-size]");
    if (task.detail.size) {
      const sizeBadge = existingSize ?? element("span");
      sizeBadge.className = "team-size-badge";
      sizeBadge.dataset["teamSize"] = "";
      sizeBadge.textContent = task.detail.size;
      if (!existingSize && top) top.append(sizeBadge);
    } else {
      existingSize?.remove();
    }

    card.querySelector("[data-team-title]")!.textContent = task.title;

    const signals = card.querySelector<HTMLElement>("[data-team-signals]");
    if (signals) {
      const signalNodes: HTMLElement[] = [];
      const epicPill = element("span", task.epic);
      epicPill.className = "team-epic-pill";
      epicPill.dataset["teamEpicPill"] = "";
      signalNodes.push(epicPill);

      if (isTaskBlocked(task)) {
        const blk = element(
          "span",
          task.detail.blocker?.trim() ? "Blocked" : "Waiting",
        );
        blk.className = "team-signal-badge is-blocked";
        signalNodes.push(blk);
      }

      const dueState = dueDateStatus(
        task.detail.dueDate,
        task.status,
        todayIso,
      );
      if (dueState) {
        const due = element(
          "span",
          dueState === "overdue"
            ? `Overdue · ${formatShortDate(task.detail.dueDate)}`
            : `Due ${formatShortDate(task.detail.dueDate)}`,
        );
        due.className = "team-signal-badge";
        due.dataset["dueState"] = dueState;
        signalNodes.push(due);
      }

      const check = checklistProgress(task.detail.checklist);
      if (check.total > 0) {
        const pill = element("span");
        pill.className = "team-signal-badge team-check-pill";
        pill.dataset["teamCheckProgress"] = "";
        const bar = element("span");
        bar.className = "team-check-bar";
        bar.setAttribute("aria-hidden", "true");
        const fill = element("span");
        fill.style.width = `${Math.round((check.done / check.total) * 100)}%`;
        bar.append(fill);
        pill.append(
          bar,
          document.createTextNode(`${check.done}/${check.total}`),
        );
        signalNodes.push(pill);
      }
      signals.replaceChildren(...signalNodes);
    }

    const ownerChip = card.querySelector<HTMLElement>(".team-owner-chip");
    if (ownerChip) ownerChip.dataset["owner"] = task.assignee ?? "unassigned";
    const avatar = card.querySelector<HTMLElement>(
      ".team-owner-chip .team-avatar",
    );
    if (avatar) avatar.textContent = ownerInitial(task.assignee);
    card.querySelector("[data-team-assignee]")!.textContent = task.assignee
      ? (names[task.assignee] ?? "Unassigned")
      : "Unassigned";

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
    if (card.parentElement !== list) list.append(card);
  }

  function updatePulse() {
    const active = [...tasks.values()].filter((task) => !task.archived);
    const inFlight = active.filter(
      (task) => task.status !== "backlog" && task.status !== "done",
    ).length;
    const doing = active.filter((task) => task.status === "doing").length;
    const urgent = active.filter((task) => task.priority === "P0").length;
    const blocked = active.filter((task) => isTaskBlocked(task)).length;
    const done = active.filter((task) => task.status === "done").length;
    const denom = inFlight + done;
    const pct = denom ? Math.round((done / denom) * 100) : 0;

    const setText = (sel: string, val: string) => {
      const el = root.querySelector<HTMLElement>(sel);
      if (el) el.textContent = val;
    };
    setText("[data-pulse-active]", String(inFlight));
    setText("[data-pulse-doing]", String(doing));
    setText(
      "[data-pulse-wip]",
      doing > 4 ? "Above 4-card WIP target" : "Target ≤ 4 active",
    );
    setText("[data-pulse-urgent]", String(urgent));
    setText("[data-pulse-blocked]", String(blocked));
    const doingCard = root.querySelector<HTMLElement>(
      '[data-team-pulse-filter="doing"]',
    );
    doingCard?.classList.toggle("is-wip-high", doing > 4);
    const doneNode = root.querySelector<HTMLElement>("[data-pulse-done]");
    if (doneNode) {
      doneNode.replaceChildren(
        document.createTextNode(`${done} `),
        element("small", `(${pct}%)`),
      );
    }
    const bar = root.querySelector<HTMLElement>("[data-pulse-bar]");
    if (bar) bar.style.width = `${pct}%`;
    setText(
      "[data-pulse-summary]",
      `${done} done of ${denom} sprint ${denom === 1 ? "task" : "tasks"}`,
    );

    for (const btn of root.querySelectorAll<HTMLButtonElement>(
      "[data-team-pulse-filter]",
    )) {
      btn.setAttribute(
        "aria-pressed",
        String(btn.dataset["teamPulseFilter"] === pulseFilter),
      );
    }
  }

  function renderListView(matching: TeamTask[]) {
    if (!listSection || !listGroups) return;
    if (layoutMode !== "list") {
      listGroups.replaceChildren();
      return;
    }
    const groupBy = groupSelect?.value ?? "status";
    const buckets = new Map<string, { label: string; items: TeamTask[] }>();

    if (groupBy === "status") {
      for (const [key, label] of taskStatuses)
        buckets.set(key, { label, items: [] });
      for (const task of matching) buckets.get(task.status)?.items.push(task);
    } else if (groupBy === "priority") {
      for (const [key, label] of [
        ["P0", "P0 · Urgent"],
        ["P1", "P1 · Next"],
        ["P2", "P2 · Later"],
      ] as const)
        buckets.set(key, { label, items: [] });
      for (const task of matching) buckets.get(task.priority)?.items.push(task);
    } else if (groupBy === "assignee") {
      for (const [key, label] of taskAssignees)
        buckets.set(key, { label, items: [] });
      buckets.set("unassigned", { label: "Unassigned", items: [] });
      for (const task of matching)
        buckets.get(task.assignee ?? "unassigned")?.items.push(task);
    } else {
      for (const task of matching) {
        const key = task.epic || "General";
        if (!buckets.has(key)) buckets.set(key, { label: key, items: [] });
        buckets.get(key)!.items.push(task);
      }
    }

    const sections: HTMLElement[] = [];
    for (const { label, items } of buckets.values()) {
      if (!items.length) continue;
      items.sort(compareTasks);
      const group = element("section");
      group.className = "team-list-group";
      const head = element("header");
      head.className = "team-list-group-head";
      const badge = element("span", String(items.length));
      badge.className = "team-lane-count";
      head.append(element("span", label), badge);

      const ul = element("ul");
      ul.className = "team-list-rows";
      for (const task of items) {
        const row = element("li");
        row.className = "team-list-row";
        row.dataset["listTask"] = task.id;

        const openBtn = element("button");
        openBtn.type = "button";
        openBtn.className = "team-list-open";
        openBtn.dataset["listOpen"] = task.id;
        const idPill = element("span", formatTaskDisplayId(task.id));
        idPill.className = "team-id-pill";
        const prio = element("span", task.priority);
        prio.className = "team-priority-badge";
        prio.dataset["priority"] = task.priority;
        const titleEl = element("strong", task.title);
        const epicEl = element("span", task.epic);
        epicEl.className = "team-epic-pill";
        const ownerEl = element("span");
        ownerEl.className = "team-owner-chip";
        ownerEl.dataset["owner"] = task.assignee ?? "unassigned";
        const av = element("span", ownerInitial(task.assignee));
        av.className = "team-avatar";
        av.setAttribute("aria-hidden", "true");
        ownerEl.append(
          av,
          element("span", task.assignee ? names[task.assignee] : "Unassigned"),
        );
        openBtn.append(idPill, prio, titleEl, epicEl, ownerEl);

        const controls = element("div");
        controls.className = "team-list-row-controls";
        const discardBtn = element(
          "button",
          task.archived ? "Restore" : "Discard",
        );
        discardBtn.type = "button";
        discardBtn.className = "team-card-discard";
        discardBtn.dataset["listDiscard"] = task.id;
        controls.append(createMoveSelect(task, "listMove"), discardBtn);

        row.append(openBtn, controls);
        ul.append(row);
      }
      group.append(head, ul);
      sections.push(group);
    }
    listGroups.replaceChildren(...sections);
  }

  function filter() {
    const query = search.value.trim().toLowerCase();
    const archived = view.value === "archived";
    const selectedEpic = epicFilter?.value ?? "";
    const matchingTasks: TeamTask[] = [];
    const matchingByStatus = new Map<string, TeamTask[]>();
    for (const [key] of taskStatuses) matchingByStatus.set(key, []);

    let total = 0;
    for (const [id, card] of cards) {
      const task = tasks.get(id)!;
      if (!!task.archived === archived) total += 1;
      const matchesPulse =
        !pulseFilter ||
        (pulseFilter === "sprint" &&
          task.status !== "backlog" &&
          task.status !== "done") ||
        (pulseFilter === "doing" && task.status === "doing") ||
        (pulseFilter === "urgent" && task.priority === "P0") ||
        (pulseFilter === "blocked" && isTaskBlocked(task));

      const matched =
        !!task.archived === archived &&
        (card.dataset["search"] ?? "").includes(query) &&
        (!owner.value || (task.assignee ?? "unassigned") === owner.value) &&
        (!selectedEpic || task.epic === selectedEpic) &&
        (!status.value || task.status === status.value) &&
        (!priority.value || task.priority === priority.value) &&
        matchesPulse;

      card.dataset["matched"] = matched ? "true" : "false";
      if (matched) {
        matchingTasks.push(task);
        matchingByStatus.get(task.status)?.push(task);
      }
    }

    const isMobileViewport =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 47.99rem)").matches;

    for (const lane of lanes) {
      const laneKey = lane.dataset["teamLane"] as TaskStatus;
      const list = lane.querySelector<HTMLElement>("[data-team-list]")!;
      const laneAllCards = [
        ...list.querySelectorAll<HTMLElement>("[data-team-card]"),
      ];
      laneAllCards.sort((a, b) =>
        compareTasks(
          tasks.get(a.dataset["teamCard"]!)!,
          tasks.get(b.dataset["teamCard"]!)!,
        ),
      );
      for (const card of laneAllCards) list.append(card);

      const matchedInLane = laneAllCards.filter(
        (card) => card.dataset["matched"] === "true",
      );
      const capBacklog =
        laneKey === "backlog" &&
        !backlogExpanded &&
        !status.value &&
        mobileStage !== "backlog";

      for (const card of laneAllCards) {
        if (card.dataset["matched"] !== "true") {
          card.hidden = true;
          continue;
        }
        const idx = matchedInLane.indexOf(card);
        card.hidden = capBacklog && idx >= BACKLOG_CAP;
      }

      lane.hidden =
        (!!status.value && laneKey !== status.value) ||
        (isMobileViewport && mobileStage !== "all" && laneKey !== mobileStage);
      lane.querySelector("[data-team-count]")!.textContent = String(
        matchedInLane.length,
      );
      const mobileCount = root.querySelector<HTMLElement>(
        `[data-mobile-count="${laneKey}"]`,
      );
      if (mobileCount) mobileCount.textContent = String(matchedInLane.length);

      const drop = lane.querySelector<HTMLElement>(".team-drop-note");
      if (drop) drop.hidden = archived;

      if (laneKey === "backlog" && backlogMore) {
        const extra = matchedInLane.length - BACKLOG_CAP;
        backlogMore.hidden = extra <= 0;
        if (extra > 0) {
          backlogMore.textContent = backlogExpanded
            ? `Show top ${BACKLOG_CAP} backlog tasks`
            : `Show all ${matchedInLane.length} backlog tasks (${extra} more)`;
        }
      }
    }

    for (const pill of root.querySelectorAll<HTMLButtonElement>(
      "[data-owner-pill]",
    )) {
      pill.setAttribute(
        "aria-pressed",
        String((pill.dataset["ownerPill"] ?? "") === owner.value),
      );
    }
    for (const tab of root.querySelectorAll<HTMLButtonElement>(
      "[data-team-mobile-tab]",
    )) {
      tab.setAttribute(
        "aria-pressed",
        String(tab.dataset["teamMobileTab"] === mobileStage),
      );
    }
    for (const btn of root.querySelectorAll<HTMLButtonElement>(
      "[data-team-layout]",
    )) {
      btn.setAttribute(
        "aria-pressed",
        String(btn.dataset["teamLayout"] === layoutMode),
      );
    }

    const hasFilters = Boolean(
      query ||
      owner.value ||
      selectedEpic ||
      status.value ||
      priority.value ||
      pulseFilter,
    );
    resetButton.dataset["hasFilters"] = String(hasFilters);

    if (lanesWrap) lanesWrap.hidden = layoutMode !== "board";
    if (listSection) listSection.hidden = layoutMode !== "list";
    const collapsePill = root.querySelector<HTMLElement>(
      "[data-team-lane-collapse]",
    );
    if (collapsePill) collapsePill.hidden = layoutMode !== "board";
    renderListView(matchingTasks);
    updatePulse();

    const shown = matchingTasks.length;
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
  syncEpics();
  filter();

  function syncSizeField(sizeValue?: string) {
    const sizeSelect = field("size") as HTMLSelectElement | null;
    if (!sizeSelect) return;
    for (const extra of sizeSelect.querySelectorAll("[data-custom-size]"))
      extra.remove();
    if (
      sizeValue &&
      ![...sizeSelect.options].some((opt) => opt.value === sizeValue)
    ) {
      const opt = element("option", sizeValue);
      opt.value = sizeValue;
      opt.dataset["customSize"] = "true";
      sizeSelect.append(opt);
    }
    sizeSelect.value = sizeValue ?? "";
  }

  function renderModalKicker(task?: TeamTask) {
    if (!kicker) return;
    if (!task) {
      kicker.hidden = true;
      kicker.replaceChildren();
      return;
    }
    kicker.hidden = false;
    const idPill = element("span", formatTaskDisplayId(task.id));
    idPill.className = "team-id-pill";
    idPill.title = task.id;
    const prio = element("span", task.priority);
    prio.className = "team-priority-badge";
    prio.dataset["priority"] = task.priority;
    const copyBtn = element("button", "Copy ID");
    copyBtn.type = "button";
    copyBtn.className = "team-copy-id";
    copyBtn.dataset["teamCopyId"] = task.id;
    kicker.replaceChildren(idPill, prio, copyBtn);
  }

  function open(
    id: string | null,
    discard = false,
    presetStatus: TaskStatus = "backlog",
  ) {
    if (busy) return;
    activeId = id;
    const task = id ? tasks.get(id)! : undefined;
    creationId = task ? "" : `TH-${crypto.randomUUID().replaceAll("-", "")}`;
    title.textContent = task?.title ?? "New task";
    renderModalKicker(task);
    detail.replaceChildren(...(task ? [notes(task)] : []));
    extraDetails.hidden = !task;
    extraDetails.open = false;
    field("title")!.value = task?.title ?? "";
    field("epic")!.value = task?.epic ?? "General";
    field("priority")!.value = task?.priority ?? "P1";
    field("status")!.value = task?.status ?? presetStatus;
    field("assignee")!.value = task?.assignee ?? "";
    syncSizeField(task?.detail.size);
    for (const key of editedNotes) {
      if (key === "size") continue;
      const control = field(key);
      if (control) control.value = task?.detail[key] ?? "";
    }
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
    if (discard) confirm.querySelector<HTMLButtonElement>("button")!.focus();
    else if (task?.archived) archive.focus();
    else field("title")!.focus();
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
    for (const check of detail.querySelectorAll<HTMLInputElement>(
      "[data-team-check-index]",
    ))
      check.disabled = value || !!(activeId && tasks.get(activeId)?.archived);
    modal.setAttribute("aria-busy", String(value));
  }

  async function save(
    id: string,
    change: Record<string, unknown>,
    fromDialog: boolean,
    create = false,
    closeOnSuccess = fromDialog,
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
      syncEpics();
      filter();
      feedback.textContent =
        "archived" in change
          ? `${task.id} ${task.archived ? "discarded. Restore it from Archived." : "restored to the active board."}`
          : `${task.id} saved: ${statuses[task.status]}, ${task.assignee ? names[task.assignee] : "Unassigned"}.`;
      if (closeOnSuccess) {
        modal.close();
      } else if (activeId === task.id && modal.open) {
        editFeedback.textContent = "";
        detail.replaceChildren(notes(task));
        const checkField = field("checklist");
        if (checkField) checkField.value = task.detail.checklist ?? "";
      }
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

    const copyBtn = event.target.closest<HTMLButtonElement>(
      "[data-team-copy-id]",
    );
    if (copyBtn) {
      const idToCopy = copyBtn.dataset["teamCopyId"] ?? "";
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(idToCopy).then(() => {
          copyBtn.textContent = "Copied";
          setTimeout(() => {
            copyBtn.textContent = "Copy ID";
          }, 1500);
        });
      }
      return;
    }

    const pulseBtn = event.target.closest<HTMLButtonElement>(
      "[data-team-pulse-filter]",
    );
    if (pulseBtn) {
      const next = pulseBtn.dataset["teamPulseFilter"] as typeof pulseFilter;
      pulseFilter = pulseFilter === next ? "" : next;
      filter();
      return;
    }

    const ownerPill =
      event.target.closest<HTMLButtonElement>("[data-owner-pill]");
    if (ownerPill) {
      owner.value = ownerPill.dataset["ownerPill"] ?? "";
      filter();
      return;
    }

    const layoutBtn =
      event.target.closest<HTMLButtonElement>("[data-team-layout]");
    if (layoutBtn) {
      layoutMode =
        layoutBtn.dataset["teamLayout"] === "list" ? "list" : "board";
      filter();
      return;
    }

    const mobileTab = event.target.closest<HTMLButtonElement>(
      "[data-team-mobile-tab]",
    );
    if (mobileTab) {
      mobileStage = (mobileTab.dataset["teamMobileTab"] ?? "all") as
        "all" | TaskStatus;
      filter();
      return;
    }

    const addLaneBtn = event.target.closest<HTMLButtonElement>(
      "[data-team-lane-add]",
    );
    if (addLaneBtn) {
      open(null, false, addLaneBtn.dataset["teamLaneAdd"] as TaskStatus);
      return;
    }

    const collapseBtn = event.target.closest<HTMLButtonElement>(
      "[data-team-lane-collapse]",
    );
    if (collapseBtn) {
      const targetLaneKey =
        collapseBtn.dataset["teamLaneCollapse"] ?? "backlog";
      const lane = root.querySelector<HTMLElement>(
        `[data-team-lane="${targetLaneKey}"]`,
      );
      if (lane) {
        const collapsed = lane.dataset["collapsed"] !== "true";
        lane.dataset["collapsed"] = String(collapsed);
        collapseBtn.setAttribute("aria-expanded", String(!collapsed));
        collapseBtn.setAttribute("aria-pressed", String(collapsed));
        collapseBtn.textContent = collapsed
          ? "Expand Backlog"
          : "Collapse Backlog";
      }
      return;
    }

    const collapsedRail = event.target.closest<HTMLElement>(
      '[data-team-lane][data-collapsed="true"]',
    );
    if (collapsedRail) {
      collapsedRail.dataset["collapsed"] = "false";
      const targetKey = collapsedRail.dataset["teamLane"] ?? "backlog";
      const btn = root.querySelector<HTMLButtonElement>(
        `[data-team-lane-collapse="${targetKey}"]`,
      );
      if (btn) {
        btn.setAttribute("aria-expanded", "true");
        btn.setAttribute("aria-pressed", "false");
        btn.textContent = "Collapse Backlog";
      }
      return;
    }

    if (event.target.closest("[data-team-backlog-more]")) {
      backlogExpanded = !backlogExpanded;
      filter();
      return;
    }

    const listOpen = event.target.closest<HTMLElement>("[data-list-open]");
    if (listOpen?.dataset["listOpen"]) {
      open(listOpen.dataset["listOpen"]);
      return;
    }

    const listDiscard = event.target.closest<HTMLElement>(
      "[data-list-discard]",
    );
    if (listDiscard?.dataset["listDiscard"]) {
      const id = listDiscard.dataset["listDiscard"];
      if (tasks.get(id)?.archived) void save(id, { archived: false }, false);
      else open(id, true);
      return;
    }

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
    const target = event.target;
    if (
      target instanceof HTMLInputElement &&
      target.dataset["teamCheckIndex"] !== undefined &&
      activeId &&
      tasks.has(activeId)
    ) {
      const current = tasks.get(activeId)!;
      const index = Number(target.dataset["teamCheckIndex"]);
      const updatedChecklist = toggleChecklistLine(
        current.detail.checklist,
        index,
      );
      void save(
        activeId,
        { detail: { checklist: updatedChecklist } },
        true,
        false,
        false,
      );
      return;
    }

    if (!(target instanceof HTMLSelectElement)) return;

    if (target.matches("[data-team-move]")) {
      const id =
        target.closest<HTMLElement>("[data-team-card]")!.dataset["teamCard"]!;
      if (busy) target.value = tasks.get(id)!.status;
      else
        void save(
          id,
          { status: target.value, assignee: tasks.get(id)!.assignee },
          false,
        );
      return;
    }

    if (target.matches("[data-list-move]")) {
      const id =
        target.closest<HTMLElement>("[data-list-task]")!.dataset["listTask"]!;
      if (busy) target.value = tasks.get(id)!.status;
      else
        void save(
          id,
          { status: target.value, assignee: tasks.get(id)!.assignee },
          false,
        );
    }
  });

  edit.addEventListener("submit", (event) => {
    event.preventDefault();
    const detailPayload: Record<string, string> = {};
    for (const key of editedNotes) {
      const val = field(key)?.value ?? "";
      if (
        activeId ||
        val !== "" ||
        ["scope", "checklist", "acceptance", "prerequisites"].includes(key)
      ) {
        detailPayload[key] = val;
      }
    }
    const change: Record<string, unknown> = {
      title: field("title")!.value.trim(),
      epic: field("epic")!.value.trim(),
      priority: field("priority")!.value,
      status: field("status")!.value,
      assignee: field("assignee")!.value || null,
      detail: detailPayload,
    };
    if (activeId) {
      const task = tasks.get(activeId)!;
      for (const key of ["title", "epic", "priority"] as const) {
        if (change[key] === task[key]) delete change[key];
      }
      const changedNotes = Object.fromEntries(
        editedNotes
          .filter(
            (key) => (field(key)?.value ?? "") !== (task.detail[key] ?? ""),
          )
          .map((key) => [key, field(key)?.value ?? ""]),
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
      card && !card.hidden && layoutMode === "board"
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
      syncEpics();
      filter();
    } catch {
      feedback.textContent =
        "Couldn't refresh the board. Your current tasks are still shown. Reload if your session expired.";
    } finally {
      setBusy(false);
    }
  });

  search.addEventListener("input", filter);
  for (const select of [
    owner,
    epicFilter,
    sortSelect,
    status,
    priority,
    view,
    groupSelect,
  ])
    select?.addEventListener("change", filter);

  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  ) {
    window.matchMedia("(min-width: 48rem)").addEventListener("change", (mq) => {
      if (mq.matches && mobileStage !== "all") {
        mobileStage = "all";
        filter();
      }
    });
  }

  resetButton.addEventListener("click", () => {
    search.value = "";
    owner.value = status.value = priority.value = "";
    if (epicFilter) epicFilter.value = "";
    pulseFilter = "";
    mobileStage = "all";
    filter();
  });

  function clearDropIndicators() {
    dropCardId = null;
    dropPosition = null;
    for (const card of cards.values()) {
      delete card.dataset["dropPos"];
      delete card.dataset["dragging"];
    }
  }

  root.addEventListener("dragstart", (event) => {
    if (busy || !(event.target instanceof Element) || !event.dataTransfer)
      return;
    const card = event.target.closest<HTMLElement>("[data-team-card]");
    const id = card?.dataset["teamCard"];
    if (!id || tasks.get(id)?.archived) return;
    dragged = id;
    if (card) card.dataset["dragging"] = "true";
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

    const overCard = event.target.closest<HTMLElement>("[data-team-card]");
    for (const card of cards.values()) {
      if (card !== overCard) delete card.dataset["dropPos"];
    }
    if (overCard && overCard.dataset["teamCard"] !== dragged) {
      const rect = overCard.getBoundingClientRect();
      dropPosition =
        event.clientY < rect.top + rect.height / 2 ? "before" : "after";
      dropCardId = overCard.dataset["teamCard"]!;
      overCard.dataset["dropPos"] = dropPosition;
    } else {
      dropCardId = null;
      dropPosition = null;
    }
  });

  function endDrag() {
    dragged = null;
    clearDropIndicators();
    for (const lane of lanes) lane.removeAttribute("data-over");
  }

  root.addEventListener("dragend", endDrag);

  root.addEventListener("drop", (event) => {
    if (!dragged || !(event.target instanceof Element)) return;
    const lane = event.target.closest<HTMLElement>("[data-team-lane]");
    if (!lane?.dataset["teamLane"]) return;
    event.preventDefault();
    const id = dragged;
    const targetCard = dropCardId ? tasks.get(dropCardId) : undefined;
    const pos = dropPosition;
    endDrag();

    const currentTask = tasks.get(id)!;
    const nextStatus = lane.dataset["teamLane"] as TaskStatus;
    const change: Record<string, unknown> = {
      status: nextStatus,
      assignee: currentTask.assignee,
    };
    if (targetCard && targetCard.id !== id && pos) {
      const nextRank =
        pos === "before"
          ? Math.max(1, targetCard.rank - 1)
          : targetCard.rank + 1;
      change["rank"] = nextRank;
    }
    void save(id, change, false);
  });
}
