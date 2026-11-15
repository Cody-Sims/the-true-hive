import assert from "node:assert/strict";
import test from "node:test";
import type { APIContext } from "astro";
import { randomUUID } from "node:crypto";
import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { createRequestFromNodeRequest } from "astro/app/node";
import { PhotoError } from "../../src/server/media/errors.ts";
import {
  readPhotoMultipart,
  readPhotoDelete,
} from "../../src/server/media/input.ts";
import { withPhotoWork } from "../../src/server/media/limit.ts";
import {
  createPhotoRoutes,
  createPublicPhotoRoute,
} from "../../src/server/media/http.ts";
import * as actualPrivateRoute from "../../src/pages/api/admin/products/[key]/photo.ts";

const operationId = randomUUID();
function multipart(changes?: (form: FormData) => void): Request {
  const form = new FormData();
  form.set("operationId", operationId);
  form.set("expectedRevision", "1");
  form.set("alt", "Honey soap");
  form.set("file", new File([new Uint8Array([1, 2, 3])], "private-name.jpg"));
  changes?.(form);
  return new Request(
    "https://inventory.example.test/api/admin/products/soap/photo",
    {
      method: "POST",
      body: form,
    },
  );
}
const status = (expected: number) => (error: unknown) =>
  error instanceof PhotoError && error.status === expected;

test("the configured native adapter admits a maximum-size product photo before multipart validation", async () => {
  const { default: configuration } = await import("../../astro.config.mjs");
  const setup = configuration.adapter?.hooks["astro:config:setup"];
  assert.ok(setup);
  let adapterModule = "";
  await Reflect.apply(setup, undefined, [
    {
      command: "build",
      config: {
        ...configuration,
        build: {},
        image: { endpoint: {} },
      },
      updateConfig(update: {
        vite: {
          plugins: {
            name: string;
            load: { handler: () => string };
          }[];
        };
      }) {
        const plugin = update.vite.plugins.find(
          (entry) => entry.name === "virtual:astro-node:config",
        );
        assert.ok(plugin);
        adapterModule = plugin.load.handler();
      },
    },
  ]);
  const { bodySizeLimit } = await import(
    `data:text/javascript,${encodeURIComponent(adapterModule)}`
  );
  assert.equal(typeof bodySizeLimit, "number");
  assert.ok(Number.isFinite(bodySizeLimit) && bodySizeLimit > 0);
  const original = multipart((form) =>
    form.set(
      "file",
      new File([new Uint8Array(8 * 1024 * 1024)], "large-photo.jpg"),
    ),
  );
  const socket = new Socket();
  const incoming = new IncomingMessage(socket);
  incoming.method = "POST";
  incoming.url = "/api/admin/products/soap/photo";
  incoming.headers = Object.fromEntries(original.headers);
  incoming.push(Buffer.from(await original.arrayBuffer()));
  incoming.push(null);
  try {
    const request = createRequestFromNodeRequest(incoming, { bodySizeLimit });
    const parsed = await readPhotoMultipart(request);
    assert.equal(parsed.file.length, 8 * 1024 * 1024);
    assert.equal(parsed.operationId, operationId);
  } finally {
    incoming.destroy();
    socket.destroy();
  }
});

test("multipart is bounded for content-length and chunked bodies and rejects duplicate or unexpected fields", async () => {
  const parsed = await readPhotoMultipart(multipart());
  assert.equal(parsed.operationId, operationId);
  assert.equal(parsed.expectedRevision, 1);
  assert.equal(parsed.alt, "Honey soap");
  assert.deepEqual(parsed.file, Buffer.from([1, 2, 3]));
  assert.equal("filename" in parsed, false);
  for (const change of [
    (form: FormData) => form.append("alt", "duplicate"),
    (form: FormData) => form.set("bucket", "untrusted"),
    (form: FormData) => form.delete("file"),
    (form: FormData) => form.set("alt", " "),
    (form: FormData) => form.set("expectedRevision", "01"),
  ])
    await assert.rejects(readPhotoMultipart(multipart(change)), status(400));
  const tooLarge = multipart();
  tooLarge.headers.set("content-length", String(9 * 1024 * 1024));
  await assert.rejects(readPhotoMultipart(tooLarge), status(413));
  let canceled = false;
  const chunked = new Request("https://inventory.example.test/upload", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=bounded" },
    body: new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(1024 * 1024));
      },
      cancel() {
        canceled = true;
      },
    }),
    // @ts-expect-error Node requires duplex for a streamed request.
    duplex: "half",
  });
  await assert.rejects(readPhotoMultipart(chunked), status(413));
  assert.equal(canceled, true);
  await assert.rejects(
    readPhotoDelete(
      new Request("https://inventory.example.test/delete", {
        method: "DELETE",
        body: JSON.stringify({ operationId, expectedRevision: 1, photo: null }),
      }),
    ),
    status(400),
  );
});

test("one photo worker rejects busy requests and releases its slot even on failure", async () => {
  let finish!: () => void;
  const held = withPhotoWork(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await assert.rejects(
    withPhotoWork(async () => {}),
    status(429),
  );
  finish();
  await held;
  await assert.rejects(
    withPhotoWork(async () => {
      throw new Error("fixture");
    }),
  );
  assert.equal(await withPhotoWork(async () => "released"), "released");
});

test("every private photo method guards trusted admin context before reading a body, config or pool", async () => {
  const routes = createPhotoRoutes({
    config() {
      throw new Error("Unauthorized configuration access");
    },
    pool() {
      throw new Error("Unauthorized database access");
    },
    storage() {
      throw new Error("Unauthorized storage access");
    },
  });
  for (const method of ["GET", "POST", "DELETE"] as const) {
    const request = multipart();
    Object.defineProperty(request, "body", {
      get() {
        throw new Error("Unauthorized body access");
      },
    });
    const response = await routes[method]({
      request,
      locals: {},
      params: { key: "soap" },
    } as unknown as APIContext);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const actual = await actualPrivateRoute[method]({
      request,
      locals: {},
      params: { key: "soap" },
    } as unknown as APIContext);
    assert.equal(actual.status, 401);
  }
});

test("private previews never cache and public bytes use only short first-party caching with sanitized failures", async () => {
  const photo = { id: operationId, alt: "Soap", width: 2, height: 2, bytes: 3 };
  let reads = 0;
  const dependencies = {
    config() {
      return { enabled: true };
    },
    pool() {
      return {
        async query() {
          return { rows: [{ photo }] };
        },
      } as never;
    },
    storage() {
      return {
        async create() {
          throw new Error("Unexpected upload");
        },
        async read() {
          reads++;
          return Buffer.from([1, 2, 3]);
        },
      };
    },
  };
  const context = {
    request: new Request(
      "https://thetruehive.com/media/products/" + operationId,
    ),
    params: { id: operationId, key: "soap" },
    locals: { admin: { uid: "fixture", actorId: "operator:fixture" } },
  } as unknown as APIContext;
  const preview = await createPhotoRoutes(dependencies).GET(context);
  const published = await createPublicPhotoRoute({
    ...dependencies,
    catalogSource() {
      return "database";
    },
  })(context);
  assert.equal(preview.headers.get("cache-control"), "no-store");
  assert.equal(published.headers.get("cache-control"), "public, max-age=60");
  for (const response of [preview, published]) {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/webp");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("content-disposition"), null);
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      Buffer.from([1, 2, 3]),
    );
  }
  assert.equal(reads, 2);
  const failure = await createPublicPhotoRoute({
    ...dependencies,
    catalogSource() {
      return "database";
    },
    storage() {
      throw new Error("private-service-account-bucket-details");
    },
  })(context);
  assert.equal(failure.status, 503);
  assert.equal((await failure.text()).includes("service-account"), false);
});

test(
  "overlapping valid public image GETs both succeed instead of rejecting an ordinary parallel read",
  { timeout: 5000 },
  async () => {
    const photo = {
      id: operationId,
      alt: "Soap",
      width: 2,
      height: 2,
      bytes: 3,
    };
    const firstStarted = Promise.withResolvers<void>();
    const secondStarted = Promise.withResolvers<void>();
    const finishReads = Promise.withResolvers<void>();
    let reads = 0;
    const route = createPublicPhotoRoute({
      config: () => ({ enabled: true }),
      catalogSource: () => "database",
      pool: () =>
        ({
          async query() {
            return { rows: [{ photo }] };
          },
        }) as never,
      storage: () => ({
        async create() {
          throw new Error("Unexpected upload");
        },
        async read() {
          reads++;
          if (reads === 1) firstStarted.resolve();
          if (reads === 2) secondStarted.resolve();
          await finishReads.promise;
          return Buffer.from([1, 2, 3]);
        },
      }),
    });
    const context = {
      request: new Request(
        `https://thetruehive.com/media/products/${operationId}`,
      ),
      params: { id: operationId },
      locals: {},
    } as unknown as APIContext;
    const first = route(context);
    let second: ReturnType<typeof route> | undefined;
    try {
      await firstStarted.promise;
      second = route(context);
      await Promise.race([secondStarted.promise, second]);
    } finally {
      finishReads.resolve();
    }
    assert.deepEqual(
      (await Promise.all([first, second!])).map((response) => response.status),
      [200, 200],
    );
  },
);

test("public and admin image downloads do not consume or wait for the single rejecting upload slot", async () => {
  const photo = { id: operationId, alt: "Soap", width: 2, height: 2, bytes: 3 };
  const dependencies = {
    config: () => ({ enabled: true }),
    pool: () =>
      ({
        async query() {
          return { rows: [{ photo }] };
        },
      }) as never,
    storage: () => ({
      async create() {
        throw new Error("Unexpected upload");
      },
      async read() {
        return Buffer.from([1, 2, 3]);
      },
    }),
  };
  const context = {
    request: new Request(
      `https://thetruehive.com/media/products/${operationId}`,
    ),
    params: { id: operationId, key: "soap" },
    locals: { admin: { uid: "fixture", actorId: "operator:fixture" } },
  } as unknown as APIContext;
  await withPhotoWork(async () => {
    const responses = await Promise.all([
      createPublicPhotoRoute({
        ...dependencies,
        catalogSource: () => "database",
      })(context),
      createPhotoRoutes(dependencies).GET(context),
    ]);
    assert.deepEqual(
      responses.map((response) => response.status),
      [200, 200],
    );
    await assert.rejects(
      withPhotoWork(async () => {}),
      status(429),
    );
  });
});

test("DELETE changes only the audited reference and never constructs a storage client", async () => {
  const photo = { id: operationId, alt: "Soap", width: 2, height: 2, bytes: 3 };
  const routes = createPhotoRoutes({
    config() {
      return { enabled: true };
    },
    pool() {
      return {
        async connect() {
          return {
            async query(sql: string) {
              return {
                rows: sql.includes("FROM products")
                  ? [{ revision: 4, photo }]
                  : [],
              };
            },
            release() {},
          };
        },
      } as never;
    },
    storage() {
      throw new Error("Deletion must not delete an object.");
    },
  });
  const response = await routes.DELETE({
    locals: { admin: { uid: "fixture", actorId: "operator:fixture" } },
    params: { key: "soap" },
    request: new Request(
      "https://inventory.example.test/api/admin/products/soap/photo",
      {
        method: "DELETE",
        body: JSON.stringify({
          operationId: randomUUID(),
          expectedRevision: 4,
        }),
      },
    ),
  } as unknown as APIContext);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    productKey: "soap",
    revision: 5,
    photo: null,
  });
});

test("public photo route rejects showcase and unpublished images before constructing storage", async () => {
  let reads = 0;
  const route = createPublicPhotoRoute({
    config() {
      return { enabled: true };
    },
    catalogSource() {
      return "showcase";
    },
    pool() {
      throw new Error("Showcase accessed a database");
    },
    storage() {
      throw new Error("Private image reached storage");
    },
  });
  const context = {
    request: new Request(
      "https://thetruehive.com/media/products/" + operationId,
    ),
    params: { id: operationId },
    locals: {},
  } as unknown as APIContext;
  assert.equal((await route(context)).status, 404);
  const database = createPublicPhotoRoute({
    config() {
      return { enabled: true };
    },
    catalogSource() {
      return "database";
    },
    pool() {
      return {
        async query() {
          reads++;
          return { rows: [] };
        },
      } as never;
    },
    storage() {
      throw new Error("Unpublished image reached storage");
    },
  });
  assert.equal((await database(context)).status, 404);
  assert.equal(reads, 1);
});
