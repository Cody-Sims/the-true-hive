import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeDraft,
  encodeDraft,
  reserveDraftSlot,
  type EditableDraft,
} from "../../src/client/workbench-draft.ts";

const now = Date.UTC(2026, 10, 18);
const draft = (): EditableDraft => ({
  version: 1,
  kind: "editable",
  baseRevision: 7,
  updatedAt: now,
  fields: {
    key: "test-product",
    slug: "test-product",
    title: "Test-only editable content",
    summary: "",
    details: "",
    ingredients: "",
    category: "soap",
    imageKey: "soap",
    kind: "draft",
  },
  variants: [
    { baselineIndex: 0, label: "Test format", price: "12.", active: false },
  ],
});

test("draft serialization projects through an editable-only allowlist without coercing incomplete price text", () => {
  const source = {
    ...draft(),
    token: "secret-token",
    variants: [
      {
        ...draft().variants[0]!,
        sku: "PRIVATE-STOCK-CODE",
        key: "private-variant",
        levels: [{ onHand: 999 }],
      },
    ],
    photo: { fileName: "private-photo.jpg" },
  };
  const raw = encodeDraft({ ...source, updatedAt: Date.now() });
  assert.doesNotMatch(
    raw,
    /secret-token|PRIVATE-STOCK-CODE|private-variant|private-photo|levels|onHand/,
  );
  const recovered = decodeDraft(raw);
  assert.equal(recovered.kind, "editable");
  if (recovered.kind === "editable")
    assert.equal(recovered.variants[0]!.price, "12.");
});

test("editable recovery expires but an unresolved operation never ages into permission for another mutation", () => {
  assert.throws(
    () =>
      decodeDraft(
        JSON.stringify({ ...draft(), updatedAt: now - 31 * 86400000 }),
        now,
      ),
    /expired/i,
  );
  assert.equal(
    decodeDraft(
      JSON.stringify({
        version: 1,
        kind: "safety",
        baseRevision: 7,
        updatedAt: 0,
      }),
      now,
    ).kind,
    "safety",
  );
  assert.throws(
    () =>
      decodeDraft(JSON.stringify({ ...draft(), updatedAt: now + 120000 }), now),
    /future/i,
  );
  assert.throws(
    () => decodeDraft(JSON.stringify({ ...draft(), version: 2 }), now),
    /version/i,
  );
});

test("recovery rejects duplicate baseline references and over-bounded content rather than truncating it", () => {
  assert.throws(
    () =>
      decodeDraft(
        JSON.stringify({
          ...draft(),
          variants: [draft().variants[0], draft().variants[0]],
        }),
        now,
      ),
    /reference/i,
  );
  assert.throws(
    () =>
      decodeDraft(
        JSON.stringify({
          ...draft(),
          fields: { ...draft().fields, title: "x".repeat(161) },
        }),
        now,
      ),
    /bounded/i,
  );
  assert.throws(() => decodeDraft(" ".repeat(65537), now), /large/i);
});

function storage(values: Map<string, string>) {
  return {
    get length() {
      return values.size;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
  } satisfies Storage;
}

test("retention never evicts safety evidence or another account, and refuses a thirteenth protected record", () => {
  const values = new Map<string, string>();
  const store = storage(values);
  for (let index = 0; index < 12; index++)
    store.setItem(
      `hive-workbench:v1:account:${index}`,
      JSON.stringify({
        version: 1,
        kind: "safety",
        baseRevision: 7,
        updatedAt: 0,
      }),
    );
  store.setItem(
    "hive-workbench:v1:other-account:record",
    JSON.stringify(draft()),
  );
  assert.throws(
    () => reserveDraftSlot(store, "hive-workbench:v1:account:new", now),
    /unresolved/i,
  );
  assert.equal(values.size, 13);
  assert.equal(values.has("hive-workbench:v1:other-account:record"), true);
});
