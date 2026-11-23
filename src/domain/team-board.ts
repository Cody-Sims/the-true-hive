export const taskStatuses = [
  ["backlog", "Backlog"],
  ["ready", "Ready"],
  ["doing", "Doing"],
  ["waiting", "Waiting"],
  ["review", "Review"],
  ["done", "Done"],
] as const;

export const taskAssignees = [
  ["cody", "Cody"],
  ["logan", "Logan"],
] as const;

export const taskSizes = ["XS", "S", "M", "L"] as const;

export type TaskStatus = (typeof taskStatuses)[number][0];
export type TaskAssignee = (typeof taskAssignees)[number][0];
export type TaskSize = (typeof taskSizes)[number];

export interface ChecklistItem {
  label: string;
  done: boolean;
}

export type DueDateState = "overdue" | "soon" | "scheduled" | "done" | null;

export interface TeamTask {
  id: string;
  title: string;
  assignee: TaskAssignee | null;
  status: TaskStatus;
  priority: "P0" | "P1" | "P2";
  epic: string;
  rank: number;
  revision: number;
  archived?: boolean;
  detail: {
    scope?: string;
    acceptance?: string;
    prerequisites?: string;
    iteration?: string;
    pilot?: string;
    timebox?: string;
    checklist?: string;
    phase?: string;
    size?: string;
    dueDate?: string;
    blocker?: string;
  };
}

export function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function formatTaskDisplayId(id: string): string {
  const hexMatch = /^TH-([a-f0-9]{32})$/i.exec(id);
  return hexMatch ? `TH-${hexMatch[1]!.slice(0, 4).toUpperCase()}` : id;
}

export function parseChecklist(text?: string): ChecklistItem[] {
  if (!text) return [];
  const items: ChecklistItem[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    const checkMatch = /^(?:[-*•]\s+)?\[([ xX])\]\s*(.+)$/.exec(trimmed);
    if (checkMatch) {
      items.push({
        done: checkMatch[1]!.toLowerCase() === "x",
        label: checkMatch[2]!.trim(),
      });
      continue;
    }
    const bulletMatch = /^(?:[-*•]\s+)(.+)$/.exec(trimmed);
    items.push({
      done: false,
      label: (bulletMatch ? bulletMatch[1]! : trimmed).trim(),
    });
  }
  return items;
}

export function checklistProgress(text?: string): {
  done: number;
  total: number;
} {
  const items = parseChecklist(text);
  return {
    done: items.filter((item) => item.done).length,
    total: items.length,
  };
}

export function toggleChecklistLine(
  text: string | undefined,
  index: number,
): string {
  const items = parseChecklist(text);
  if (index < 0 || index >= items.length) return text ?? "";
  items[index] = {
    ...items[index]!,
    done: !items[index]!.done,
  };
  return items
    .map((item) => `[${item.done ? "x" : " "}] ${item.label}`)
    .join("\n");
}

export function dueDateStatus(
  dueDate: string | undefined,
  status: TaskStatus,
  todayIso: string,
): DueDateState {
  if (!dueDate || !isValidIsoDate(dueDate) || !isValidIsoDate(todayIso))
    return null;
  if (status === "done") return "done";
  if (dueDate < todayIso) return "overdue";
  const [y, m, d] = todayIso.split("-").map(Number);
  const soon = new Date(Date.UTC(y!, m! - 1, d! + 3))
    .toISOString()
    .slice(0, 10);
  return dueDate <= soon ? "soon" : "scheduled";
}

export function isTaskBlocked(
  task: Pick<TeamTask, "status" | "detail">,
): boolean {
  return task.status === "waiting" || Boolean(task.detail.blocker?.trim());
}
