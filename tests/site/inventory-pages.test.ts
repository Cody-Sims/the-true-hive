import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { transform } from "@astrojs/compiler-rs";
import { parse } from "es-module-lexer";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import type { Browser, Page } from "@playwright/test";
import type { AdminMovement, AdminOrder } from "../../src/domain/admin.ts";
import type { TeamTask } from "../../src/domain/team-board.ts";

const root = new URL("../../", import.meta.url);
const origin = "https://inventory.example.invalid";
const styles = new Map<string, string[]>();
const order: AdminOrder = {
  id: "33333333-3333-4333-8333-333333333333",
  state: "paid",
  locationKey: "fixture-stock",
  totalMinor: 1250,
  currency: "USD",
  revision: 4,
  createdAt: "2026-11-18T10:00:00Z",
  paidAt: "2026-11-18T10:05:00Z",
  pickedUpAt: null,
  reconciliationReason: null,
  lines: [
    {
      variantKey: "fixture-variant",
      title: "Synthetic merchandise",
      label: "Fixture size",
      quantity: 2,
      priceMinor: 625,
    },
  ],
};
const movement: AdminMovement = {
  operationId: "fixture-operation",
  variantKey: "fixture-variant",
  locationKey: "fixture-stock",
  delta: -2,
  actorId: `fixture-${"a".repeat(160)}`,
  reason: '<img src="invalid" onerror="alert(1)"> Count correction',
  beforeOnHand: 12,
  onHand: 10,
  createdAt: "2026-11-18T10:00:00Z",
};
const task: TeamTask = {
  id: "FIXTURE-1",
  title: "Synthetic shared task",
  assignee: null,
  status: "ready",
  priority: "P1",
  epic: "Fixture epic",
  rank: 1,
  revision: 3,
  detail: {
    scope: "Synthetic task details, not imported planning data.",
    acceptance: "Review the saved record.",
  },
};

interface Fixture {
  unavailable?: boolean;
  orders?: AdminOrder[];
  movements?: AdminMovement[];
  total?: number;
  tasks?: TeamTask[];
}
async function moduleUrl(
  file: URL,
  fixture: Fixture,
  cache = new Map<string, Promise<string>>(),
): Promise<string> {
  const cached = cache.get(file.href);
  if (cached) return cached;
  const pending = (async () => {
    const inline = (code: string) =>
      `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
    const result = (value: unknown) =>
      fixture.unavailable
        ? 'throw new Error("Synthetic unavailable response")'
        : `return ${JSON.stringify(value)}`;
    if (file.pathname.endsWith("/server/admin/pool.ts"))
      return inline("export const getAdminPool = () => ({});");
    if (file.pathname.endsWith("/server/commerce/orders.ts"))
      return inline(
        `export async function listAdminOrders(){${result({ orders: fixture.orders ?? [order], total: fixture.total ?? fixture.orders?.length ?? 1 })}}`,
      );
    if (file.pathname.endsWith("/server/admin/catalog.ts"))
      return inline(
        `export async function listAdminHistory(){${result(fixture.movements ?? [movement])}}`,
      );
    if (file.pathname.endsWith("/server/admin/store.ts"))
      return inline(
        `export async function getAdminStoreSettings(){${result({ purchasesEnabled: false, revision: 7 })}}`,
      );
    if (file.pathname.endsWith("/server/commerce/config.ts"))
      return inline(
        "export const getCheckoutPresentation = () => ({enabled:false});",
      );
    if (file.pathname.endsWith("/server/admin/team-board.ts"))
      return inline(
        `export async function getTeamTasks(){${result(fixture.tasks ?? [task])}}`,
      );
    const source = await readFile(file, "utf8");
    let code: string;
    if (file.pathname.endsWith(".astro")) {
      const compiled = transform(source, {
        filename: file.pathname,
        internalURL: "astro/compiler-runtime",
        resolvePath: (specifier) => specifier,
      });
      styles.set(file.href, compiled.css);
      code = compiled.code;
    } else {
      code = stripTypeScriptTypes(source, { mode: "transform" });
    }
    const [imports] = parse(code);
    for (const item of [...imports].reverse()) {
      if (!item.specifier) continue;
      const resolved = item.specifier.endsWith(".css")
        ? "data:text/javascript,export default {}"
        : item.specifier.startsWith(".")
          ? await moduleUrl(new URL(item.specifier, file), fixture, cache)
          : import.meta.resolve(item.specifier);
      code = code.slice(0, item.start) + resolved + code.slice(item.end);
    }
    return inline(code);
  })();
  cache.set(file.href, pending);
  return pending;
}

async function render(
  path: string,
  props: Record<string, unknown> = {},
  fixture: Fixture = {},
  url = path.startsWith("pages/")
    ? `/${path.slice(6).replace(/\/index$/, "")}`
    : "/inventory/orders",
  authorized = true,
) {
  const component = await import(
    await moduleUrl(new URL(`src/${path}.astro`, root), fixture)
  );
  const container = await AstroContainer.create();
  return container.renderToResponse(component.default, {
    props,
    request: new Request(new URL(url, origin)),
    locals: authorized
      ? {
          nonce: "fixture-nonce",
          admin: { uid: "fixture-uid", actorId: "fixture-actor" },
          csrfToken: "fixture-csrf",
        }
      : { nonce: "fixture-nonce" },
  });
}

test("order workspaces separate immutable merchandise from paid-only physical collection", async () => {
  const paid = await (
    await render("components/admin/OrderView", { order })
  ).text();
  assert.match(paid, /aria-label="Physical collection"/);
  assert.match(paid, /Immutable merchandise snapshots/);
  assert.match(paid, /name="confirmedPickup"[^>]*required/);
  assert.doesNotMatch(paid, /name="confirmedPickup"[^>]*checked/);
  assert.match(
    paid,
    /data-endpoint="\/api\/admin\/orders\/33333333-3333-4333-8333-333333333333\/pickup"/,
  );
  assert.match(paid, /name="expectedRevision"[^>]*value="4"/);
  assert.match(paid, /data-admin-retry/);
  assert.match(paid, /href="\/inventory\/pickups"/);
  for (const state of [
    "open",
    "picked_up",
    "reconciliation_required",
  ] as const) {
    const html = await (
      await render("components/admin/OrderView", {
        order: { ...order, state },
      })
    ).text();
    assert.doesNotMatch(html, /data-admin-form="pickup"/);
    assert.match(html, /only after the server confirms payment/);
  }
});

test("orders and history show page-bounded records, retain filters and distinguish unavailable from empty", async () => {
  const orders = await (
    await render("pages/inventory/orders/index", {}, { total: 41 })
  ).text();
  assert.match(orders, /1\s+order on this page/);
  assert.match(orders, /1–20 of 41/);
  assert.match(orders, /href="\/inventory\/orders\/33333333/);
  const history = await (
    await render(
      "pages/inventory/history/index",
      {},
      { movements: Array.from({ length: 20 }, () => movement) },
      "/inventory/history?variantKey=fixture-variant&locationKey=fixture-stock&offset=20",
    )
  ).text();
  assert.match(history, /20\s+movements on this page/);
  assert.equal(
    history.match(/href="[^"]*offset=40[^"]*"/)?.[0],
    'href="/inventory/history?offset=40&amp;variantKey=fixture-variant&amp;locationKey=fixture-stock"',
  );
  assert.match(history, /&lt;img/);
  assert.doesNotMatch(history, /<img|data-admin-form=/);
  for (const path of [
    "pages/inventory/orders/index",
    "pages/inventory/history/index",
    "pages/inventory/store",
    "pages/team-sprint",
  ]) {
    const denied = await render(path, {}, {}, "/inventory/orders", false);
    assert.equal(denied.status, 403);
    const unavailable = await render(path, {}, { unavailable: true });
    assert.equal(unavailable.status, 503);
    const html = await unavailable.text();
    assert.match(html, /temporarily unavailable/);
    assert.doesNotMatch(html, /0 (?:orders|movements) on this page/);
  }
  const empty = await (
    await render("pages/inventory/orders/index", {}, { orders: [], total: 0 })
  ).text();
  assert.match(empty, /No test orders yet/);
  assert.doesNotMatch(empty, /temporarily unavailable/);
  const emptyHistory = await (
    await render("pages/inventory/history/index", {}, { movements: [] })
  ).text();
  assert.match(emptyHistory, /No movements match this view/);
});

test("store controls expose saved state separately and route hours setup to Locations", async () => {
  const html = await (
    await render("pages/inventory/store", {}, {}, "/inventory/store")
  ).text();
  assert.match(html, /aria-label="Saved checkout setting"/);
  assert.match(html, /data-store-status[^>]*>[\s\S]*?New checkouts paused/);
  assert.match(html, /name="purchasesEnabled"/);
  assert.match(html, /name="expectedRevision"[^>]*value="7"/);
  assert.match(html, /cannot enable payments by itself/);
  assert.match(html, /Existing orders, stock holds and payment processing/);
  assert.match(html, /href="\/inventory\/locations"/);
  assert.match(html, /href="\/inventory\/pickups"/);
  assert.doesNotMatch(html, /data-admin-form="pickup"/);
});

test("the shared board groups its filters and keeps saved task details and empty state", async () => {
  const html = await (await render("pages/team-sprint")).text();
  assert.match(html, /aria-label="Task filters"/);
  assert.match(html, /data-team-search/);
  assert.match(html, /data-team-owner/);
  assert.match(html, /data-team-status/);
  assert.match(html, /draggable="true"/);
  assert.match(html, /data-team-card="FIXTURE-1"/);
  assert.match(html, /Synthetic task details/);
  const empty = await (
    await render("pages/team-sprint", {}, { tasks: [] })
  ).text();
  assert.match(empty, /No tasks have been imported yet/);
  assert.doesNotMatch(empty, /data-team-card=/);
});

let browser: Browser;
const originalTmpDir = process.env["TMPDIR"];
const domTest =
  process.env["INVENTORY_UI_BROWSER_TESTS"] === "1" ? test : test.skip;
test.before(async () => {
  if (process.env["INVENTORY_UI_BROWSER_TESTS"] !== "1") return;
  process.env["TMPDIR"] = root.pathname;
  const { chromium } = await import("@playwright/test");
  browser = await chromium.launch({
    env: { ...process.env, TMPDIR: root.pathname },
    timeout: 10000,
  });
});
test.after(async () => {
  await browser?.close();
  if (originalTmpDir === undefined) delete process.env["TMPDIR"];
  else process.env["TMPDIR"] = originalTmpDir;
});

type Handler = (
  path: string,
  method: string,
  body: string | null,
) => { status?: number; body: unknown };
async function open(page: Page, html: string, handler?: Handler) {
  page.setDefaultTimeout(5000);
  const css = (
    await Promise.all(
      ["admin.css", "inventory-pages.css"].map((file) =>
        readFile(new URL(`src/styles/${file}`, root), "utf8"),
      ),
    )
  ).join("\n");
  await page.route(`${origin}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith(".ts")) {
      return route.fulfill({
        contentType: "text/javascript",
        body: stripTypeScriptTypes(
          await readFile(new URL(path.slice(1), root), "utf8"),
          { mode: "transform" },
        ),
      });
    }
    if (path.startsWith("/api/")) {
      assert.ok(handler, `Unexpected request: ${path}`);
      if (request.method() !== "GET")
        assert.equal(request.headers()["x-csrf-token"], "fixture-csrf");
      const response = handler(path, request.method(), request.postData());
      return route.fulfill({
        status: response.status ?? 200,
        contentType: "application/json",
        body: JSON.stringify(response.body),
      });
    }
    const shell = /<html\b/i.test(html);
    const content = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
    const head = `<style>${css}\n${[...styles.values()].flat().join("\n")}</style>`;
    const scripts = `<script type="module">import "/src/client/admin.ts";import "/src/client/inventory-nav.ts";import {mountTeamBoard} from "/src/client/team-board.ts";const board=document.querySelector("[data-team-board]");if(board)mountTeamBoard(board,"fixture-csrf");window.fixtureReady=true;</script>`;
    return route.fulfill({
      contentType: "text/html",
      body: shell
        ? `<!doctype html>${content
            .replace("</head>", `${head}</head>`)
            .replace("</body>", `${scripts}</body>`)}`
        : `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="csrf-token" content="fixture-csrf">${head}</head><body><main class="admin-wrap">${content}</main>${scripts}</body></html>`,
    });
  });
  await page.goto(`${origin}/fixture`);
  await page.waitForFunction(
    () => (window as Window & { fixtureReady?: boolean }).fixtureReady,
  );
}

domTest(
  "native records reflow without horizontal or nested form scrolling at mobile and desktop widths",
  { timeout: 20000 },
  async () => {
    const page = await browser.newPage();
    try {
      for (const [name, path, props] of [
        ["orders", "pages/inventory/orders/index", {}],
        ["order", "components/admin/OrderView", { order }],
        ["history", "pages/inventory/history/index", {}],
        ["store", "pages/inventory/store", {}],
        ["team", "pages/team-sprint", {}],
      ] as const) {
        const html = await (await render(path, props)).text();
        await page.unrouteAll();
        await open(page, html);
        if (name === "store") {
          const toggle = page.getByRole("checkbox", {
            name: "Allow new checkouts",
          });
          await toggle.check();
          assert.equal(
            (await page.locator("[data-store-status]").innerText()).trim(),
            "New checkouts paused",
          );
          await toggle.uncheck();
        }
        for (const width of [320, 360, 390, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          const layout = await page.evaluate(() => ({
            viewport: window.innerWidth,
            width: document.documentElement.scrollWidth,
            nested: [
              ...document.querySelectorAll("main form, main fieldset"),
            ].filter(
              (element) =>
                element.scrollHeight > element.clientHeight + 1 &&
                /auto|scroll/.test(getComputedStyle(element).overflowY),
            ).length,
          }));
          assert.ok(
            layout.width <= layout.viewport + 1,
            `${name} overflows at ${width}: ${JSON.stringify(layout)}`,
          );
          assert.equal(layout.nested, 0, `${name} has a nested form scrollbar`);
          const smallControls = await page
            .locator(
              'main button, main select, main input:not([type="hidden"]):not([type="checkbox"])',
            )
            .evaluateAll((controls) =>
              controls
                .filter(
                  (control) =>
                    control.getClientRects().length &&
                    control.getBoundingClientRect().height < 44,
                )
                .map((control) => control.outerHTML),
            );
          assert.deepEqual(smallControls, [], `${name} has small controls`);
          const target = process.env["INVENTORY_UI_SCREENSHOT_DIR"];
          if (target && (width === 390 || width === 1280)) {
            await mkdir(target, { recursive: true });
            await page.screenshot({
              path: `${target}/native-inventory-${name}-${width}.png`,
              fullPage: true,
            });
          }
        }
      }
    } finally {
      await page.close();
    }
  },
);

domTest(
  "physical collection stays deliberate and team keyboard, drag and touch controls retain saved records",
  { timeout: 15000 },
  async () => {
    const page = await browser.newPage({ hasTouch: true });
    try {
      let pickups = 0;
      const html = await (
        await render("components/admin/OrderView", { order })
      ).text();
      await open(page, html, (path, method, body) => {
        assert.ok(path.startsWith(`/api/admin/orders/${order.id}`));
        if (method === "POST") {
          pickups += 1;
          const payload = JSON.parse(body ?? "{}");
          assert.equal(payload.expectedRevision, 4);
          assert.equal(typeof payload.operationId, "string");
          assert.deepEqual(Object.keys(payload).sort(), [
            "expectedRevision",
            "operationId",
          ]);
        }
        return {
          body: { order: { ...order, state: "picked_up", revision: 5 } },
        };
      });
      await page
        .getByRole("button", { name: "Record pickup", exact: true })
        .click();
      assert.equal(pickups, 0);
      await page.getByRole("checkbox").check();
      await page
        .getByRole("button", { name: "Record pickup", exact: true })
        .click();
      await page.locator("[data-admin-receipt]:not([hidden])").waitFor();
      assert.equal(pickups, 1);
      assert.match(
        await page.locator("[data-admin-receipt]").innerText(),
        /picked_up/,
      );
      assert.equal(
        await page.locator("[data-order-state]").innerText(),
        "picked_up",
      );
      await page.unrouteAll();
      let updates = 0;
      const team = await (await render("pages/team-sprint")).text();
      await open(page, team, (path, method, body) => {
        assert.equal(path, "/api/admin/team-tasks/FIXTURE-1");
        assert.equal(method, "PUT");
        const status = updates === 0 ? "doing" : "review";
        assert.deepEqual(JSON.parse(body ?? "{}"), {
          expectedRevision: 3 + updates,
          assignee: null,
          status,
        });
        updates += 1;
        return { body: { task: { ...task, status, revision: 3 + updates } } };
      });
      const trigger = page.getByRole("button", {
        name: /Synthetic shared task/,
      });
      await trigger.focus();
      await page.keyboard.press("Enter");
      await page.getByRole("dialog").waitFor();
      assert.match(
        await page.locator("[data-team-detail]").innerText(),
        /Synthetic task details/,
      );
      await page
        .locator('[data-team-edit] [name="status"]')
        .selectOption("doing");
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await page.locator("dialog").waitFor({ state: "hidden" });
      assert.equal(updates, 1);
      assert.equal(
        await page.locator('[data-team-lane="doing"] [data-team-card]').count(),
        1,
      );
      assert.equal(
        await page.locator("[data-team-card]").getAttribute("data-revision"),
        "4",
      );
      await page
        .locator("[data-team-card]")
        .dragTo(page.locator('[data-team-lane="review"]'));
      await page
        .locator('[data-team-card][data-status="review"][data-revision="5"]')
        .waitFor();
      assert.equal(updates, 2);
      await page.setViewportSize({ width: 390, height: 900 });
      await trigger.tap();
      await page.getByRole("dialog").waitFor();
      await page.getByRole("button", { name: "Close", exact: true }).tap();
      await page.locator("[data-team-owner]").selectOption("unassigned");
      await page.locator("[data-team-status]").selectOption("review");
      assert.equal(await page.locator("[data-team-card]:visible").count(), 1);
      await page
        .getByRole("searchbox", { name: "Find a task" })
        .fill("no matching task");
      assert.equal(await page.locator("[data-team-card]:visible").count(), 0);
      assert.match(
        await page.locator("[data-team-feedback]").innerText(),
        /0 of 1/,
      );
    } finally {
      await page.close();
    }
  },
);
