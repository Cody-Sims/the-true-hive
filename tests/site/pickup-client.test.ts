import test from "node:test";
import assert from "node:assert/strict";
import {
  PickupWriter,
  pickupRead,
  siteDate,
  shiftDate,
} from "../../src/client/pickup-state.ts";

const operationId = "22222222-2222-4222-8222-222222222222";
const intent = {
  operationId,
  orderId: "fixture-order",
  expectedOrderRevision: 4,
};
const receipt = {
  operationId,
  resourceKey: "fixture-order",
  revision: 5,
  replayed: false,
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

test("unknown writes freeze exact bytes and require an explicit same-operation retry", async () => {
  const bodies: string[] = [];
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => (release = resolve));
  const writer = new PickupWriter(async (_url: string, init: RequestInit) => {
    bodies.push(String(init.body));
    if (bodies.length === 1) {
      await waiting;
      throw new TypeError("connection lost after possible commit");
    }
    return json(receipt);
  });
  const pending = writer.send(
    "/api/pickup/help",
    intent,
    "fixture-order",
    "token",
  );
  intent.expectedOrderRevision = 99;
  assert.equal(
    (await writer.send("/api/pickup/help", intent, "fixture-order", "token"))
      .kind,
    "blocked",
  );
  release();
  assert.equal((await pending).kind, "uncertain");
  assert.equal(JSON.parse(writer.frozen!.body).expectedOrderRevision, 4);
  assert.equal(
    (await writer.send("/api/pickup/help", intent, "fixture-order", "token"))
      .kind,
    "blocked",
  );
  assert.equal((await writer.retry("token")).kind, "confirmed");
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  assert.equal(writer.frozen, null);
  intent.expectedOrderRevision = 4;
});

test("safe stale rejection releases the intent without automatically retrying", async () => {
  let calls = 0;
  const writer = new PickupWriter(async () => {
    calls++;
    return json(
      { error: { code: "REVISION_CONFLICT", message: "Refresh choices." } },
      409,
    );
  });
  const result = await writer.send(
    "/api/pickup/help",
    intent,
    "fixture-order",
    "token",
  );
  assert.equal(result.kind, "rejected");
  assert.equal(result.error.code, "REVISION_CONFLICT");
  assert.equal(writer.frozen, null);
  assert.equal(calls, 1);
});

test("server errors and malformed or mismatched receipts remain unknown, not failed", async () => {
  for (const response of [
    json({ error: { message: "Unavailable" } }, 503),
    new Response("<html>interrupted</html>", { status: 200 }),
    json({ ...receipt, operationId: "different-operation" }),
    json({ ...receipt, resourceKey: "different-order" }),
    json({ ...receipt, revision: 0 }),
  ]) {
    const writer = new PickupWriter(async () => response);
    assert.equal(
      (await writer.send("/api/pickup/help", intent, "fixture-order", "token"))
        .kind,
      "uncertain",
    );
    assert.ok(writer.frozen);
  }
});

test("request deadline bounds an unresponsive mutation and retains its exact retry", async () => {
  const writer = new PickupWriter(
    async () => new Promise<Response>(() => {}),
    15,
  );
  assert.equal(
    (await writer.send("/api/pickup/help", intent, "fixture-order", "token"))
      .kind,
    "uncertain",
  );
  assert.ok(writer.frozen);
});

test("a response arriving after the deadline cannot silently discard the unknown intent", async () => {
  let release!: (response: Response) => void;
  const writer = new PickupWriter(
    async () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
    10,
  );
  assert.equal(
    (await writer.send("/api/pickup/help", intent, "fixture-order", "token"))
      .kind,
    "uncertain",
  );
  const original = writer.frozen!.body;
  release(json(receipt));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(writer.frozen?.body, original);
});

test("pickup dates follow the chosen site zone across midnight and DST", () => {
  const now = new Date("2026-11-02T03:30:00Z");
  assert.equal(siteDate("America/New_York", now), "2026-11-01");
  assert.equal(siteDate("Asia/Tokyo", now), "2026-11-02");
  assert.equal(shiftDate("2026-10-31", 2), "2026-11-02");
  assert.equal(shiftDate("2026-12-30", 7), "2027-01-06");
});

test("expired operator sessions do not suggest buyer-browser checkout recovery", async () => {
  await assert.rejects(
    pickupRead("/api/admin/pickup", async () =>
      json({ error: { code: "UNAUTHENTICATED", message: "Sign in." } }, 401),
    ),
    /inventory session.*Sign in/i,
  );
});
