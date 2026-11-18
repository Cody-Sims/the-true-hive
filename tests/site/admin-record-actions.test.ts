import assert from "node:assert/strict";
import test from "node:test";
import { DELETE as deleteProduct } from "../../src/pages/api/admin/products/[key].ts";
import { DELETE as deleteVariant } from "../../src/pages/api/admin/products/[key]/variants/[variantKey].ts";

test("native deletion endpoints reject forged actor bodies before opening any runtime database", async () => {
  for (const handler of [deleteProduct, deleteVariant]) {
    const response = await handler({
      locals: {},
      params: { key: "test-product", variantKey: "test-variant" },
      request: new Request(
        "https://inventory.example.test/api/admin/products/test-product",
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actorId: "operator:forged",
            operationId: "not-an-authority",
            expectedRevision: 1,
          }),
        },
      ),
    } as unknown as Parameters<typeof handler>[0]);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "UNAUTHORIZED");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
});
