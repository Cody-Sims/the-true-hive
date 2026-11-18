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

export type TaskStatus = (typeof taskStatuses)[number][0];
export type TaskAssignee = (typeof taskAssignees)[number][0];

export interface TeamTask {
  id: string;
  title: string;
  assignee: TaskAssignee | null;
  status: TaskStatus;
  priority: "P0" | "P1" | "P2";
  epic: string;
  rank: number;
  revision: number;
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
  };
}
