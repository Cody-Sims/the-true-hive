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

    const boardService = await import("../../src/server/admin/team-board.ts");
    const input = {
      id: `TH-${randomUUID().replaceAll("-", "")}`,
      title: "Plan the next soap batch",
      assignee: null,
      status: "backlog",
      priority: "P1",
      epic: "Soap shelf",
      detail: {
        scope: "Check supplies.",
        checklist: "Count oils\nCheck molds",
      },
    };
    const created = await boardService.createTeamTask(
      board,
      input,
      "operator:board",
    );
    assert.equal(created.title, input.title);
    assert.equal(created.revision, 1);
    assert.equal(created.archived, false);
    assert.deepEqual(
      await boardService.createTeamTask(board, input, "operator:board"),
      created,
    );
    const edited = await updateTeamTask(
      board,
      created.id,
      {
        expectedRevision: 1,
        title: "Prepare the next soap batch",
        priority: "P0",
        detail: { acceptance: "Supplies are ready." },
      },
      "operator:other",
    );
    assert.equal(edited.title, "Prepare the next soap batch");
    assert.equal(edited.priority, "P0");
    assert.equal(edited.detail.checklist, input.detail.checklist);
    assert.equal(edited.detail.acceptance, "Supplies are ready.");
    const archived = await updateTeamTask(
      board,
      created.id,
      { expectedRevision: 2, archived: true },
      "operator:board",
    );
    assert.equal(archived.archived, true);
    assert.equal(archived.status, "backlog");
    await assert.rejects(
      updateTeamTask(
        board,
        created.id,
        { expectedRevision: 2, archived: false },
        "operator:other",
      ),
      { status: 409 },
    );
    const restored = await updateTeamTask(
      board,
      created.id,
      { expectedRevision: 3, archived: false },
      "operator:board",
    );
    assert.equal(restored.archived, false);
    assert.equal(restored.detail.checklist, input.detail.checklist);
    assert.equal((await getTeamTasks(board)).length, 2);
    await assert.rejects(
      updateTeamTask(
        board,
        created.id,
        { expectedRevision: 4, title: "   " },
        "operator:board",
      ),
      { status: 400 },
    );
    await assert.rejects(
      boardService.createTeamTask(
        board,
        {
          ...input,
          id: `TH-${randomUUID().replaceAll("-", "")}`,
          detail: { script: "bad" },
        },
        "operator:board",
      ),
      { status: 400 },
    );
    assert.equal((await getTeamTasks(board)).length, 2);
    const operators = await board.query(
      "SELECT updated_by FROM team_tasks WHERE id=$1",
      [created.id],
    );
    assert.equal(operators.rows[0].updated_by, "operator:board");
    await board.query("UPDATE team_tasks SET detail=$2 WHERE id=$1", [
      created.id,
      { pilot: "x".repeat(6500) },
    ]);
    await assert.rejects(
      updateTeamTask(
        board,
        created.id,
        { expectedRevision: 4, detail: { scope: "y".repeat(2000) } },
        "operator:board",
      ),
      { status: 400 },
    );
    const unchanged = (await getTeamTasks(board)).find(
      (task) => task.id === created.id,
    );
    assert.equal(unchanged?.revision, 4);
    assert.equal(unchanged?.detail.pilot?.length, 6500);
  } finally {
    await board.end();
    await owner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await owner.end();
  }
});
