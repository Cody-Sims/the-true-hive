import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { migrateDatabase } from "../../scripts/migrate.mjs";

test("the private board persists assignments and moves without overwriting newer changes", async () => {
  const connectionString = process.env["TEST_DATABASE_URL"];
  assert(connectionString);
  const target = new URL(connectionString);
  assert.equal(target.hostname, "127.0.0.1");
  assert.equal(target.pathname, "/true_hive_test");

  const schema = `team_board_${randomUUID().replaceAll("-", "")}`;
  const owner = new Pool({ connectionString });
  const board = new Pool({
    connectionString,
    options: `-c search_path=${schema}`,
  });
  try {
    await owner.query(`CREATE SCHEMA "${schema}"`);
    await migrateDatabase(board);
    const table = await board.query<{ name: string | null }>(
      "SELECT to_regclass('team_tasks')::text AS name",
    );
    assert.equal(table.rows[0]?.name, "team_tasks");
    await board.query(
      `INSERT INTO team_tasks (id,title,assignee,status,priority,epic,board_rank,detail)
       VALUES ('TH-01','Review a fictional label','logan','ready','P0','Example',1,
       '{"scope":"Review the sample","acceptance":"Check the format"}'::jsonb)`,
    );
    const { getTeamTasks, updateTeamTask } =
      await import("../../src/server/admin/team-board.ts");
    const [before] = await getTeamTasks(board);
    assert.equal(before?.assignee, "logan");
    const change = { expectedRevision: 1, status: "doing", assignee: "cody" };
    const after = await updateTeamTask(
      board,
      "TH-01",
      change,
      "operator:board",
    );
    assert.equal(after.status, "doing");
    assert.equal(after.assignee, "cody");
    assert.equal(after.revision, 2);
    await assert.rejects(
      updateTeamTask(
        board,
        "TH-01",
        { ...change, assignee: "logan" },
        "operator:other",
      ),
      { status: 409 },
    );
    await assert.rejects(
      updateTeamTask(
        board,
        "TH-01",
        { ...change, expectedRevision: 2, assignee: "unknown" },
        "operator:other",
      ),
      { status: 400 },
    );
    const [persisted] = await getTeamTasks(board);
    assert.deepEqual(persisted, after);
    assert.equal(persisted?.detail.acceptance, "Check the format");
  } finally {
    await board.end();
    await owner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await owner.end();
  }
});
