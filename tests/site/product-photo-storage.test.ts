import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { createGcsPhotoStorage } from "../../src/server/media/storage.ts";
import { readProductImagesConfig } from "../../src/server/media/config.ts";
import { PhotoError } from "../../src/server/media/errors.ts";

const config = readProductImagesConfig({
  PRODUCT_IMAGES_ENABLED: "true",
  PRODUCT_IMAGES_PROJECT_ID: "fixture-storage",
  PRODUCT_IMAGES_BUCKET: "fixture-isolated-photos",
  PRODUCT_IMAGES_SERVICE_ACCOUNT_JSON: JSON.stringify({
    type: "service_account",
    project_id: "fixture-storage",
    client_email: "photos@fixture-storage.iam.gserviceaccount.com",
    private_key:
      "-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----\n",
  }),
});
const id = "078c36d4-8ad1-4638-956f-90ce38d60952";
const hash = "a".repeat(64);
const normalized = {
  width: 20,
  height: 10,
  bytes: 3,
  data: Buffer.from([1, 2, 3]),
};
const photo = { id, alt: "Soap", width: 20, height: 10, bytes: 3 };
function fixture() {
  const calls: { name: string; args: unknown[] }[] = [];
  let collision = false;
  const metadata = {
    size: "3",
    generation: "7",
    contentType: "image/webp",
    metadata: {
      fingerprint: hash,
      schema: "true-hive-product-photo-v1",
      width: "20",
      height: "10",
      bytes: "3",
    },
  };
  const file = {
    async save(...args: unknown[]) {
      calls.push({ name: "save", args });
      if (collision)
        throw Object.assign(new Error("private SDK message"), { code: 412 });
    },
    async getMetadata() {
      calls.push({ name: "metadata", args: [] });
      return [metadata];
    },
    createReadStream(...args: unknown[]) {
      calls.push({ name: "read", args });
      return Readable.from([Buffer.from([1, 2, 3])]);
    },
  };
  const client = {
    bucket(...args: unknown[]) {
      calls.push({ name: "bucket", args });
      return {
        file(...args: unknown[]) {
          calls.push({ name: "file", args });
          return file;
        },
      };
    },
  };
  return {
    storage: createGcsPhotoStorage(config, client as never),
    calls,
    metadata,
    collide() {
      collision = true;
    },
  };
}

test("GCS creates only deterministic private objects with fingerprint metadata and generation-match zero", async () => {
  const { storage, calls } = fixture();
  assert.deepEqual(await storage.create(id, hash, normalized), {
    width: 20,
    height: 10,
    bytes: 3,
  });
  assert.deepEqual(calls.find((call) => call.name === "bucket")?.args, [
    "fixture-isolated-photos",
  ]);
  assert.deepEqual(calls.find((call) => call.name === "file")?.args, [
    `product-images/${id}.webp`,
  ]);
  const options = calls.find((call) => call.name === "save")?.args[1] as {
    preconditionOpts: unknown;
    metadata: { metadata: { fingerprint: string } };
  };
  assert.deepEqual(options.preconditionOpts, { ifGenerationMatch: 0 });
  assert.equal(options.metadata.metadata.fingerprint, hash);
});

test("a create-only collision reuses validated stored dimensions across encoder changes but refuses a different intent", async () => {
  const { storage, metadata, collide } = fixture();
  collide();
  assert.deepEqual(
    await storage.create(id, hash, {
      ...normalized,
      width: 19,
      bytes: 7,
      data: Buffer.from("changed"),
    }),
    {
      width: 20,
      height: 10,
      bytes: 3,
    },
  );
  metadata.metadata.fingerprint = "b".repeat(64);
  await assert.rejects(
    storage.create(id, hash, normalized),
    (error: unknown) =>
      error instanceof PhotoError &&
      error.status === 409 &&
      !error.message.includes("SDK"),
  );
});

test("downloads validate bounded stored metadata before reading and pin the trusted object generation", async () => {
  const { storage, calls, metadata } = fixture();
  assert.deepEqual(await storage.read(photo), Buffer.from([1, 2, 3]));
  assert(
    calls.some(
      (call) =>
        call.name === "file" &&
        JSON.stringify(call.args).includes('"generation":"7"'),
    ),
  );
  metadata.size = String(4 * 1024 * 1024 + 1);
  calls.length = 0;
  await assert.rejects(
    storage.read(photo),
    (error: unknown) => error instanceof PhotoError && error.status === 503,
  );
  assert.equal(
    calls.some((call) => call.name === "read"),
    false,
  );
  await assert.rejects(storage.read({ ...photo, id: "../../private" }));
});
