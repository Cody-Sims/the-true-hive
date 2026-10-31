import test from "node:test";
import assert from "node:assert/strict";
import { readConfig } from "../../src/server/config.ts";

test("the initial site uses deliberate showcase mode without inventing contact links", () => {
  const config = readConfig({});
  assert.equal(config.catalogSource, "showcase");
  assert.equal(config.indexable, false);
  assert.equal(config.siteOrigin, "https://thetruehive.com");
  assert.equal(config.contact.phone, null);
  assert.equal(config.contact.facebook, null);
  assert.equal(config.contact.instagram, null);
});

test("a database catalog can be configured explicitly but cannot silently enable mock indexing", () => {
  const config = readConfig({
    CATALOG_SOURCE: "database",
    SITE_INDEXABLE: "true",
  });
  assert.equal(config.catalogSource, "database");
  assert.equal(config.databaseUrl, null);
  assert.equal(config.indexable, true);
  assert.throws(() => readConfig({ SITE_INDEXABLE: "true" }), /showcase/i);
});

test("invalid source/boolean/origin values fail clearly without exposing credential values", () => {
  assert.throws(
    () => readConfig({ CATALOG_SOURCE: "fallback-to-fake" }),
    /CATALOG_SOURCE/,
  );
  assert.throws(() => readConfig({ SITE_INDEXABLE: "yes" }), /SITE_INDEXABLE/);
  for (const origin of [
    "javascript:alert(1)",
    "https://example.com/private",
    "https://user:private@example.com",
    "http://example.com",
  ]) {
    assert.throws(
      () => readConfig({ SITE_URL: origin }),
      (error: unknown) => {
        assert(error instanceof Error);
        assert.match(error.message, /SITE_URL/);
        assert(!error.message.includes("private"));
        return true;
      },
    );
  }
});

test("only deliberate phone and safe platform profile links become contact actions", () => {
  const config = readConfig({
    CONTACT_PHONE: "+1 (423) 555-0100",
    FACEBOOK_URL: "https://www.facebook.com/example-business",
    INSTAGRAM_URL: "https://www.instagram.com/example-business/",
    SITE_URL: "http://127.0.0.1:4321",
  });
  assert.equal(config.contact.phoneHref, "tel:+14235550100");
  assert.equal(
    config.contact.facebook,
    "https://www.facebook.com/example-business",
  );
  assert.equal(config.siteOrigin, "http://127.0.0.1:4321");
  assert.throws(
    () =>
      readConfig({
        FACEBOOK_URL: "https://facebook.com.attacker.example/profile",
      }),
    /FACEBOOK_URL/,
  );
  assert.throws(
    () => readConfig({ INSTAGRAM_URL: "javascript:alert(1)" }),
    /INSTAGRAM_URL/,
  );
  assert.throws(
    () => readConfig({ CONTACT_PHONE: "not a phone" }),
    /CONTACT_PHONE/,
  );
});
