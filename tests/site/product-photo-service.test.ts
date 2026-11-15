import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import type { Pool } from "pg";
import { attachProductPhoto } from "../../src/server/media/service.ts";
import { makePhotoIntent } from "../../src/server/media/persistence.ts";
import type { PhotoStorage } from "../../src/server/media/storage.ts";
import { PhotoError } from "../../src/server/media/errors.ts";

const operationId = "078c36d4-8ad1-4638-956f-90ce38d60952";
const actor = "operator:fixture";
const photo = {
  id: operationId,
  alt: "Soap",
  width: 20,
  height: 10,
  bytes: 42,
};
const input = {
  operationId,
  expectedRevision: 1,
  alt: "Soap",
  file: Buffer.from("original"),
};

test("an exact committed upload retry returns its original receipt without decoding or constructing storage", async () => {
  const intent = makePhotoIntent("soap", actor, input);
  const receipt = { productKey: "soap", revision: 2, photo };
  const pool = {
    async query() {
      return {
        rows: [
          {
            actor_key: actor,
            action: intent.action,
            resource_key: "soap",
            request_hash: intent.hash,
            result: receipt,
          },
        ],
      };
    },
  } as unknown as Pool;
  assert.deepEqual(
    await attachProductPhoto(
      pool,
      () => {
        throw new Error("Committed retry reached storage.");
      },
      "soap",
      input,
      actor,
    ),
    receipt,
  );
});

test("object-created/DB-not-recorded retry uses trusted stored normalization and keeps network outside transactions", async () => {
  const events: string[] = [];
  const file = await sharp({
    create: { width: 30, height: 20, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  const client = {
    async query(sql: string) {
      events.push(sql);
      if (sql.includes("FROM admin_operations")) return { rows: [] };
      if (sql.includes("FROM products"))
        return { rows: [{ revision: 1, photo: null }] };
      return { rows: [] };
    },
    release() {},
  };
  const pool = {
    query: client.query,
    async connect() {
      events.push("connect");
      return client;
    },
  } as unknown as Pool;
  const storage: PhotoStorage = {
    async create(id, hash) {
      assert.equal(id, operationId);
      assert.match(hash, /^[0-9a-f]{64}$/);
      assert.equal(events.includes("BEGIN"), false);
      events.push("storage");
      return { width: 20, height: 10, bytes: 42 };
    },
    async read() {
      throw new Error("Unexpected read");
    },
  };
  const receipt = await attachProductPhoto(
    pool,
    () => storage,
    "soap",
    { ...input, file },
    actor,
  );
  assert.deepEqual(receipt, { productKey: "soap", revision: 2, photo });
  assert(events.indexOf("storage") < events.indexOf("BEGIN"));
});

test("stale upload rejects before storage and provider errors are sanitized", async () => {
  const pool = {
    async query(sql: string) {
      return {
        rows: sql.includes("admin_operations") ? [] : [{ revision: 2 }],
      };
    },
  } as unknown as Pool;
  await assert.rejects(
    attachProductPhoto(
      pool,
      () => {
        throw new Error("Should never construct storage");
      },
      "soap",
      input,
      actor,
    ),
    (error: unknown) => error instanceof PhotoError && error.status === 409,
  );
  const validPool = {
    async query(sql: string) {
      return {
        rows: sql.includes("admin_operations") ? [] : [{ revision: 1 }],
      };
    },
  } as unknown as Pool;
  const file = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  await assert.rejects(
    attachProductPhoto(
      validPool,
      () => ({
        async create() {
          throw new Error("private-bucket-path-and-credential-detail");
        },
        async read() {
          throw new Error("Unexpected read");
        },
      }),
      "soap",
      { ...input, file },
      actor,
    ),
    (error: unknown) =>
      error instanceof PhotoError &&
      error.status === 503 &&
      !error.message.includes("credential"),
  );
});
