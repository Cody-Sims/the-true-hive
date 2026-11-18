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
  const trigger = card.getByRole("button");
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
  for (const path of ["/team-sprint", "/api/admin/team-tasks/TH-01"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(503);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(await response.text()).not.toContain("Check a sample label");
  }
});
