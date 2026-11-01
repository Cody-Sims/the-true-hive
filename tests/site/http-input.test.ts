import test from "node:test";
import assert from "node:assert/strict";
import {
  HttpInputError,
  readJsonBody,
  readRawBody,
} from "../../src/server/http-input.ts";

function streamRequest(chunks: string[], headers = {}) {
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      const chunk = chunks.shift();
      if (chunk === undefined) controller.close();
      else controller.enqueue(new TextEncoder().encode(chunk));
    },
    cancel() {
      cancelled = true;
    },
  });
  return {
    request: new Request("https://inventory.example/api/admin/session", {
      method: "POST",
      headers,
      body,
      duplex: "half",
    } as RequestInit),
    cancelled: () => cancelled,
  };
}

test("bounded raw reading rejects actual streamed bytes even with a lying length", async () => {
  const fixture = streamRequest(["1234", "5678", "unread"], {
    "content-length": "1",
  });
  await assert.rejects(
    readRawBody(fixture.request, 6),
    (error: unknown) => error instanceof HttpInputError && error.status === 413,
  );
  assert.equal(fixture.cancelled(), true);
});

test("JSON accepts a boundary-sized multibyte body, returns untrusted unknown", async () => {
  const input = '{"name":"蜂"}';
  const fixture = streamRequest([input]);
  assert.deepEqual(
    await readJsonBody(fixture.request, Buffer.byteLength(input)),
    { name: "蜂" },
  );
});

test("invalid JSON and malformed UTF-8 have safe errors", async () => {
  for (const body of ["{", Buffer.from([0xff])]) {
    await assert.rejects(
      readJsonBody(
        new Request("https://inventory.example", { method: "POST", body }),
      ),
      (error: unknown) =>
        error instanceof HttpInputError && error.code === "INVALID_JSON",
    );
  }
});

test("declared oversize is rejected without reading and empty raw body is allowed", async () => {
  await assert.rejects(
    readRawBody(streamRequest(["x"], { "content-length": "99" }).request, 10),
    HttpInputError,
  );
  assert.equal(
    (await readRawBody(new Request("https://example.com"))).length,
    0,
  );
});
