import assert from "node:assert/strict";
import test, { after, afterEach, beforeEach } from "node:test";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { Pool, type PoolClient } from "pg";
import { databaseOptions } from "../../src/server/db/connection.mjs";
import { migrateDatabase } from "../../scripts/migrate.mjs";
import { changeAdminAccess } from "../../scripts/admin-access.mjs";
import { AdminConfigurationError } from "../../src/server/admin/config.ts";
import {
  checkAdminDatabaseAccess,
  createAdminPersistence,
} from "../../src/server/auth/persistence.ts";

const connection = process.env["TEST_DATABASE_URL"];
assert(connection, "Use the isolated true_hive_test database.");
const url = new URL(connection);
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/true_hive_test");
const options = databaseOptions(connection, "disable");
const operator = new Pool({ ...options, max: 3 });
let runtime: Pool;
let role: string;
let migrated = false;

beforeEach(async () => {
  assert.equal(
    (
      await operator.query(
        "SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public'",
      )
    ).rows[0].count,
    0,
    "The dedicated public-schema fixture must be empty before migration.",
  );
  await migrateDatabase(operator);
  migrated = true;
  role = `auth_runtime_${randomUUID().replaceAll("-", "")}`;
  await operator.query(`CREATE ROLE "${role}" NOLOGIN NOINHERIT`);
  await operator.query(`GRANT "${role}" TO CURRENT_USER WITH SET TRUE`);
  await operator.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
  await operator.query(
    `GRANT SELECT,INSERT,UPDATE ON products,product_variants,inventory_locations,inventory_levels,orders,admin_sessions TO "${role}"`,
  );
  await operator.query(
    `GRANT SELECT,INSERT ON inventory_movements,admin_operations,order_lines,payment_events TO "${role}"`,
  );
  await operator.query(`GRANT SELECT ON admin_memberships TO "${role}"`);
  runtime = new Pool({ ...options, max: 1 });
  await runtime.query(`SET ROLE "${role}"`);
  await runtime.query("SET search_path=public");
  await checkAdminDatabaseAccess(runtime);
});

afterEach(async () => {
  await runtime?.end();
  if (migrated) {
    await operator.query(`
      DROP TABLE public.admin_sessions,public.admin_memberships,public.admin_operations,
        public.payment_events,public.order_lines,public.orders,public.inventory_movements,
        public.inventory_levels,public.inventory_locations,public.product_variants,
        public.products,public.schema_migrations CASCADE;
      DROP FUNCTION public.prevent_inventory_history_changes(),
        public.prevent_admin_commerce_history_changes();
      DROP FUNCTION IF EXISTS public.pause_session_insert_fixture();
    `);
    migrated = false;
  }
  if (role) {
    await operator.query(`REVOKE ALL ON SCHEMA public FROM "${role}"`);
    await operator.query(`DROP ROLE "${role}"`);
    role = "";
  }
});

after(async () => {
  await operator.end();
});

async function until(condition: () => Promise<boolean>) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await setTimeout(10);
  }
  assert.fail("The expected native transaction barrier was not reached.");
}

async function blockedBy(client: PoolClient, pid: number, blocker: number) {
  const result = await client.query<{ blockers: number[] }>(
    "SELECT pg_blocking_pids($1) AS blockers",
    [pid],
  );
  const row = result.rows[0];
  assert(row);
  return row.blockers.includes(blocker);
}

test("session creation racing revocation cannot survive a later membership grant", async () => {
  const uid = "fixture-racing-admin";
  await changeAdminAccess(operator, uid, true);
  await operator.query(`
    CREATE FUNCTION public.pause_session_insert_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN PERFORM pg_advisory_xact_lock(719311); RETURN NEW; END; $$;
    CREATE TRIGGER pause_session_insert_fixture BEFORE INSERT ON public.admin_sessions
      FOR EACH ROW EXECUTE FUNCTION public.pause_session_insert_fixture();
  `);
  const coordinator = await operator.connect();
  const revoker = new Pool({ ...options, max: 1 });
  const controlPid = (await coordinator.query("SELECT pg_backend_pid() AS pid"))
    .rows[0].pid;
  const sessionPid = (await runtime.query("SELECT pg_backend_pid() AS pid"))
    .rows[0].pid;
  const revokePid = (await revoker.query("SELECT pg_backend_pid() AS pid"))
    .rows[0].pid;
  const persistence = createAdminPersistence(runtime);
  let saving: Promise<void> | undefined;
  let revoking: Promise<void> | undefined;
  try {
    await coordinator.query("SELECT pg_advisory_lock(719311)");
    saving = persistence.saveSession(
      "c".repeat(64),
      uid,
      new Date(Date.now() + 3600000),
    );
    void saving.catch(() => {});
    await until(() => blockedBy(coordinator, sessionPid, controlPid));
    let revoked = false;
    revoking = changeAdminAccess(revoker, uid, false).finally(() => {
      revoked = true;
    });
    void revoking.catch(() => {});
    await until(
      async () =>
        revoked || (await blockedBy(coordinator, revokePid, sessionPid)),
    );
    await coordinator.query("SELECT pg_advisory_unlock(719311)");
    await Promise.all([saving, revoking]);
    await changeAdminAccess(operator, uid, true);
    assert.equal(await persistence.isMember(uid), true);
    assert.equal(
      await persistence.isSessionActive("c".repeat(64), uid, new Date()),
      false,
    );
  } finally {
    await coordinator.query("SELECT pg_advisory_unlock(719311)");
    coordinator.release();
    await Promise.allSettled(
      [saving, revoking].filter((value) => value !== undefined),
    );
    await revoker.end();
  }
});

test("column-only membership write grants fail the actual runtime permission preflight", async () => {
  await operator.query(
    "INSERT INTO admin_memberships(uid,active) VALUES ('fixture-disabled',false)",
  );
  for (const privilege of ["UPDATE(active)", "INSERT(uid,active)"]) {
    await operator.query(
      `GRANT ${privilege} ON public.admin_memberships TO "${role}"`,
    );
    if (privilege.startsWith("UPDATE")) {
      assert.equal(
        (
          await runtime.query(
            "UPDATE admin_memberships SET active=true WHERE uid='fixture-disabled'",
          )
        ).rowCount,
        1,
      );
    } else {
      assert.equal(
        (
          await runtime.query(
            "INSERT INTO admin_memberships(uid,active) VALUES ('fixture-added',true)",
          )
        ).rowCount,
        1,
      );
    }
    await assert.rejects(
      checkAdminDatabaseAccess(runtime),
      AdminConfigurationError,
    );
    await operator.query(
      `REVOKE ${privilege} ON public.admin_memberships FROM "${role}"`,
    );
    await checkAdminDatabaseAccess(runtime);
  }
});
