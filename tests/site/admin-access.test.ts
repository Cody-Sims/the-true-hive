import assert from "node:assert/strict";
import test from "node:test";
import { readAdminAccessEnvironment } from "../../scripts/admin-access.mjs";

test("admin provisioning cannot fall back to a public or inventory runtime credential", () => {
  assert.throws(
    () =>
      readAdminAccessEnvironment({
        DATABASE_URL: "postgresql://runtime@127.0.0.1/true_hive_test",
        ADMIN_DATABASE_URL: "postgresql://writer@127.0.0.1/true_hive_test",
        INVENTORY_ADMIN_UID: "fixture-admin",
      }),
    /direct owner connection/i,
  );
});

test("admin provisioning rejects pooled owner connections without revealing credentials", () => {
  assert.throws(
    () =>
      readAdminAccessEnvironment({
        MIGRATION_DATABASE_URL:
          "postgresql://fixture:private-placeholder@fixture-pooler.example.test/hive",
        INVENTORY_ADMIN_UID: "fixture-admin",
      }),
    (error: unknown) =>
      error instanceof Error &&
      /direct owner connection/i.test(error.message) &&
      !error.message.includes("private-placeholder"),
  );
});

test("an invalid admin identity prevents provisioning before a database connection", () => {
  assert.throws(
    () =>
      readAdminAccessEnvironment({
        MIGRATION_DATABASE_URL:
          "postgresql://operator@127.0.0.1/true_hive_test",
        DATABASE_TLS: "disable",
        INVENTORY_ADMIN_UID: " fixture-admin ",
      }),
    /private admin identity/i,
  );
});
