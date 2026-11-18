import assert from "node:assert/strict";
import test from "node:test";
import { createCheckoutAccessHandler } from "../../src/pages/api/checkout/access.ts";
import { readJsonBody } from "../../src/server/http-input.ts";

const config = {
  mode: "stripe-test" as const,
  locationKey: "test-stock",
  siteOrigin: "https://shop.example.test",
  secretKey: "sk_test_offlineFixture",
  webhookSecret: "whsec_offlineFixture",
};
const request = (body = "{}", origin = config.siteOrigin) =>
  new Request(`${config.siteOrigin}/api/checkout/access`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body,
  });

test("checkout establishes same-browser access in a separate no-stock preflight response", async () => {
  const nonce = "A".repeat(43);
  const handle = createCheckoutAccessHandler({
    getConfig: () => config,
    readJsonBody,
    allowAttempt: () => true,
    mint: () => nonce,
  });
  const response = await handle(request());
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("Set-Cookie")!,
    /__Host-hive-buyer=.*HttpOnly/,
  );
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ["csrfToken", "ready"]);
  assert.equal(body.ready, true);
  assert.equal(JSON.stringify(body).includes(nonce), false);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(
    (await handle(request('{"orderId":"not-an-access-proof"}'))).status,
    400,
  );
  assert.equal(
    (await handle(request("{}", "https://other.example.test"))).status,
    403,
  );
  const limited = createCheckoutAccessHandler({
    getConfig: () => config,
    readJsonBody,
    allowAttempt: () => false,
  });
  assert.equal((await limited(request())).status, 429);
});
