import type { Pool } from "pg";
import { isDeepStrictEqual } from "node:util";
import {
  taskAssignees,
  taskStatuses,
  type TeamTask,
} from "../../domain/team-board.ts";
import { AdminError } from "./errors.ts";

const fields =
  "id, title, assignee, status, priority, epic, board_rank AS rank, revision, detail, archived";
const taskId = /^TH-(?:0[1-9]|[1-9][0-9]|100|[a-f0-9]{32})$/;
const editable = [
  "title",
  "assignee",
  "status",
  "priority",
  "epic",
  "detail",
  "archived",
];
const detailKeys = [
  "scope",
  "acceptance",
  "prerequisites",
  "iteration",
  "pilot",
  "timebox",
  "checklist",
  "phase",
  "size",
];

function invalid(message = "Review the task fields and try again."): never {
  throw new AdminError(400, "INVALID_TASK", message);
}

function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
  return input as Record<string, unknown>;
}

function changes(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const key of editable) {
    if (!Object.hasOwn(input, key)) continue;
    const value = input[key];
    if (key === "title" || key === "epic") {
      const limit = key === "title" ? 160 : 120;
      if (
        typeof value !== "string" ||
        !value.trim() ||
        value.trim().length > limit
      )
        invalid(`Enter a ${key} of 1-${limit} characters.`);
      output[key] = value.trim();
    } else if (key === "status") {
      if (!taskStatuses.some(([status]) => status === value)) invalid();
      output[key] = value;
    } else if (key === "assignee") {
      if (value !== null && !taskAssignees.some(([owner]) => owner === value))
        invalid();
      output[key] = value;
    } else if (key === "priority") {
      if (!["P0", "P1", "P2"].includes(value as string)) invalid();
      output[key] = value;
    } else if (key === "archived") {
      if (typeof value !== "boolean") invalid();
      output[key] = value;
    } else {
      const detail = record(value);
      if (
        Object.entries(detail).some(
          ([name, text]) =>
            !detailKeys.includes(name) ||
            typeof text !== "string" ||
            text.length > 2000,
        ) ||
        Buffer.byteLength(JSON.stringify(detail), "utf8") > 7000
      )
        invalid(
          "Keep task notes within 2,000 characters per field and 7,000 bytes total.",
        );
      output[key] = detail;
    }
  }
  return output;
}

export async function getTeamTasks(pool: Pool): Promise<TeamTask[]> {
  const result = await pool.query<TeamTask>(
    `SELECT ${fields} FROM team_tasks ORDER BY board_rank, id`,
  );
  return result.rows;
}

export async function createTeamTask(
  pool: Pool,
  input: unknown,
  actorId: string,
): Promise<TeamTask> {
  const data = record(input);
  const required = [
    "id",
    "title",
    "assignee",
    "status",
    "priority",
    "epic",
    "detail",
  ];
  if (
    Object.keys(data).length !== required.length ||
    required.some((key) => !Object.hasOwn(data, key)) ||
    typeof data["id"] !== "string" ||
    !/^TH-[a-f0-9]{32}$/.test(data["id"])
  )
    invalid();
  const change = changes(data);
  const result = await pool.query<TeamTask>(
    `INSERT INTO team_tasks (id,title,assignee,status,priority,epic,board_rank,detail,updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,(SELECT COALESCE(MAX(board_rank),0)+1 FROM team_tasks),$7,$8)
     ON CONFLICT (id) DO NOTHING RETURNING ${fields}`,
    [
      data["id"],
      change["title"],
      change["assignee"],
      change["status"],
      change["priority"],
      change["epic"],
      change["detail"],
      actorId,
    ],
  );
  if (result.rows[0]) return result.rows[0];
  const existing = (
    await pool.query<TeamTask>(`SELECT ${fields} FROM team_tasks WHERE id=$1`, [
      data["id"],
    ])
  ).rows[0];
  if (
    existing &&
    !existing.archived &&
    Object.entries(change).every(([key, value]) =>
      isDeepStrictEqual(existing[key as keyof TeamTask], value),
    )
  )
    return existing;
  throw new AdminError(
    409,
    "TASK_CHANGED",
    "This task was already saved. Refresh the board before trying again.",
  );
}

export async function updateTeamTask(
  pool: Pool,
  id: string | undefined,
  input: unknown,
  actorId: string,
): Promise<TeamTask> {
  if (!id || !taskId.test(id))
    throw new AdminError(404, "TASK_NOT_FOUND", "That task was not found.");
  const data = record(input);
  const revision = data["expectedRevision"];
  if (
    Object.keys(data).some(
      (key) => key !== "expectedRevision" && !editable.includes(key),
    ) ||
    Object.keys(data).length < 2 ||
    typeof revision !== "number" ||
    !Number.isInteger(revision) ||
    revision < 1 ||
    revision >= 2147483647
  )
    invalid();
  const change = changes(data);
  const parameters: unknown[] = [id, revision, actorId];
  const setters = Object.entries(change).map(([key, value]) => {
    parameters.push(value);
    return key === "detail"
      ? `detail = detail || $${parameters.length}::jsonb`
      : `${key} = $${parameters.length}`;
  });
  let result;
  try {
    result = await pool.query<TeamTask>(
      `UPDATE team_tasks SET ${setters.join(", ")}, revision = revision + 1,
         updated_at = CURRENT_TIMESTAMP, updated_by = $3
       WHERE id = $1 AND revision = $2 RETURNING ${fields}`,
      parameters,
    );
  } catch (error) {
    const database = error as { code?: string; constraint?: string };
    if (
      database.code === "23514" &&
      database.constraint === "team_tasks_detail_check"
    )
      invalid(
        "The combined task notes are too long. Shorten the notes before saving.",
      );
    throw error;
  }
  const saved = result.rows[0];
  if (!saved)
    throw new AdminError(
      409,
      "TASK_CHANGED",
      "This task changed. Refresh the board before trying again.",
    );
  return saved;
}
