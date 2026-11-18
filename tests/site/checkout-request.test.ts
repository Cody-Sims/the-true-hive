import assert from "node:assert/strict";
import test from "node:test";
import { requestCheckout } from "../../src/client/checkout-request.ts";

test("checkout client establishes access before sending the unchanged frozen intent and never stores its token", async () => {
  const calls: { url: string; input: RequestInit | undefined }[] = [];
  const csrf = "A".repeat(43);
  const body =
    '{"operationId":"frozen-id","lines":[{"variantKey":"test-bar","quantity":1}]}';
  const controller = new AbortController();
  const send: typeof fetch = async (url, input) => {
    calls.push({ url: String(url), input });
    return new Response(
      JSON.stringify(
        calls.length === 1
          ? { ready: true, csrfToken: csrf }
          : {
              checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_fixture",
            },
      ),
      { status: 200 },
    );
  };
  const response = await requestCheckout(body, {
    fetch: send,
    signal: controller.signal,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(
    calls.map((call) => call.url),
    ["/api/checkout/access", "/api/checkout"],
  );
  assert.equal(calls[0]!.input?.body, "{}");
  assert.equal(calls[1]!.input?.body, body);
  assert.equal(
    new Headers(calls[1]!.input?.headers).get("X-Pickup-CSRF"),
    csrf,
  );
  for (const call of calls) {
    assert.equal(call.input?.credentials, "same-origin");
    assert.equal(call.input?.redirect, "error");
    assert.equal(call.input?.cache, "no-store");
    assert.equal(call.input?.signal, controller.signal);
  }
});

test("checkout client never sends an order when access is rejected or unverified", async () => {
  let calls = 0;
  const limited: typeof fetch = async () => {
    calls++;
    return new Response('{"error":{"code":"CHECKOUT_RATE_LIMITED"}}', {
      status: 429,
    });
  };
  assert.equal(
    (await requestCheckout("frozen", { fetch: limited })).status,
    429,
  );
  assert.equal(calls, 1);
  calls = 0;
  const malformed: typeof fetch = async () => {
    calls++;
    return new Response('{"ready":true}');
  };
  await assert.rejects(requestCheckout("frozen", { fetch: malformed }));
  assert.equal(calls, 1);
});
