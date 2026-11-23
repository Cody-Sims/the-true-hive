import { adminRoute } from "../../../../server/admin/http.ts";
import {
  createTeamTask,
  getTeamTasks,
} from "../../../../server/admin/team-board.ts";

export const GET = adminRoute(async (pool) => ({
  tasks: await getTeamTasks(pool),
}));

export const POST = adminRoute(
  async (pool, input, _context, actor) => ({
    task: await createTeamTask(pool, input, actor.actorId),
  }),
  true,
  true,
);
