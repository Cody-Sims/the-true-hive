import assert from "node:assert/strict";
import test, { after, afterEach, beforeEach } from "node:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { databaseOptions } from "../../src/server/db/connection.mjs";
import { migrateDatabase } from "../../scripts/migrate.mjs";
import { changeAdminAccess } from "../../scripts/admin-access.mjs";

const connection = process.env["TEST_DATABASE_URL"];
assert(connection, "Use the isolated true_hive_test database.");
assert.equal(new URL(connection).pathname, "/true_hive_test");
const options = databaseOptions(connection, "disable");
const operator = new Pool({ ...options, max: 1 });
let pool: Pool;
let schema: string;
let runtimeRole: string | undefined;

beforeEach(async () => {
  schema = `admin_access_${randomUUID().replaceAll("-", "")}`;
  await operator.query(`CREATE SCHEMA "${schema}"`);
  pool = new Pool({ ...options, max: 1, options: `-c search_path=${schema}` });
  await migrateDatabase(pool);
});

afterEach(async () => {
  await pool?.end();
  await operator.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  if (runtimeRole) {
    await operator.query(`DROP ROLE "${runtimeRole}"`);
    runtimeRole = undefined;
  }
});

after(async () => {
  await operator.end();
});

async function existingAccess() {
  await pool.query(
    "INSERT INTO admin_memberships(uid,active) VALUES ('fixture-admin',true)",
  );
  await pool.query(
    `INSERT INTO admin_sessions(session_hash,uid,expires_at)
     VALUES ($1,'fixture-admin',CURRENT_TIMESTAMP + interval '1 hour'),
            ($2,'fixture-admin',CURRENT_TIMESTAMP + interval '1 hour')`,
    ["a".repeat(64), "b".repeat(64)],
  );
}

test("operator provisioning creates only the requested admin membership", async () => {
  await changeAdminAccess(pool, "fixture-admin", true);
  assert.deepEqual(
    (await pool.query("SELECT uid,active FROM admin_memberships")).rows,
    [{ uid: "fixture-admin", active: true }],
  );
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM admin_sessions"))
      .rows[0].count,
    0,
  );
});

test("revoking membership also revokes sessions and a later grant does not resurrect them", async () => {
  await existingAccess();
  await changeAdminAccess(pool, "fixture-admin", false);
  assert.equal(
    (await pool.query("SELECT active FROM admin_memberships")).rows[0].active,
    false,
  );
  assert.deepEqual(
    (
      await pool.query(
        "SELECT revoked_at IS NOT NULL AS revoked FROM admin_sessions ORDER BY session_hash",
      )
    ).rows,
    [{ revoked: true }, { revoked: true }],
  );
  await changeAdminAccess(pool, "fixture-admin", true);
  assert.equal(
    (await pool.query("SELECT active FROM admin_memberships")).rows[0].active,
    true,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM admin_sessions WHERE revoked_at IS NULL",
      )
    ).rows[0].count,
    0,
  );
});

test("session revocation failure rolls back membership changes", async () => {
  await existingAccess();
  await pool.query(`
    CREATE FUNCTION reject_session_revocation() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Test-only revocation failure'; END; $$;
    CREATE TRIGGER reject_session_revocation BEFORE UPDATE ON admin_sessions
    FOR EACH ROW EXECUTE FUNCTION reject_session_revocation();
  `);
  await assert.rejects(changeAdminAccess(pool, "fixture-admin", false), {
    code: "P0001",
  });
  assert.equal(
    (await pool.query("SELECT active FROM admin_memberships")).rows[0].active,
    true,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM admin_sessions WHERE revoked_at IS NULL",
      )
    ).rows[0].count,
    2,
  );
});

test("a runtime role with membership reads cannot provision an administrator", async () => {
  runtimeRole = `hive_runtime_${randomUUID().replaceAll("-", "")}`;
  await operator.query(`CREATE ROLE "${runtimeRole}" NOLOGIN`);
  await operator.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${runtimeRole}"`);
  await operator.query(
    `GRANT SELECT ON "${schema}".admin_memberships TO "${runtimeRole}"`,
  );
  await pool.query(`SET ROLE "${runtimeRole}"`);
  await assert.rejects(changeAdminAccess(pool, "fixture-admin", true), {
    code: "42501",
  });
  await pool.query("RESET ROLE");
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM admin_memberships"))
      .rows[0].count,
    0,
  );
});
