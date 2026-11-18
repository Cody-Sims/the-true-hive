import type { Pool } from "pg";
import {
  taskAssignees,
  taskStatuses,
  type TeamTask,
} from "../../domain/team-board.ts";
import { AdminError } from "./errors.ts";

const fields =
  "id, title, assignee, status, priority, epic, board_rank AS rank, revision, detail";

export async function getTeamTasks(pool: Pool): Promise<TeamTask[]> {
  const result = await pool.query<TeamTask>(
    `SELECT ${fields} FROM team_tasks ORDER BY board_rank, id`,
  );
  return result.rows;
}

export async function updateTeamTask(
  pool: Pool,
  id: string | undefined,
  input: unknown,
  actorId: string,
): Promise<TeamTask> {
  if (!id || !/^TH-(?:0[1-9]|[1-9][0-9]|100)$/.test(id))
    throw new AdminError(404, "TASK_NOT_FOUND", "That task was not found.");
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new AdminError(400, "INVALID_TASK", "Enter a status and assignee.");
  const { status, assignee, expectedRevision } = input as Record<
    string,
    unknown
  >;
  if (
    Object.keys(input).length !== 3 ||
    !taskStatuses.some(([key]) => key === status) ||
    (assignee !== null && !taskAssignees.some(([key]) => key === assignee)) ||
    typeof expectedRevision !== "number" ||
    !Number.isInteger(expectedRevision) ||
    expectedRevision < 1 ||
    expectedRevision >= 2147483647
  )
    throw new AdminError(
      400,
      "INVALID_TASK",
      "Choose a board status and Cody, Logan, or Unassigned.",
    );
  const result = await pool.query<TeamTask>(
    `UPDATE team_tasks
     SET status = $2, assignee = $3, revision = revision + 1,
         updated_at = CURRENT_TIMESTAMP, updated_by = $5
     WHERE id = $1 AND revision = $4
     RETURNING ${fields}`,
    [id, status, assignee, expectedRevision, actorId],
  );
  const saved = result.rows[0];
  if (!saved)
    throw new AdminError(
      409,
      "TASK_CHANGED",
      "This task changed. Reload the board before trying again.",
    );
  return saved;
}
