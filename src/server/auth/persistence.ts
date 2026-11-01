import type { Pool } from "pg";
import { AdminConfigurationError } from "../admin/config.ts";

export function createAdminPersistence(pool: Pool) {
  return {
    async isMember(uid: string) {
      const result = await pool.query(
        "SELECT 1 FROM public.admin_memberships WHERE uid = $1 AND active = true",
        [uid],
      );
      return result.rowCount === 1;
    },
    async isSessionActive(hash: string, uid: string, now: Date) {
      const result = await pool.query(
        `SELECT 1 FROM public.admin_sessions
         WHERE session_hash = $1 AND uid = $2 AND revoked_at IS NULL AND expires_at > $3`,
        [hash, uid, now],
      );
      return result.rowCount === 1;
    },
    async saveSession(hash: string, uid: string, expiresAt: Date) {
      // The current membership is checked again in the same database statement.
      const result = await pool.query(
        `INSERT INTO public.admin_sessions (session_hash, uid, expires_at)
         SELECT $1, uid, $3 FROM public.admin_memberships WHERE uid = $2 AND active = true`,
        [hash, uid, expiresAt],
      );
      if (result.rowCount !== 1) throw new AdminConfigurationError();
    },
    async revokeSession(hash: string) {
      await pool.query(
        `UPDATE public.admin_sessions SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
         WHERE session_hash = $1`,
        [hash],
      );
    },
  };
}

export async function checkAdminDatabaseAccess(pool: Pick<Pool, "query">) {
  const role = await pool.query<{ safe: boolean }>(`
    SELECT NOT EXISTS (
      SELECT 1 FROM pg_roles r
      WHERE pg_has_role(r.oid, 'MEMBER')
        AND (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls)
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_namespace n
      WHERE n.nspname = 'public' AND pg_has_role(n.nspowner, 'MEMBER')
    )
    AND NOT has_schema_privilege(current_user, 'public', 'CREATE')
    AND has_schema_privilege(current_user, 'public', 'USAGE')
    AND NOT EXISTS (
      SELECT 1 FROM pg_database d
      WHERE d.datname = current_database() AND pg_has_role(d.datdba, 'MEMBER')
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'S')
        AND pg_has_role(c.relowner, 'MEMBER')
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND pg_has_role(p.proowner, 'MEMBER')
    ) AS safe
  `);
  if (role.rows[0]?.safe !== true) throw new AdminConfigurationError();
  const required: Record<string, string[]> = {
    admin_memberships: ["SELECT"],
    admin_sessions: ["SELECT", "INSERT", "UPDATE"],
    products: ["SELECT", "INSERT", "UPDATE"],
    product_variants: ["SELECT", "INSERT", "UPDATE"],
    inventory_locations: ["SELECT", "INSERT", "UPDATE"],
    inventory_levels: ["SELECT", "INSERT", "UPDATE"],
    inventory_movements: ["SELECT", "INSERT"],
    admin_operations: ["SELECT", "INSERT"],
    orders: ["SELECT", "INSERT", "UPDATE"],
    order_lines: ["SELECT", "INSERT"],
    payment_events: ["SELECT", "INSERT"],
  };
  const forbidden: Record<string, string[]> = {
    admin_memberships: ["INSERT", "UPDATE", "DELETE", "TRUNCATE"],
    inventory_movements: ["UPDATE", "DELETE", "TRUNCATE"],
    admin_operations: ["UPDATE", "DELETE", "TRUNCATE"],
    payment_events: ["UPDATE", "DELETE", "TRUNCATE"],
  };
  const checks = [
    ...Object.entries(required).flatMap(([table, privileges]) =>
      privileges.map((privilege) => ({ table, privilege, expected: true })),
    ),
    ...Object.entries(forbidden).flatMap(([table, privileges]) =>
      privileges.map((privilege) => ({ table, privilege, expected: false })),
    ),
  ];
  const result = await pool.query<{ safe: boolean }>(
    `SELECT bool_and(COALESCE(has_table_privilege(current_user,
      to_regclass('public.' || (entry->>'table')), entry->>'privilege') = (entry->>'expected')::boolean, false)) AS safe
      FROM jsonb_array_elements($1::jsonb) AS entry`,
    [JSON.stringify(checks)],
  );
  if (result.rows[0]?.safe !== true) throw new AdminConfigurationError();
}
