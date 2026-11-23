import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import {
  checklistProgress,
  dueDateStatus,
  formatTaskDisplayId,
  isTaskBlocked,
  parseChecklist,
  toggleChecklistLine,
} from "../../src/domain/team-board.ts";
import { updateTeamTask } from "../../src/server/admin/team-board.ts";

test("formatTaskDisplayId preserves short sprint IDs and compacts generated hex IDs", () => {
  assert.equal(formatTaskDisplayId("TH-01"), "TH-01");
  assert.equal(formatTaskDisplayId("TH-100"), "TH-100");
  assert.equal(
    formatTaskDisplayId("TH-9f8e7d6c5b4a39281726354433221100"),
    "TH-9F8E",
  );
});

test("checklist helpers parse plain and markdown lines, compute progress, and toggle items", () => {
  assert.deepEqual(parseChecklist(""), []);
  const items = parseChecklist(
    "Count labels\n- [x] Verify net weight\n[ ] Take shelf photo",
  );
  assert.deepEqual(items, [
    { label: "Count labels", done: false },
    { label: "Verify net weight", done: true },
    { label: "Take shelf photo", done: false },
  ]);
  assert.deepEqual(
    checklistProgress(
      "Count labels\n- [x] Verify net weight\n[ ] Take shelf photo",
    ),
    { done: 1, total: 3 },
  );

  const toggled = toggleChecklistLine(
    "Count labels\n- [x] Verify net weight",
    0,
  );
  assert.equal(toggled, "[x] Count labels\n[x] Verify net weight");
  assert.deepEqual(checklistProgress(toggled), { done: 2, total: 2 });
  assert.equal(
    toggleChecklistLine(toggled, 1),
    "[x] Count labels\n[ ] Verify net weight",
  );
});

test("dueDateStatus flags overdue and upcoming tasks while treating done tasks as completed", () => {
  assert.equal(dueDateStatus(undefined, "doing", "2026-11-22"), null);
  assert.equal(dueDateStatus("", "doing", "2026-11-22"), null);
  assert.equal(dueDateStatus("2026-11-20", "doing", "2026-11-22"), "overdue");
  assert.equal(dueDateStatus("2026-11-20", "done", "2026-11-22"), "done");
  assert.equal(dueDateStatus("2026-11-24", "ready", "2026-11-22"), "soon");
  assert.equal(
    dueDateStatus("2026-12-05", "backlog", "2026-11-22"),
    "scheduled",
  );
});

test("isTaskBlocked identifies waiting lane items and explicit blocker notes", () => {
  assert.equal(isTaskBlocked({ status: "waiting", detail: {} }), true);
  assert.equal(
    isTaskBlocked({
      status: "doing",
      detail: { blocker: "Waiting on soap scale calibration" },
    }),
    true,
  );
  assert.equal(
    isTaskBlocked({ status: "doing", detail: { blocker: "   " } }),
    false,
  );
});

test("updateTeamTask persists board rank, dueDate, and blocker while rejecting invalid values", async () => {
  const queries: { text: string; values: unknown[] }[] = [];
  const fakePool = {
    async query(text: string, values: unknown[]) {
      queries.push({ text, values });
      return {
        rows: [
          {
            id: "TH-01",
            title: "Verify soap weights",
            assignee: "cody",
            status: "doing",
            priority: "P0",
            epic: "Soap shelf",
            rank: 4,
            revision: 2,
            archived: false,
            detail: { dueDate: "2026-11-30", blocker: "Waiting on scale" },
          },
        ],
      };
    },
  } as unknown as Pool;

  const updated = await updateTeamTask(
    fakePool,
    "TH-01",
    {
      expectedRevision: 1,
      rank: 4,
      detail: { dueDate: "2026-11-30", blocker: "Waiting on scale" },
    },
    "operator:cody",
  );
  assert.equal(updated.rank, 4);
  assert.match(queries[0]!.text, /board_rank = \$4/);
  await assert.rejects(
    updateTeamTask(
      fakePool,
      "TH-01",
      { expectedRevision: 1, rank: 0 },
      "operator:cody",
    ),
    { status: 400 },
  );
  await assert.rejects(
    updateTeamTask(
      fakePool,
      "TH-01",
      { expectedRevision: 1, detail: { dueDate: "2026-02-31" } },
      "operator:cody",
    ),
    { status: 400 },
  );
});
