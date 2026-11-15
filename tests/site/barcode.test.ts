import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import type { APIContext } from "astro";
import type { Pool } from "pg";
import sharp from "sharp";
import {
  createBarcodeRoute,
  renderSkuBarcode,
} from "../../src/server/barcodes.ts";
import type { AdminConfig } from "../../src/server/admin/config.ts";
import {
  createAdminAuth,
  type AuthDependencies,
} from "../../src/server/auth/service.ts";
import {
  createAdminBoundary,
  cookieNames,
  type AdminLocals,
} from "../../src/server/auth/http.ts";

const require = createRequire(import.meta.url);
const {
  MultiFormatReader,
  BinaryBitmap,
  HybridBinarizer,
  RGBLuminanceSource,
  BarcodeFormat,
} = require("@zxing/library");
const origin = "https://inventory.example.invalid";
const config: AdminConfig = {
  enabled: true,
  origin,
  secureCookies: true,
  databaseUrl: null,
  csrfSecret: randomBytes(32).toString("base64"),
  projectId: "hive-test",
  apiKey: "fixture-public",
  serviceAccount: null,
};
function context(key = "fixture-oval", admin = true, host = origin) {
  return {
    params: { key },
    request: new Request(
      `${host}/api/admin/variants/${key}/barcode.svg?text=WRONG&scale=1`,
    ),
    locals: admin
      ? { admin: { uid: "fixture", actorId: "fixture-owner" } }
      : {},
  } as unknown as APIContext;
}
async function decode(svg: string) {
  const { data, info } = await sharp(Buffer.from(svg))
    .flatten({ background: "white" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const source = new RGBLuminanceSource(
    new Uint8ClampedArray(data),
    info.width,
    info.height,
  );
  const barRow = data.subarray(
    Math.floor(info.height / 3) * info.width,
    (Math.floor(info.height / 3) + 1) * info.width,
  );
  assert.ok(barRow.indexOf(0) >= 30, "left white quiet zone");
  assert.ok(
    barRow.length - 1 - barRow.lastIndexOf(0) >= 30,
    "right white quiet zone",
  );
  const result = new MultiFormatReader().decode(
    new BinaryBitmap(new HybridBinarizer(source)),
    new Map(),
  );
  assert.equal(result.getBarcodeFormat(), BarcodeFormat.CODE_128);
  return result.getText();
}

test("private route returns an independently decodable exact stored SKU, never caller options", async () => {
  const sku = '  Fixture<&"^FNC1-09  ';
  let queries = 0;
  const route = createBarcodeRoute({
    config: () => config,
    pool: () =>
      ({
        query: async (sql: string, values: unknown[]) => {
          queries++;
          assert.match(sql, /FROM product_variants WHERE variant_key=\$1/);
          assert.deepEqual(values, ["fixture-oval"]);
          return { rows: [{ sku }] };
        },
      }) as unknown as Pool,
  });
  const response = await route(context());
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type")!, /^image\/svg\+xml/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("x-robots-tag")!, /noindex/);
  const svg = await response.text();
  assert.equal(await decode(svg), sku);
  assert.ok(svg.length < 200000);
  assert.doesNotMatch(
    svg,
    /<script|<image|<foreignObject|https?:\/\/(?!www.w3.org)/i,
  );
  assert.equal(queries, 1);
});

test("barcode renderer preserves printable ASCII including maximum length and rejects unsupported input", async () => {
  for (const sku of [
    "FIXTURE-OVAL-01",
    "x".repeat(128),
    String.fromCharCode(...Array.from({ length: 95 }, (_, i) => i + 32)),
  ]) {
    assert.equal(await decode(renderSkuBarcode(sku)), sku);
  }
  for (const sku of [
    "",
    "x".repeat(129),
    "line\nbreak",
    "tab\t",
    "null\0",
    "\x7f",
    "café",
    "蜂",
    "\ud800",
  ]) {
    assert.throws(() => renderSkuBarcode(sku), /1.*128.*printable ASCII/i);
  }
});

test("authorization and stable-key validation precede acquiring a pool", async () => {
  let pools = 0;
  const route = createBarcodeRoute({
    config: () => config,
    pool: () => {
      pools++;
      throw new Error("never acquire");
    },
  });
  assert.equal((await route(context("fixture", false))).status, 401);
  assert.equal(
    (await route(context("fixture", true, "https://shop.example.invalid")))
      .status,
    404,
  );
  assert.equal((await route(context("bad'key"))).status, 400);
  assert.equal(pools, 0);
});

test("missing, unsupported stored SKUs and unavailable data return bounded safe errors", async () => {
  for (const [rows, status] of [
    [[], 404],
    [[{ sku: "bad\nsku" }], 422],
  ] as const) {
    const route = createBarcodeRoute({
      config: () => config,
      pool: () => ({ query: async () => ({ rows }) }) as unknown as Pool,
    });
    const response = await route(context());
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.ok((await response.text()).length < 200);
  }
  const route = createBarcodeRoute({
    config: () => config,
    pool: () => {
      throw new Error("postgres://secret SQL SELECT");
    },
  });
  const response = await route(context());
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /postgres|secret|SELECT/);
});

test("the existing host/member/TOTP boundary blocks private images before the route pool", async () => {
  const now = 1800000000000;
  for (const scenario of [
    "storefront",
    "default-host",
    "no-session",
    "nonmember",
    "no-mfa",
    "revoked",
    "authorized",
  ] as const) {
    let pools = 0;
    const identity = {
      uid: "fixture-owner",
      aud: "hive-test",
      iss: "https://session.firebase.google.com/hive-test",
      email_verified: true,
      auth_time: now / 1000,
      firebase: {
        sign_in_provider: "google.com",
        ...(scenario === "no-mfa" ? {} : { sign_in_second_factor: "totp" }),
      },
    };
    const dependencies: AuthDependencies = {
      verifyIdToken: async () => identity,
      verifySessionCookie: async () => identity,
      createSessionCookie: async () => "unused-fixture",
      isMember: async () => scenario !== "nonmember",
      isSessionActive: async () => scenario !== "revoked",
      saveSession: async () => {},
      revokeSession: async () => {},
    };
    const boundary = createAdminBoundary(
      config,
      createAdminAuth(config, dependencies, () => now),
    );
    const host =
      scenario === "storefront"
        ? "https://shop.example.invalid"
        : scenario === "default-host"
          ? "https://hive.onrender.com"
          : origin;
    const request = new Request(
      `${host}/api/admin/variants/fixture-oval/barcode.svg`,
      {
        headers:
          scenario === "no-session"
            ? {}
            : { cookie: `${cookieNames(config).session}=fixture-session` },
      },
    );
    const locals: AdminLocals = {};
    const gate = await boundary.gate(request, locals);
    const route = createBarcodeRoute({
      config: () => config,
      pool: () => {
        pools++;
        return {
          query: async () => ({ rows: [{ sku: "PRIVATE-DRAFT-FIXTURE" }] }),
        } as unknown as Pool;
      },
    });
    const response =
      gate.response ??
      (await route({
        request,
        locals,
        params: { key: "fixture-oval" },
      } as unknown as APIContext));
    assert.equal(
      response.status,
      scenario === "authorized"
        ? 200
        : scenario === "storefront" || scenario === "default-host"
          ? 404
          : scenario === "no-mfa"
            ? 403
            : 401,
      scenario,
    );
    assert.equal(pools, scenario === "authorized" ? 1 : 0, scenario);
    if (scenario !== "authorized")
      assert.doesNotMatch(await response.text(), /PRIVATE-DRAFT-FIXTURE|<svg/);
  }
});
