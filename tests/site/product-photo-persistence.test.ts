import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import {
  commitPhotoOperation,
  makePhotoIntent,
} from "../../src/server/media/persistence.ts";
import { PhotoError } from "../../src/server/media/errors.ts";
import { checkAdminDatabaseAccess } from "../../src/server/auth/persistence.ts";

const id = "078c36d4-8ad1-4638-956f-90ce38d60952";
const photo = { id, alt: "Soap", width: 100, height: 80, bytes: 300 };
const input = {
  operationId: id,
  expectedRevision: 4,
  alt: "Soap",
  file: Buffer.from("original bytes"),
};
const intent = () => makePhotoIntent("soap", "operator:fixture", input);

function fixture(
  options: {
    recorded?: object;
    revision?: number;
    failAudit?: boolean;
    uncertainCommit?: boolean;
  } = {},
) {
  const queries: { sql: string; values: unknown[] }[] = [];
  let discarded = false;
  const client = {
    async query(sql: string, values: unknown[] = []) {
      queries.push({ sql, values });
      if (sql.includes("FROM admin_operations"))
        return { rows: options.recorded ? [options.recorded] : [] };
      if (sql.includes("FROM products"))
        return { rows: [{ revision: options.revision ?? 4, photo: null }] };
      if (sql.startsWith("INSERT INTO admin_operations") && options.failAudit)
        throw new Error("Private audit error");
      if (sql === "COMMIT" && options.uncertainCommit)
        throw new Error("Lost DB acknowledgement");
      return { rows: [] };
    },
    release(value?: boolean) {
      discarded = value === true;
    },
  };
  return {
    pool: {
      async connect() {
        return client;
      },
    } as unknown as Pool,
    queries,
    discarded: () => discarded,
  };
}

test("photo request fingerprint binds actor product revision alt and original bytes, not encoder output", () => {
  const base = intent();
  for (const changed of [
    makePhotoIntent("other", "operator:fixture", input),
    makePhotoIntent("soap", "operator:other", input),
    makePhotoIntent("soap", "operator:fixture", {
      ...input,
      expectedRevision: 5,
    }),
    makePhotoIntent("soap", "operator:fixture", { ...input, alt: "Other" }),
    makePhotoIntent("soap", "operator:fixture", {
      ...input,
      file: Buffer.from("other"),
    }),
  ])
    assert.notEqual(changed.hash, base.hash);
  assert.equal(
    makePhotoIntent("soap", "operator:fixture", {
      ...input,
      file: Buffer.from("original bytes"),
    }).hash,
    base.hash,
  );
});

test("photo transition takes shared operation lock before row lock, increments only product revision and appends compact audit", async () => {
  const { pool, queries } = fixture();
  assert.deepEqual(await commitPhotoOperation(pool, intent(), photo), {
    productKey: "soap",
    revision: 5,
    photo,
  });
  const lock = queries.findIndex((query) =>
    query.sql.includes("pg_advisory_xact_lock"),
  );
  const row = queries.findIndex((query) => query.sql.includes("FOR UPDATE"));
  assert(lock >= 0 && row > lock);
  const updates = queries.filter((query) => query.sql.startsWith("UPDATE"));
  assert.equal(updates.length, 1);
  assert.match(
    updates[0]!.sql,
    /UPDATE products SET photo=.*revision=revision\+1/,
  );
  const audit = queries.find((query) =>
    query.sql.startsWith("INSERT INTO admin_operations"),
  );
  assert(audit);
  assert.deepEqual(JSON.parse(audit.values[5] as string), {
    revision: 4,
    photo: null,
  });
  assert.deepEqual(JSON.parse(audit.values[6] as string), {
    revision: 5,
    photo,
  });
  assert.equal(queries.at(-1)?.sql, "COMMIT");
});

test("exact replay returns the immutable receipt before checking current revision and changed intent conflicts", async () => {
  const request = intent();
  const result = { productKey: "soap", revision: 5, photo };
  const recorded = {
    actor_key: request.actorId,
    action: request.action,
    resource_key: request.productKey,
    request_hash: request.hash,
    result,
  };
  const replay = fixture({ recorded, revision: 99 });
  assert.deepEqual(
    await commitPhotoOperation(replay.pool, request, photo),
    result,
  );
  assert.equal(
    replay.queries.some((query) => query.sql.includes("FOR UPDATE")),
    false,
  );
  const changed = fixture({ recorded });
  await assert.rejects(
    commitPhotoOperation(
      changed.pool,
      {
        ...request,
        hash: "b".repeat(64),
      },
      photo,
    ),
    (error: unknown) => error instanceof PhotoError && error.status === 409,
  );
});

test("revision conflicts and failed audits roll back; lost commit acknowledgement discards the connection without object cleanup", async () => {
  for (const options of [
    { revision: 3 },
    { failAudit: true },
    { uncertainCommit: true },
  ]) {
    const state = fixture(options);
    await assert.rejects(
      commitPhotoOperation(state.pool, intent(), photo),
      (error: unknown) =>
        error instanceof PhotoError &&
        error.status === ("revision" in options ? 409 : 503),
    );
    assert(state.queries.some((query) => query.sql === "ROLLBACK"));
    if ("uncertainCommit" in options) assert.equal(state.discarded(), true);
  }
});

test("admin readiness validates the migrated photo column without changing privilege or session checks", async () => {
  const queries: string[] = [];
  const pool = {
    async query(sql: string) {
      queries.push(sql);
      return { rows: [{ safe: true }] };
    },
  } as unknown as Pool;
  await checkAdminDatabaseAccess(pool);
  assert(
    queries.some((sql) =>
      /EXPLAIN SELECT photo FROM public\.products/.test(sql),
    ),
  );
});
