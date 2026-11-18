import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import {
  createCustomerPickupHandler,
  type CustomerPickupDependencies,
} from "../../src/server/pickup/customer-http.ts";
import { prepareBuyerAccess } from "../../src/server/pickup/access.ts";
import { GET as dashboard } from "../../src/pages/api/admin/pickup/index.ts";
import { POST as settings } from "../../src/pages/api/admin/pickup/settings.ts";
import { POST as booking } from "../../src/pages/api/admin/pickup/booking.ts";
import { POST as revoke } from "../../src/pages/api/admin/pickup/access.ts";
import { GET as adminAvailability } from "../../src/pages/api/admin/pickup/availability.ts";
import { POST as createSite } from "../../src/pages/api/admin/pickup/sites/index.ts";
import {
  GET as getSite,
  PUT as updateSite,
} from "../../src/pages/api/admin/pickup/sites/[key].ts";

const origin = "https://shop.example";
const access = prepareBuyerAccess(
  new Request(`${origin}/api/checkout/access`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: "{}",
  }),
  origin,
  () => "a".repeat(43),
);
const cookie = access.cookie.split(";")[0]!;
const intent = () => ({
  operationId: randomUUID(),
  orderId: randomUUID(),
  siteKey: "test-point",
  date: "2027-01-03",
  slotId: "a".repeat(64),
  expectedOrderRevision: 3,
  expectedSiteRevision: 1,
  expectedSettingsRevision: 2,
  expectedBookingRevision: null,
});

function fixture() {
  const calls: { action: string; input: unknown; actor?: unknown }[] = [];
  const dependencies: CustomerPickupDependencies = {
    getOrigin: () => origin,
    allowAttempt: () => true,
    readJsonBody: async (request) => request.json(),
    context: async (hash) => {
      calls.push({ action: "context", input: hash });
      return { enabled: false, settingsRevision: 1, orders: [] };
    },
    availability: async (input, actor) => {
      calls.push({ action: "availability", input, actor });
      return {
        site: {
          key: "test-point",
          label: "Test",
          area: "",
          timezone: "UTC",
          revision: 1,
        },
        settingsRevision: 2,
        orderRevision: 3,
        bookingRevision: null,
        slots: [],
      };
    },
    booking: async (input, actor) => {
      calls.push({ action: "booking", input, actor });
      const value = input as ReturnType<typeof intent>;
      return {
        operationId: value.operationId,
        resourceKey: value.orderId,
        revision: 1,
        replayed: false,
      };
    },
    help: async (input, actor) => {
      calls.push({ action: "help", input, actor });
      const value = input as ReturnType<typeof intent>;
      return {
        operationId: value.operationId,
        resourceKey: value.orderId,
        revision: 3,
        replayed: false,
      };
    },
  };
  return { calls, dependencies };
}

function request(action: string, body?: unknown, headers: HeadersInit = {}) {
  return new Request(`${origin}/api/pickup/${action}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Cookie: cookie,
      ...(body === undefined
        ? {}
        : {
            Origin: origin,
            "Content-Type": "application/json",
            "X-Pickup-CSRF": access.csrfToken,
          }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("pickup HTTP verifies browser scope before storage and returns only a memory CSRF token", async () => {
  const { calls, dependencies } = fixture();
  const handler = createCustomerPickupHandler("context", dependencies);
  assert.equal(
    (await handler(new Request(`${origin}/api/pickup/context`))).status,
    401,
  );
  assert.equal(
    (
      await handler(
        request("context", undefined, { Origin: "https://unrelated.example" }),
      )
    ).status,
    403,
  );
  assert.equal(calls.length, 0);
  const response = await handler(request("context"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.csrfToken, access.csrfToken);
  assert.equal(JSON.stringify(body).includes(access.hash), false);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.deepEqual(calls, [{ action: "context", input: access.hash }]);
});

test("pickup HTTP rejects forged actors, missing CSRF, duplicate query keys and wrong methods before service access", async () => {
  const { calls, dependencies } = fixture();
  const handler = createCustomerPickupHandler("booking", dependencies);
  assert.equal(
    (
      await handler(
        request("booking", intent(), { "X-Pickup-CSRF": "z".repeat(43) }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handler(
        request("booking", { ...intent(), actorId: "operator:forged" }),
      )
    ).status,
    400,
  );
  assert.equal((await handler(request("booking"))).status, 405);
  const availability = createCustomerPickupHandler(
    "availability",
    dependencies,
  );
  assert.equal(
    (
      await availability(
        new Request(
          `${origin}/api/pickup/availability?orderId=${randomUUID()}&siteKey=test-point&from=2027-01-03&days=1&days=2`,
          { headers: { Cookie: cookie } },
        ),
      )
    ).status,
    400,
  );
  assert.equal(calls.length, 0);
  const input = intent();
  assert.equal((await handler(request("booking", input))).status, 200);
  assert.deepEqual(calls, [
    { action: "booking", input, actor: { kind: "buyer", hash: access.hash } },
  ]);
});

test("pickup HTTP rate limits before service access and masks unexpected persistence failures", async () => {
  const { calls, dependencies } = fixture();
  const limited = createCustomerPickupHandler("context", {
    ...dependencies,
    allowAttempt: () => false,
  });
  const response = await limited(request("context"));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.equal(calls.length, 0);
  const unavailable = createCustomerPickupHandler("context", {
    ...dependencies,
    context: async () => {
      throw new Error("PRIVATE_DATABASE_SECRET");
    },
  });
  const failed = await unavailable(request("context"));
  assert.equal(failed.status, 503);
  assert.equal(
    (await failed.text()).includes("PRIVATE_DATABASE_SECRET"),
    false,
  );
});

test("every inventory pickup endpoint rejects an unauthenticated forged operator before acquiring a pool", async () => {
  for (const handler of [
    dashboard,
    settings,
    booking,
    revoke,
    adminAvailability,
    createSite,
    getSite,
    updateSite,
  ]) {
    const response = await handler({
      locals: {},
      params: { key: "test-point" },
      request: new Request("https://inventory.example/api/admin/pickup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actorId: "operator:forged",
          operationId: randomUUID(),
        }),
      }),
    } as unknown as Parameters<typeof handler>[0]);
    assert.equal(response.status, 401);
  }
});
