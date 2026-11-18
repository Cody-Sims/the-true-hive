import assert from "node:assert/strict";
import test from "node:test";
import {
  prepareBuyerAccess,
  readBuyerAccess,
  requireBuyerMutation,
} from "../../src/server/pickup/access.ts";
import { PickupError } from "../../src/server/pickup/rules.ts";

const origin = "https://shop.example.test";
const nonce = "A".repeat(43);
function request(headers: Record<string, string> = {}, method = "POST") {
  return new Request(`${origin}/api/checkout/access`, {
    method,
    headers: { Origin: origin, "Content-Type": "application/json", ...headers },
  });
}
const status = (expected: number) => (error: unknown) =>
  error instanceof PickupError && error.status === expected;

test("buyer access is host-only, HttpOnly and available across a top-level checkout return without exposing its nonce", () => {
  const issued = prepareBuyerAccess(request(), origin, () => nonce);
  assert.match(issued.cookie, /^__Host-hive-buyer=/);
  assert.match(issued.cookie, /; Secure/);
  assert.match(issued.cookie, /; HttpOnly/);
  assert.match(issued.cookie, /; SameSite=Lax/);
  assert.match(issued.cookie, /; Path=\//);
  assert.doesNotMatch(issued.cookie, /Domain=/i);
  assert.equal(issued.hash.length, 64);
  const cookie = issued.cookie.split(";")[0]!;
  const access = readBuyerAccess(request({ Cookie: cookie }, "GET"), origin);
  assert.deepEqual(access, { hash: issued.hash, csrfToken: issued.csrfToken });
  assert.equal(JSON.stringify(access).includes(nonce), false);
  const again = prepareBuyerAccess(request({ Cookie: cookie }), origin, () => {
    throw new Error("Do not rotate existing access.");
  });
  assert.equal(again.hash, issued.hash);
  assert.equal(again.csrfToken, issued.csrfToken);
});

test("buyer mutations require the established cookie, exact origin and session-bound CSRF header", () => {
  const issued = prepareBuyerAccess(request(), origin, () => nonce);
  const cookie = issued.cookie.split(";")[0]!;
  assert.throws(() => requireBuyerMutation(request(), origin), status(428));
  assert.throws(
    () => requireBuyerMutation(request({ Cookie: cookie }), origin),
    status(403),
  );
  assert.throws(
    () =>
      requireBuyerMutation(
        request({ Cookie: cookie, "X-Pickup-CSRF": "B".repeat(43) }),
        origin,
      ),
    status(403),
  );
  assert.deepEqual(
    requireBuyerMutation(
      request({ Cookie: cookie, "X-Pickup-CSRF": issued.csrfToken }),
      origin,
    ),
    { hash: issued.hash, csrfToken: issued.csrfToken },
  );
  for (const headers of [
    { Origin: "https://other.example.test" },
    { "Sec-Fetch-Site": "cross-site" },
    { "Content-Type": "text/plain" },
    { Host: "other.example.test" },
  ])
    assert.throws(
      () => prepareBuyerAccess(request(headers), origin, () => nonce),
      (error) =>
        error instanceof PickupError && [403, 415].includes(error.status),
    );
  assert.throws(
    () => readBuyerAccess(request({ Cookie: `${cookie}; ${cookie}` }), origin),
    status(401),
  );
});
