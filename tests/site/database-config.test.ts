import test from "node:test";
import assert from "node:assert/strict";
import { databaseOptions } from "../../src/server/db/connection.mjs";

test("remote database TLS verifies certificates instead of inheriting an insecure URL override", () => {
  const options = databaseOptions(
    "postgresql://test:fixture@database.example/test?sslmode=require",
  );
  assert.deepEqual(options.ssl, { rejectUnauthorized: true });
  assert(!options.connectionString.includes("sslmode"));
  assert.equal(options.connectionTimeoutMillis, 3000);
});

test("unencrypted database connections are restricted to explicit local development targets", () => {
  assert.equal(
    databaseOptions("postgresql://test:fixture@127.0.0.1/test", "disable").ssl,
    false,
  );
  assert.equal(
    databaseOptions("postgresql://test:fixture@db/test", "disable").ssl,
    false,
  );
  assert.throws(
    () =>
      databaseOptions(
        "postgresql://test:fixture@database.example/test",
        "disable",
      ),
    /local/i,
  );
  assert.throws(
    () =>
      databaseOptions(
        "postgresql://test:fixture@database.example/test?sslmode=no-verify",
      ),
    /TLS|sslmode/i,
  );
});

test("unsupported database strings fail without disclosing their credentials", () => {
  for (const value of [
    "not a url",
    "postgresql://test:fixture@127.0.0.1",
    "https://private:secret@database.example",
    "postgresql://private:secret@database.example/db?host=attacker.example",
  ]) {
    assert.throws(
      () => databaseOptions(value),
      (error: unknown) => {
        assert(error instanceof Error);
        assert.match(error.message, /URL|PostgreSQL|parameter/i);
        assert(!error.message.includes("secret"));
        assert(!error.message.includes("private"));
        return true;
      },
    );
  }
});

test("approved optional channel binding keeps verified TLS without accepting a strict requirement", () => {
  const options = databaseOptions(
    "postgresql://database.example/true_hive?sslmode=verify-full&channel_binding=prefer",
  );
  assert.deepEqual(options.ssl, { rejectUnauthorized: true });
  assert.equal(options.enableChannelBinding, true);
  assert(!options.connectionString.includes("channel_binding"));
  for (const value of [
    "postgresql://database.example/true_hive?channel_binding=require",
    "postgresql://database.example/true_hive?channel_binding=disable",
    "postgresql://database.example/true_hive?channel_binding=prefer&channel_binding=require",
  ]) {
    assert.throws(() => databaseOptions(value), /channel.binding|required/i);
  }
  assert.throws(
    () =>
      databaseOptions(
        "postgresql://127.0.0.1/true_hive?channel_binding=prefer",
        "disable",
      ),
    /channel.binding|TLS/i,
  );
});
