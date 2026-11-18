import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createCheckoutAccessHandler } from "../../src/pages/api/checkout/access.ts";
import { createCheckoutHandler } from "../../src/pages/api/checkout.ts";
import { readJsonBody } from "../../src/server/http-input.ts";
import { readBuyerAccess } from "../../src/server/pickup/access.ts";

test("checkout cannot call reservation authority until preflight cookie and CSRF have been verified", async () => {
  const config = {
    mode: "stripe-test" as const,
    locationKey: "test-stock",
    siteOrigin: "https://shop.example.test",
    secretKey: "sk_test_offlineFixture",
    webhookSecret: "whsec_offlineFixture",
  };
  let calls = 0;
  let receivedHash: string | undefined;
  const handle = createCheckoutHandler({
    getConfig: () => config,
    readJsonBody,
    allowAttempt: () => true,
    getServices: async () => ({
      async createCheckout(_input, buyerHash?: string) {
        calls++;
        receivedHash = buyerHash;
        return {
          checkoutUrl:
            "https://checkout.stripe.com/c/pay/cs_test_offlineFixture",
        };
      },
    }),
  });
  const intent = {
    operationId: randomUUID(),
    lines: [{ variantKey: "test-bar", quantity: 1 }],
  };
  const request = (headers: Record<string, string> = {}) =>
    new Request(`${config.siteOrigin}/api/checkout`, {
      method: "POST",
      headers: {
        Origin: config.siteOrigin,
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(intent),
    });
  assert.equal((await handle(request())).status, 428);
  assert.equal(calls, 0);
  const init = createCheckoutAccessHandler({
    getConfig: () => config,
    readJsonBody,
    allowAttempt: () => true,
  });
  const access = await init(
    new Request(`${config.siteOrigin}/api/checkout/access`, {
      method: "POST",
      headers: {
        Origin: config.siteOrigin,
        "Content-Type": "application/json",
      },
      body: "{}",
    }),
  );
  const cookie = access.headers.get("Set-Cookie")!.split(";")[0]!;
  const { csrfToken } = await access.json();
  assert.equal((await handle(request({ Cookie: cookie }))).status, 403);
  assert.equal(calls, 0);
  assert.equal(
    (await handle(request({ Cookie: cookie, "X-Pickup-CSRF": csrfToken })))
      .status,
    200,
  );
  assert.equal(calls, 1);
  assert.equal(
    receivedHash,
    readBuyerAccess(request({ Cookie: cookie }), config.siteOrigin)!.hash,
  );
});
