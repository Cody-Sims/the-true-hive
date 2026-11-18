import { adminRoute } from "../../../../server/admin/http.ts";
import { updateTeamTask } from "../../../../server/admin/team-board.ts";

export const PUT = adminRoute(
  async (pool, input, context, actor) => ({
    task: await updateTeamTask(
      pool,
      context.params["id"],
      input,
      actor.actorId,
    ),
  }),
  true,
);
