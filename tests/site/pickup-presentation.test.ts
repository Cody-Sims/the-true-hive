import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { transform } from "@astrojs/compiler-rs";
import { parse } from "es-module-lexer";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import type { Browser, Page } from "@playwright/test";
import type { CustomerPickupContext } from "../../src/domain/pickup.ts";

const root = new URL("../../", import.meta.url);
const screenshots = process.env["INVENTORY_UI_SCREENSHOT_DIR"];
async function moduleUrl(file: URL): Promise<string> {
  const source = await readFile(file, "utf8");
  let code = file.pathname.endsWith(".astro")
    ? transform(source, {
        filename: file.pathname,
        internalURL: "astro/compiler-runtime",
        resolvePath: (specifier) => specifier,
      }).code
    : stripTypeScriptTypes(source, { mode: "transform" });
  const [imports] = parse(code);
  for (const item of [...imports].reverse()) {
    if (!item.specifier) continue;
    const path = item.specifier;
    const resolved = path.endsWith(".css")
      ? "data:text/javascript,export default {}"
      : path.startsWith(".")
        ? await moduleUrl(new URL(path, file))
        : import.meta.resolve(path);
    code = code.slice(0, item.start) + resolved + code.slice(item.end);
  }
  return `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
}
async function render(name: string, authorized = false) {
  const component = await import(
    await moduleUrl(new URL(`src/components/pickup/${name}.astro`, root))
  );
  const container = await AstroContainer.create();
  return container.renderToString(component.default, {
    locals: authorized
      ? {
          nonce: "pickup-component-test",
          admin: { uid: "synthetic-uid", actorId: "synthetic-actor" },
          csrfToken: "synthetic-admin-token",
        }
      : { nonce: "pickup-component-test" },
  });
}

test("native customer shell never infers payment or exposes a guessed schedule", async () => {
  const html = await render("CustomerPickup");
  assert.match(html, /data-pickup-mode="customer"/);
  assert.match(html, /no real payment/i);
  assert.match(html, /same browser/i);
  assert.match(html, /Refresh status/);
  assert.match(html, /href="\/cart"/);
  assert.doesNotMatch(html, /session_id|localStorage|Open daily|09:00/);
});

test("operator shell requires verified SSR identity and has no invented operational defaults", async () => {
  const anonymous = await render("AdminPickup");
  assert.doesNotMatch(anonymous, /data-pickup-authorized="true"/);
  assert.doesNotMatch(anonymous, /data-pickup-refresh/);
  const verified = await render("AdminPickup", true);
  assert.match(verified, /data-pickup-authorized="true"/);
  assert.match(verified, /data-pickup-mode="admin"/);
  assert.match(verified, /physical pickup/i);
  assert.doesNotMatch(
    verified,
    /synthetic-actor|synthetic-uid|09:00|America\/New_York/,
  );
});

test("the native pickup page rejects missing session bootstrap and renders the shared CSRF meta only for verified locals", async () => {
  const component = await import(
    await moduleUrl(new URL("src/pages/inventory/pickups.astro", root))
  );
  const container = await AstroContainer.create();
  const request = new Request(
    "https://inventory.example.invalid/inventory/pickups",
  );
  const anonymous = await container.renderToResponse(component.default, {
    request,
    locals: { nonce: "pickup-component-test" },
  });
  assert.equal(anonymous.status, 403);
  const verified = await container.renderToResponse(component.default, {
    request,
    locals: {
      nonce: "pickup-component-test",
      admin: { uid: "synthetic-uid", actorId: "synthetic-actor" },
      csrfToken: "synthetic-admin-token",
    },
  });
  assert.equal(verified.status, 200);
  assert.equal(verified.headers.get("cache-control"), "no-store");
  const html = await verified.text();
  assert.match(html, /<meta name="csrf-token" content="synthetic-admin-token"/);
  assert.match(html, /data-pickup-authorized="true"/);
});

export { moduleUrl, render, root };

let browser: Browser;
const domTest =
  process.env["INVENTORY_UI_BROWSER_TESTS"] === "1" ? test : test.skip;
test.before(async () => {
  if (process.env["INVENTORY_UI_BROWSER_TESTS"] !== "1") return;
  const { chromium } = await import("@playwright/test");
  browser = await chromium.launch({
    env: { ...process.env, TMPDIR: root.pathname },
    timeout: 10000,
  });
});
test.after(async () => {
  await browser?.close();
});

const publicSite = {
  key: "synthetic-point",
  label: "Synthetic pickup point",
  area: "Component fixture only",
  timezone: "America/New_York",
  revision: 3,
};
const paidOrder = {
  id: "33333333-3333-4333-8333-333333333333",
  state: "paid",
  revision: 4,
  createdAt: "2026-11-18T10:00:00Z",
  booking: null,
  helpRequested: false,
  sites: [publicSite],
  instructions: null,
  canSchedule: true,
};
const context = {
  enabled: true,
  settingsRevision: 2,
  csrfToken: "synthetic-customer-csrf",
  orders: [paidOrder],
};
const slot = {
  id: "synthetic-slot",
  siteKey: publicSite.key,
  siteRevision: 3,
  date: "2026-11-19",
  timezone: publicSite.timezone,
  startsAt: "2026-11-19T15:00:00Z",
  endsAt: "2026-11-19T15:30:00Z",
  label: "Synthetic returned slot",
};
const site = {
  ...publicSite,
  active: true,
  privateInstructions: "Synthetic instructions only",
  stockLocationKeys: ["synthetic-stock"],
  slotMinutes: 30,
  capacity: 1,
  noticeHours: 0,
  horizonDays: 28,
  rescheduleCutoffHours: 1,
  travelBufferMinutes: 0,
  weekly: {
    0: [],
    1: [],
    2: [],
    3: [{ start: "10:00", end: "12:00" }],
    4: [],
    5: [],
    6: [],
  },
  exceptions: {},
};
type Handler = (
  path: string,
  method: string,
  body: string | null,
) => Promise<{ status?: number; body?: unknown; abort?: boolean }>;
async function open(page: Page, mode: "customer" | "admin", handler: Handler) {
  page.setDefaultTimeout(5000);
  await page.clock.setFixedTime(new Date("2026-11-18T12:00:00Z"));
  const html = await render(
    mode === "admin" ? "AdminPickup" : "CustomerPickup",
    mode === "admin",
  );
  const css = await readFile(new URL("src/styles/pickup.css", root), "utf8");
  await page.route("https://pickup.example.invalid/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/")) {
      if (request.method() !== "GET") {
        assert.equal(
          request.headers()[
            mode === "admin" ? "x-csrf-token" : "x-pickup-csrf"
          ],
          mode === "admin"
            ? "synthetic-admin-token"
            : "synthetic-customer-csrf",
        );
        assert.doesNotMatch(
          request.postData() ?? "",
          /synthetic-actor|synthetic-uid|csrfToken/,
        );
      }
      const response = await handler(
        path,
        request.method(),
        request.postData(),
      );
      if (response.abort) return route.abort("connectionfailed");
      return route.fulfill({
        status: response.status ?? 200,
        contentType: "application/json",
        body: JSON.stringify(response.body),
      });
    }
    if (path.endsWith(".ts")) {
      const code = stripTypeScriptTypes(
        await readFile(new URL(path.slice(1), root), "utf8"),
        { mode: "transform" },
      );
      return route.fulfill({ contentType: "text/javascript", body: code });
    }
    return route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="csrf-token" content="synthetic-admin-token"><title>Synthetic pickup component</title><style>body{margin:0;padding:24px;background:#f4f0e2;font-family:Arial,sans-serif}${css}</style></head><body>${html}<script type="module" src="/src/client/pickup.ts"></script></body></html>`,
    });
  });
  await page.goto("https://pickup.example.invalid/fixture");
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

async function deliverSiteResponse(
  page: Page,
  key: string,
  deliver: () => void,
) {
  const response = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/admin/pickup/sites/${key}`,
  );
  deliver();
  await (await response).finished();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
}

domTest(
  "in-progress paid appointments retain server-authorized arrival directions",
  async () => {
    const page = await browser.newPage();
    await open(page, "customer", async () => ({
      body: {
        ...context,
        enabled: false,
        orders: [
          {
            ...paidOrder,
            canSchedule: false,
            instructions: "Synthetic in-progress arrival directions",
            booking: {
              id: "synthetic-in-progress",
              orderId: paidOrder.id,
              siteKey: site.key,
              siteLabel: site.label,
              timezone: site.timezone,
              startsAt: "2026-11-18T11:45:00Z",
              endsAt: "2026-11-18T12:15:00Z",
              revision: 2,
              status: "scheduled",
              rescheduleCutoffHours: 1,
            },
          },
        ],
      },
    }));
    await page.getByText("Current appointment", { exact: true }).waitFor();
    await page
      .getByText("Synthetic in-progress arrival directions", { exact: true })
      .waitFor();
    assert.equal(await page.getByLabel("Pickup location").count(), 0);
    assert.equal(
      await page.getByText("Pickup complete", { exact: true }).count(),
      0,
    );
    await page.close();
  },
);

domTest(
  "out-of-order site edit GETs cannot replace the later editor's live text",
  async () => {
    const page = await browser.newPage();
    const otherSite = {
      ...site,
      key: "synthetic-point-b",
      label: "Synthetic pickup point B",
    };
    const first = deferred<{ body: { site: typeof site } }>();
    const second = deferred<{ body: { site: typeof site } }>();
    const firstStarted = deferred<void>();
    const secondStarted = deferred<void>();
    await open(page, "admin", async (path) => {
      if (path.endsWith(`/sites/${site.key}`)) {
        firstStarted.resolve();
        return first.promise;
      }
      if (path.endsWith(`/sites/${otherSite.key}`)) {
        secondStarted.resolve();
        return second.promise;
      }
      return {
        body: {
          settings: { enabled: false, revision: 2 },
          sites: [site, otherSite],
          stockLocations: [
            { key: "synthetic-stock", label: "Synthetic stock location" },
          ],
          orders: [],
          truncated: false,
        },
      };
    });
    await page
      .getByText(`${site.label} · Active · ${site.timezone}`, { exact: true })
      .click();
    await page
      .getByText(`${otherSite.label} · Active · ${site.timezone}`, {
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: `Edit ${site.label}`, exact: true })
      .click();
    await firstStarted.promise;
    await page
      .getByRole("button", { name: `Edit ${otherSite.label}`, exact: true })
      .click();
    await secondStarted.promise;
    await deliverSiteResponse(page, otherSite.key, () =>
      second.resolve({ body: { site: otherSite } }),
    );
    await page
      .getByRole("heading", { name: `Edit ${otherSite.label}`, exact: true })
      .waitFor();
    await page
      .getByLabel("Public point name")
      .fill("Live draft for the later point");
    await deliverSiteResponse(page, site.key, () =>
      first.resolve({ body: { site } }),
    );
    assert.equal(
      await page.getByLabel("Immutable point key").inputValue(),
      otherSite.key,
    );
    assert.equal(
      await page.getByLabel("Public point name").inputValue(),
      "Live draft for the later point",
    );
    await page.close();
  },
);

for (const intent of ["add", "discard", "refresh"] as const) {
  domTest(
    `a later ${intent} intent invalidates a pending site edit GET`,
    async () => {
      const page = await browser.newPage();
      const pending = deferred<{ body: { site: typeof site } }>();
      const started = deferred<void>();
      let reads = 0;
      await open(page, "admin", async (path) => {
        if (path.endsWith(`/sites/${site.key}`)) {
          started.resolve();
          return pending.promise;
        }
        if (++reads > 1 && intent === "refresh")
          return {
            status: 503,
            body: {
              error: {
                code: "PICKUP_UNAVAILABLE",
                message: "Synthetic refresh unavailable.",
              },
            },
          };
        return {
          body: {
            settings: { enabled: false, revision: 2 },
            sites: [site],
            stockLocations: [
              { key: "synthetic-stock", label: "Synthetic stock location" },
            ],
            orders: [],
            truncated: false,
          },
        };
      });
      await page.getByRole("button", { name: "Add pickup point" }).click();
      await page
        .getByLabel("Public point name")
        .fill("Live draft before the later intent");
      await page
        .getByText(`${site.label} · Active · ${site.timezone}`, { exact: true })
        .click();
      await page
        .getByRole("button", { name: `Edit ${site.label}`, exact: true })
        .click();
      await started.promise;
      if (intent === "add") {
        await page.getByRole("button", { name: "Add pickup point" }).click();
        await page
          .getByLabel("Public point name")
          .fill("Live draft for the new point");
      } else if (intent === "discard") {
        await page.getByRole("button", { name: "Discard editor" }).click();
        assert.equal(await page.getByLabel("Public point name").count(), 0);
      } else {
        await page.getByRole("button", { name: "Refresh records" }).click();
        await page
          .getByText("Synthetic refresh unavailable.", { exact: false })
          .waitFor();
      }
      await deliverSiteResponse(page, site.key, () =>
        pending.resolve({ body: { site } }),
      );
      if (intent === "discard") {
        assert.equal(await page.getByLabel("Public point name").count(), 0);
      } else {
        assert.equal(
          await page.getByLabel("Immutable point key").inputValue(),
          "",
        );
        assert.equal(
          await page.getByLabel("Public point name").inputValue(),
          intent === "add"
            ? "Live draft for the new point"
            : "Live draft before the later intent",
        );
        assert.equal(
          await page.getByLabel("Public point name").isDisabled(),
          intent === "refresh",
        );
      }
      await page.close();
    },
  );
}

domTest(
  "customer pending orders stay unpaid; paid disabled orders keep help and exact unknown-write recovery",
  async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    let current = {
      ...context,
      enabled: false,
      orders: [{ ...paidOrder, state: "open", sites: [], canSchedule: false }],
    };
    const writes: string[] = [];
    await open(page, "customer", async (path, method, body) => {
      if (method === "GET") return { body: current };
      assert.equal(path, "/api/pickup/help");
      writes.push(body!);
      if (writes.length === 1) return { abort: true };
      current = {
        ...current,
        orders: [{ ...current.orders[0]!, helpRequested: true }],
      };
      return {
        body: {
          operationId: JSON.parse(body!).operationId,
          resourceKey: paidOrder.id,
          revision: 4,
          replayed: true,
        },
      };
    });
    await page
      .getByText("Payment is not confirmed.", { exact: false })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Request pickup help", exact: true })
        .count(),
      0,
    );
    current = {
      ...current,
      orders: [{ ...current.orders[0]!, state: "paid" }],
    };
    await page.getByRole("button", { name: "Refresh status" }).click();
    await page
      .getByRole("button", { name: "Request pickup help", exact: true })
      .click();
    await page.getByRole("button", { name: "Confirm help request" }).click();
    await page.getByText("The outcome is unknown.", { exact: false }).waitFor();
    assert.equal(writes.length, 1);
    await page.getByRole("button", { name: "Retry exact request" }).click();
    await page.getByText("Pickup help requested", { exact: false }).waitFor();
    assert.deepEqual(writes, [writes[0], writes[0]]);
    assert.equal(
      await page.evaluate(() => localStorage.length + sessionStorage.length),
      0,
    );
    if (screenshots)
      await page.screenshot({
        path: `${screenshots}/native-pickup-customer-mobile.png`,
        fullPage: true,
      });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.close();
  },
);

domTest(
  "stale customer booking never auto-rebooks and discards stale choices",
  async () => {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    let writes = 0;
    await open(page, "customer", async (path, method) => {
      if (method !== "GET") {
        writes++;
        return {
          status: 409,
          body: {
            error: {
              code: "PICKUP_SLOT_FULL",
              message: "That time was just taken.",
            },
          },
        };
      }
      if (path.endsWith("/availability"))
        return {
          body: {
            site: publicSite,
            settingsRevision: 2,
            orderRevision: 4,
            bookingRevision: null,
            slots: [slot],
          },
        };
      return { body: context };
    });
    await page.getByLabel("Pickup location").selectOption(publicSite.key);
    await page.getByLabel("Pickup date (location timezone)").fill(slot.date);
    await page.getByRole("button", { name: "Find available times" }).click();
    await page.getByLabel("Available time").selectOption(slot.id);
    await page.getByLabel("I confirm this pickup time").check();
    if (screenshots)
      await page.screenshot({
        path: `${screenshots}/native-pickup-customer-desktop.png`,
        fullPage: true,
      });
    await page
      .getByRole("button", { name: "Confirm pickup", exact: true })
      .click();
    await page
      .getByText("That time was just taken.", { exact: false })
      .waitFor();
    assert.equal(writes, 1);
    assert.equal(await page.getByLabel("Available time").count(), 0);
    await page.close();
  },
);

domTest(
  "a changed site timezone invalidates dated choices instead of presenting stale wall-clock times",
  async () => {
    const page = await browser.newPage();
    await open(page, "customer", async (path) => ({
      body: path.endsWith("/availability")
        ? {
            site: { ...publicSite, timezone: "America/Chicago", revision: 4 },
            settingsRevision: 2,
            orderRevision: 4,
            bookingRevision: null,
            slots: [{ ...slot, timezone: "America/Chicago", siteRevision: 4 }],
          }
        : context,
    }));
    await page.getByLabel("Pickup location").selectOption(publicSite.key);
    await page.getByLabel("Pickup date (location timezone)").fill(slot.date);
    await page.getByRole("button", { name: "Find available times" }).click();
    await page
      .getByText("The pickup point's timezone changed.", { exact: false })
      .waitFor();
    assert.equal(await page.getByLabel("Available time").count(), 0);
    await page.close();
  },
);

domTest(
  "customer receipts retain disabled appointments but suppress arrival instructions during review",
  async () => {
    const page = await browser.newPage();
    const booking = {
      id: "synthetic-booking",
      orderId: paidOrder.id,
      siteKey: site.key,
      siteLabel: site.label,
      timezone: site.timezone,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      revision: 2,
      status: "needs_review" as const,
      rescheduleCutoffHours: 1,
    };
    let current: CustomerPickupContext & { csrfToken: string } = {
      ...context,
      enabled: false,
      orders: [
        {
          ...paidOrder,
          canSchedule: false,
          booking,
          instructions: "PRIVATE ARRIVAL FIXTURE",
        },
      ],
    };
    await open(page, "customer", async () => ({ body: current }));
    await page.getByText("Appointment needs operator review").waitFor();
    assert.equal(await page.getByText("PRIVATE ARRIVAL FIXTURE").count(), 0);
    assert.equal(await page.getByLabel("Pickup location").count(), 0);
    assert.equal(
      await page
        .getByRole("button", { name: "Request pickup help", exact: true })
        .count(),
      1,
    );
    current = {
      ...current,
      orders: [
        { ...current.orders[0]!, booking: { ...booking, status: "scheduled" } },
      ],
    };
    await page.getByRole("button", { name: "Refresh status" }).click();
    await page.getByText("PRIVATE ARRIVAL FIXTURE").waitFor();
    assert.equal(
      await page.getByText("Pickup complete", { exact: true }).count(),
      0,
    );
    current = {
      ...current,
      orders: [
        {
          ...current.orders[0]!,
          state: "picked_up",
          booking: { ...booking, status: "completed" },
          instructions: null,
        },
      ],
    };
    await page.getByRole("button", { name: "Refresh status" }).click();
    await page.getByText("Pickup complete", { exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Request pickup help", exact: true })
        .count(),
      0,
    );
    await page.close();
  },
);

domTest(
  "operators can revoke browser access for collected orders without changing pickup or payment",
  async () => {
    const page = await browser.newPage();
    let revoked = false;
    const writes: unknown[] = [];
    await open(page, "admin", async (path, method, body) => {
      if (method === "GET")
        return {
          body: {
            settings: { enabled: false, revision: 2 },
            sites: [],
            stockLocations: [],
            truncated: false,
            orders: [
              {
                ...paidOrder,
                state: "picked_up",
                sites: [],
                stockLocationKey: "synthetic-stock",
                buyerAccessRevoked: revoked,
              },
            ],
          },
        };
      assert.equal(path, "/api/admin/pickup/access");
      const payload = JSON.parse(body!);
      writes.push(payload);
      revoked = true;
      return {
        body: {
          operationId: payload.operationId,
          resourceKey: paidOrder.id,
          revision: 4,
          replayed: false,
        },
      };
    });
    await page
      .getByRole("button", { name: "Revoke buyer browser access" })
      .click();
    assert.equal(writes.length, 0);
    await page
      .getByRole("button", { name: "Confirm access revocation" })
      .click();
    await page
      .getByText("Buyer browser access revoked.", { exact: false })
      .waitFor();
    assert.equal(writes.length, 1);
    assert.equal(
      await page.getByText("Pickup complete", { exact: true }).count(),
      1,
    );
    await page.close();
  },
);

domTest(
  "operator assistance uses latest availability revisions while disabled and reloads truth after an old replay",
  async () => {
    const page = await browser.newPage();
    const booking = {
      id: "synthetic-booking",
      orderId: paidOrder.id,
      siteKey: site.key,
      siteLabel: site.label,
      timezone: site.timezone,
      startsAt: "2026-11-20T15:00:00Z",
      endsAt: "2026-11-20T15:30:00Z",
      revision: 2,
      status: "scheduled",
      rescheduleCutoffHours: 1,
      travelBufferMinutes: 0,
    };
    let saved = false;
    let requested!: () => void;
    const requestStarted = new Promise<void>(
      (resolve) => (requested = resolve),
    );
    let release!: () => void;
    const saveResponse = new Promise<void>((resolve) => (release = resolve));
    const writes: Record<string, unknown>[] = [];
    await open(page, "admin", async (path, method, body) => {
      if (method === "GET" && path.endsWith("/availability"))
        return {
          body: {
            site: { ...publicSite, revision: 7 },
            settingsRevision: 5,
            orderRevision: 6,
            bookingRevision: 2,
            slots: [{ ...slot, siteRevision: 7 }],
          },
        };
      if (method === "GET")
        return {
          body: {
            settings: { enabled: false, revision: 5 },
            sites: [site],
            stockLocations: [
              { key: "synthetic-stock", label: "Synthetic stock location" },
            ],
            truncated: false,
            orders: [
              {
                ...paidOrder,
                state: saved ? "picked_up" : "paid",
                booking: {
                  ...booking,
                  status: saved ? "completed" : "scheduled",
                },
                stockLocationKey: "synthetic-stock",
                buyerAccessRevoked: true,
              },
            ],
          },
        };
      const payload = JSON.parse(body!) as Record<string, unknown>;
      writes.push(payload);
      requested();
      await saveResponse;
      saved = true;
      return {
        body: {
          operationId: payload["operationId"],
          resourceKey: paidOrder.id,
          revision: 3,
          replayed: true,
          booking: {
            ...booking,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            revision: 3,
          },
        },
      };
    });
    await page.getByLabel("Pickup location").selectOption(site.key);
    await page.getByLabel("Pickup date (location timezone)").fill(slot.date);
    await page.getByRole("button", { name: "Find available times" }).click();
    await page.getByLabel("Available time").selectOption(slot.id);
    await page.getByLabel("I confirm this pickup time").check();
    await page.getByRole("button", { name: "Confirm reschedule" }).click();
    await requestStarted;
    assert.equal(
      await page.getByText("Current appointment", { exact: true }).count(),
      1,
    );
    assert.equal(await page.getByLabel("Pickup location").isDisabled(), true);
    assert.deepEqual(
      {
        order: writes[0]!["expectedOrderRevision"],
        site: writes[0]!["expectedSiteRevision"],
        settings: writes[0]!["expectedSettingsRevision"],
        booking: writes[0]!["expectedBookingRevision"],
      },
      { order: 6, site: 7, settings: 5, booking: 2 },
    );
    release();
    await page.getByText("Pickup complete", { exact: true }).waitFor();
    assert.equal(writes.length, 1);
    assert.equal(
      await page.getByRole("button", { name: "Confirm reschedule" }).count(),
      0,
    );
    await page.close();
  },
);

domTest(
  "operator point editor starts blank and explicitly reviews closure impact with a new operation",
  async () => {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
    });
    const dashboard = {
      settings: { enabled: false, revision: 2 },
      sites: [site],
      stockLocations: [
        { key: "synthetic-stock", label: "Synthetic stock location" },
      ],
      orders: [
        {
          ...paidOrder,
          stockLocationKey: "synthetic-stock",
          buyerAccessRevoked: false,
        },
      ],
      truncated: true,
    };
    const writes: Record<string, unknown>[] = [];
    await open(page, "admin", async (path, method, body) => {
      if (method === "GET")
        return { body: path.endsWith(`/${site.key}`) ? { site } : dashboard };
      const payload = JSON.parse(body!) as Record<string, unknown>;
      writes.push(payload);
      if (writes.length === 1) return { abort: true };
      if (writes.length === 2)
        return {
          status: 409,
          body: {
            error: {
              code: "PICKUP_IMPACT_REVIEW_REQUIRED",
              message: "Review affected appointments.",
              impact: {
                ack: "a".repeat(64),
                bookings: [
                  {
                    orderId: paidOrder.id,
                    bookingId: "synthetic-booking",
                    siteLabel: site.label,
                    startsAt: slot.startsAt,
                    reasons: ["outside_window"],
                  },
                ],
              },
            },
          },
        };
      return {
        body: {
          operationId: payload["operationId"],
          resourceKey: site.key,
          revision: 4,
          replayed: false,
        },
      };
    });
    await page.getByRole("button", { name: "Add pickup point" }).click();
    assert.equal(await page.getByLabel("IANA timezone").inputValue(), "");
    assert.equal(await page.getByLabel("Capacity per slot").inputValue(), "");
    assert.equal(
      await page.getByLabel("Active pickup point").isChecked(),
      false,
    );
    assert.equal(
      await page.getByLabel("Slot length (minutes)").inputValue(),
      "",
    );
    await page.getByRole("button", { name: "Discard editor" }).click();
    await page
      .getByText(`${site.label} · Active · ${site.timezone}`, { exact: true })
      .click();
    await page.getByRole("button", { name: `Edit ${site.label}` }).click();
    await page
      .getByRole("button", { name: "Wednesday remove window 1" })
      .click();
    await page.getByLabel("Active pickup point").uncheck();
    await page.getByRole("button", { name: "Save pickup point" }).click();
    await page.getByText("The outcome is unknown.", { exact: false }).waitFor();
    await page.getByRole("button", { name: "Retry exact request" }).click();
    await page.getByText("outside_window", { exact: false }).waitFor();
    assert.equal(writes.length, 2);
    assert.deepEqual(writes[0], writes[1]);
    assert.equal(await page.getByLabel("Public point name").isDisabled(), true);
    if (screenshots)
      await page.screenshot({
        path: `${screenshots}/native-pickup-admin-desktop.png`,
        fullPage: true,
      });
    await page.getByLabel("I reviewed every affected appointment").check();
    await page
      .getByRole("button", { name: "Acknowledge impact and save" })
      .click();
    await page
      .getByText("Saved. Current server records reloaded.", { exact: false })
      .waitFor();
    assert.equal(writes.length, 3);
    assert.notEqual(writes[0]!["operationId"], writes[2]!["operationId"]);
    assert.deepEqual(writes[0]!["site"], writes[2]!["site"]);
    assert.equal(writes[2]!["impactAck"], "a".repeat(64));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Add pickup point" }).click();
    if (screenshots)
      await page.screenshot({
        path: `${screenshots}/native-pickup-admin-mobile.png`,
        fullPage: true,
      });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.close();
  },
);
