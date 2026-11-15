import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  ProductImagesConfigurationError,
  readProductImagesConfig,
} from "../../src/server/media/config.ts";
import { normalizeProductPhoto } from "../../src/server/media/normalize.ts";
import { PhotoError } from "../../src/server/media/errors.ts";
import { getCatalog } from "../../src/server/catalog.ts";
import { getAdminProduct } from "../../src/server/admin/catalog.ts";
import { readConfig } from "../../src/server/config.ts";
import type { Pool } from "pg";
import { crc32 } from "node:zlib";

const credentials = JSON.stringify({
  type: "service_account",
  project_id: "existing-storage-project",
  client_email: "photos@existing-storage-project.iam.gserviceaccount.com",
  private_key:
    "-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----\n",
});
const environment = {
  PRODUCT_IMAGES_ENABLED: "true",
  PRODUCT_IMAGES_PROJECT_ID: "existing-storage-project",
  PRODUCT_IMAGES_BUCKET: "true-hive-isolated-photos",
  PRODUCT_IMAGES_SERVICE_ACCOUNT_JSON: credentials,
  FIREBASE_PROJECT_ID: "separate-auth-project",
};
const status = (value: number) => (error: unknown) =>
  error instanceof PhotoError && error.status === value;

test("disabled photo storage ignores credentials; enabled storage binds only to its own project", () => {
  assert.equal(
    readProductImagesConfig({
      PRODUCT_IMAGES_SERVICE_ACCOUNT_JSON: "not-json",
    }).enabled,
    false,
  );
  const config = readProductImagesConfig(environment);
  assert.equal(config.enabled, true);
  assert.equal(config.projectId, "existing-storage-project");
  assert.throws(
    () =>
      readProductImagesConfig({
        ...environment,
        PRODUCT_IMAGES_PROJECT_ID: "wrong-project",
      }),
    ProductImagesConfigurationError,
  );
  assert.throws(
    () =>
      readProductImagesConfig({
        PRODUCT_IMAGES_ENABLED: "true",
        GOOGLE_APPLICATION_CREDENTIALS: "personal-key.json",
      }),
    ProductImagesConfigurationError,
  );
  assert.throws(
    () => readProductImagesConfig({ PRODUCT_IMAGES_ENABLED: "yes" }),
    ProductImagesConfigurationError,
  );
});

test("normalization autorotates, bounds dimensions, emits only metadata-free WebP without enlargement", async () => {
  const input = await sharp({
    create: { width: 2400, height: 1200, channels: 3, background: "#ac7711" },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  const normalized = await normalizeProductPhoto(input);
  assert.equal(normalized.width, 1024);
  assert.equal(normalized.height, 2048);
  assert.equal(normalized.bytes, normalized.data.length);
  assert(normalized.bytes <= 4 * 1024 * 1024);
  const metadata = await sharp(normalized.data).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
  assert.equal(metadata.xmp, undefined);
  const small = await sharp({
    create: { width: 31, height: 19, channels: 4, background: "#ac7711" },
  })
    .png()
    .toBuffer();
  assert.equal((await normalizeProductPhoto(small)).width, 31);
});

test("normalization rejects SVG, malformed input, multipage GIF and pixel bombs with controlled errors", async () => {
  for (const input of [
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
    ),
    Buffer.from("not an image"),
    Buffer.from(
      "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      "base64",
    ),
  ])
    await assert.rejects(normalizeProductPhoto(input), status(415));
  await assert.rejects(
    normalizeProductPhoto(Buffer.alloc(8 * 1024 * 1024 + 1)),
    status(413),
  );
  const bomb = await sharp({
    create: { width: 5001, height: 5000, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  await assert.rejects(normalizeProductPhoto(bomb), status(413));
  const animated = await sharp({
    create: {
      width: 2,
      height: 4,
      channels: 3,
      background: "#ffffff",
      pageHeight: 2,
    },
  })
    .composite([
      {
        input: {
          create: { width: 2, height: 2, channels: 3, background: "#aa0000" },
        },
        top: 2,
        left: 0,
      },
    ])
    .webp({ loop: 0 })
    .toBuffer();
  assert.equal((await sharp(animated, { animated: true }).metadata()).pages, 2);
  await assert.rejects(normalizeProductPhoto(animated), status(415));
});

test("catalog DTOs include only safe photo fields and omit absent photos", async () => {
  const photo = {
    id: "078c36d4-8ad1-4638-956f-90ce38d60952",
    alt: "Soap",
    width: 100,
    height: 80,
    bytes: 1000,
  };
  const row = {
    key: "soap",
    slug: "soap",
    title: "Soap",
    summary: "Soap",
    details: [],
    category: "soap",
    imageKey: "soap",
    kind: "active",
    revision: 1,
    status: "published",
    variants: [],
    photo: { ...photo, bucket: "private-bucket", objectPath: "private/path" },
  };
  const pool = {
    async query() {
      return { rows: [row] };
    },
  } as unknown as Pool;
  assert.deepEqual(
    (await getCatalog(readConfig({ CATALOG_SOURCE: "database" }), pool))
      .products[0]?.photo,
    photo,
  );
  assert.deepEqual((await getAdminProduct(pool, "soap"))?.photo, photo);
  row.kind = "concept";
  assert.equal(
    "photo" in
      (await getCatalog(readConfig({ CATALOG_SOURCE: "database" }), pool))
        .products[0]!,
    false,
  );
  row.kind = "active";
  row.photo = null as never;
  assert.equal("photo" in (await getAdminProduct(pool, "soap"))!, false);
  assert.equal(
    "photo" in
      (await getCatalog(readConfig({ CATALOG_SOURCE: "database" }), pool))
        .products[0]!,
    false,
  );
});

test("APNG animation is rejected even when the decoder reports only its first frame", async () => {
  const png = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  const other = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "#aa0000" },
  })
    .png()
    .toBuffer();
  function chunks(
    buffer: Buffer,
  ): { type: string; data: Buffer; raw: Buffer }[] {
    const result = [];
    for (let offset = 8; offset < buffer.length;) {
      const length = buffer.readUInt32BE(offset);
      result.push({
        type: buffer.toString("ascii", offset + 4, offset + 8),
        data: buffer.subarray(offset + 8, offset + 8 + length),
        raw: buffer.subarray(offset, offset + length + 12),
      });
      offset += length + 12;
    }
    return result;
  }
  function chunk(type: string, data: Buffer) {
    const buffer = Buffer.alloc(data.length + 12);
    buffer.writeUInt32BE(data.length);
    buffer.write(type, 4, "ascii");
    data.copy(buffer, 8);
    buffer.writeUInt32BE(crc32(buffer.subarray(4, -4)), buffer.length - 4);
    return buffer;
  }
  function frame(sequence: number) {
    const data = Buffer.alloc(26);
    data.writeUInt32BE(sequence);
    data.writeUInt32BE(2, 4);
    data.writeUInt32BE(2, 8);
    data.writeUInt16BE(1, 20);
    data.writeUInt16BE(10, 22);
    return chunk("fcTL", data);
  }
  const first = chunks(png);
  const control = Buffer.alloc(8);
  control.writeUInt32BE(2);
  const secondData = Buffer.concat(
    chunks(other)
      .filter((entry) => entry.type === "IDAT")
      .map((entry) => entry.data),
  );
  const sequence = Buffer.alloc(4);
  sequence.writeUInt32BE(2);
  const animated = Buffer.concat([
    png.subarray(0, 8),
    first.find((entry) => entry.type === "IHDR")!.raw,
    chunk("acTL", control),
    frame(0),
    ...first.filter((entry) => entry.type === "IDAT").map((entry) => entry.raw),
    frame(1),
    chunk("fdAT", Buffer.concat([sequence, secondData])),
    first.find((entry) => entry.type === "IEND")!.raw,
  ]);
  await assert.rejects(normalizeProductPhoto(animated), status(415));
});

test("JPEG multi-picture containers are rejected instead of silently decoding their first picture", async () => {
  const jpeg = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "#ffffff" },
  })
    .jpeg()
    .toBuffer();
  const index = Buffer.from([0xff, 0xe2, 0, 6, 0x4d, 0x50, 0x46, 0]);
  const container = Buffer.concat([
    jpeg.subarray(0, 2),
    index,
    jpeg.subarray(2),
    jpeg,
  ]);
  await assert.rejects(normalizeProductPhoto(container), status(415));
});
