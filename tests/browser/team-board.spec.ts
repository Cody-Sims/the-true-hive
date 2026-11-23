import { expect, test } from "@playwright/test";
import type { TeamTask } from "../../src/domain/team-board.ts";
import {
  moduleUrl,
  render,
  root,
  styles,
} from "../site/barcode-test-helper.ts";

test("the private board moves cards, assigns a person, and exposes the same controls on a phone", async ({
  page,
}) => {
  let task: TeamTask = {
    id: "TH-01",
    title: "Check a sample label",
    assignee: "logan",
    status: "ready",
    priority: "P0",
    epic: "Fictional example",
    rank: 1,
    revision: 1,
    detail: { scope: "Review the example.", acceptance: "The format agrees." },
  };
  await page.route("**/api/admin/team-tasks/TH-01", async (route) => {
    const request = route.request();
    expect(request.method()).toBe("PUT");
    expect(request.headers()["x-csrf-token"]).toBe("test-token");
    const change = request.postDataJSON();
    expect(change.expectedRevision).toBe(task.revision);
    task = {
      ...task,
      assignee: change.assignee,
      status: change.status,
      revision: task.revision + 1,
    };
    await route.fulfill({ json: { task } });
  });
  await page.route("**/test-team-board", async (route) => {
    const component = "src/components/admin/TeamBoard.astro";
    const html = await render(component, { tasks: [task] });
    const css = styles.get(new URL(component, root).href)?.join("\n");
    await route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css ?? ""}</style>${html}`,
    });
  });
  const module = await moduleUrl(new URL("src/client/team-board.ts", root));
  async function openFixture() {
    await page.goto("/test-team-board");
    await page.addScriptTag({
      type: "module",
      content: `import { mountTeamBoard } from ${JSON.stringify(module)}; mountTeamBoard(document.querySelector("[data-team-board]"), "test-token");`,
    });
  }
  await openFixture();
  const card = page.locator('[data-team-card="TH-01"]');
  await card.dragTo(page.locator('[data-team-lane="doing"] h2'));
  await expect(page.locator('[data-team-lane="doing"]')).toContainText(
    "Check a sample label",
  );
  await expect(page.locator("[data-team-feedback]")).toHaveText(
    "TH-01 saved: Doing, Logan.",
  );

  await page.setViewportSize({ width: 320, height: 600 });
  const trigger = card.locator("[data-team-open]");
  await trigger.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Check a sample label" });
  await expect(dialog.getByText("The format agrees.")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByLabel("Assignee").selectOption("cody");
  await dialog.getByLabel("Status").selectOption("review");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('[data-team-lane="review"]')).toContainText("Cody");
  await openFixture();
  await page.locator("[data-team-owner]").selectOption("logan");
  await expect(card).not.toBeVisible();
  await page.locator("[data-team-owner]").selectOption("cody");
  await expect(card).toBeVisible();
  await page.getByLabel("Find a task").fill("not present");
  await expect(card).not.toBeVisible();
});

test("the private board and mutation endpoint fail closed without an administrator configuration", async ({
  request,
}) => {
  for (const path of [
    "/team-sprint",
    "/api/admin/team-tasks",
    "/api/admin/team-tasks/TH-01",
  ]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(503);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(await response.text()).not.toContain("Check a sample label");
  }
});

test("users can create, edit, discard and restore shared tasks without losing notes", async ({
  page,
}) => {
  let saved: TeamTask | undefined;
  let conflict = false;
  await page.route("**/api/admin/team-tasks{,/*}", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({ json: { tasks: saved ? [saved] : [] } });
      return;
    }
    expect(request.headers()["x-csrf-token"]).toBe("test-token");
    const input = request.postDataJSON();
    if (request.method() === "POST") {
      saved = { ...input, rank: 1, revision: 1, archived: false };
    } else {
      expect(input.expectedRevision).toBe(saved?.revision);
      if (conflict) {
        await route.fulfill({
          status: 409,
          json: { error: { message: "Changed" } },
        });
        return;
      }
      saved = {
        ...saved!,
        ...input,
        detail: { ...saved!.detail, ...input.detail },
        revision: saved!.revision + 1,
      };
    }
    await route.fulfill({ json: { task: saved } });
  });
  await page.route("**/test-team-board", async (route) => {
    const html = await render("src/components/admin/TeamBoard.astro", {
      tasks: saved ? [saved] : [],
    });
    await route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">${html}`,
    });
  });
  const module = await moduleUrl(new URL("src/client/team-board.ts", root));
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/test-team-board");
  await page.addScriptTag({
    type: "module",
    content: `import { mountTeamBoard } from ${JSON.stringify(module)}; mountTeamBoard(document.querySelector("[data-team-board]"), "test-token");`,
  });
  await page.getByRole("button", { name: "New task", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill("Prepare labels");
  await dialog.getByLabel("Epic", { exact: true }).fill("Soap shelf");
  await dialog
    .getByLabel("Description", { exact: true })
    .fill("Check batch names.");
  await dialog
    .getByLabel("Checklist", { exact: true })
    .fill("Count labels\nCheck weights");
  await dialog.getByRole("button", { name: "Create task" }).click();
  await expect(dialog).not.toBeVisible();
  const card = page.locator("[data-team-card]");
  await expect(card).toContainText("Prepare labels");
  await card.locator("[data-team-open]").click();
  await dialog.getByLabel("Title", { exact: true }).fill("Print labels");
  await dialog.getByLabel("Done when", { exact: true }).fill("Weights agree.");
  conflict = true;
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog.locator("[data-team-edit-feedback]")).toContainText(
    "Someone changed",
  );
  await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue(
    "Print labels",
  );
  conflict = false;
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(card).toContainText("Print labels");
  expect(saved?.detail.checklist).toBe("Count labels\nCheck weights");
  await card.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm discard" }).click();
  await expect(page.locator("[data-team-card]:visible")).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "View", exact: true })
    .selectOption("archived");
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.locator("[data-team-card]:visible")).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "View", exact: true })
    .selectOption("active");
  await page.getByRole("button", { name: "Refresh board" }).click();
  await expect(page.locator("[data-team-card]")).toContainText("Print labels");
  expect(saved?.archived).toBe(false);
  expect(saved?.detail.acceptance).toBe("Weights agree.");
  await page
    .getByRole("combobox", { name: "Priority", exact: true })
    .selectOption("P0");
  await expect(card).not.toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(card).toBeVisible();
  await card.locator("[data-team-move]").selectOption("ready");
  await expect(page.locator('[data-team-lane="ready"]')).toContainText(
    "Print labels",
  );
});
