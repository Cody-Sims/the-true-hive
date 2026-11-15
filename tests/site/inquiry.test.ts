import assert from "node:assert/strict";
import test from "node:test";
import { buildInquiryDraft } from "../../src/client/inquiry-draft.ts";

const inquiry = {
  name: "Renée 🐝",
  email: "renee+bees@example.com",
  type: "colony-removal",
  message:
    "Bees near an outbuilding.\r\nCan we discuss options? & = # ? + %\nBcc: other@example.com\nLiteral %0d%0a and <script> stay text.",
};

test("draft preserves Unicode and plain text while keeping recipient and headers fixed", () => {
  const result = buildInquiryDraft(inquiry);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const url = new URL(result.url);
  assert.equal(url.protocol, "mailto:");
  assert.equal(url.pathname, "loganstakely18@gmail.com");
  assert.deepEqual([...url.searchParams.keys()], ["subject", "body"]);
  assert.equal(
    url.searchParams.get("subject"),
    "The True Hive — Colony removal inquiry",
  );
  assert.equal(
    url.searchParams.get("body"),
    "Name: Renée 🐝\r\nReply-to email: renee+bees@example.com\r\nInquiry: Colony removal\r\n\r\nMessage:\r\n" +
      "Bees near an outbuilding.\r\nCan we discuss options? & = # ? + %\r\nBcc: other@example.com\r\nLiteral %0d%0a and <script> stay text.",
  );
  assert(!result.url.includes("\n"));
  assert(!result.url.includes("\r"));
  assert(result.url.includes("%26"));
  assert(result.url.includes("%250d%250a"));
});

test("empty, malformed, header-injection and unsupported values return field errors", () => {
  const cases: Array<[keyof typeof inquiry, string]> = [
    ["name", " \t "],
    ["name", "Name\r\nBcc: attacker@example.com"],
    ["email", "person@example.com\r\nBcc: attacker@example.com"],
    ["email", "not-an-email"],
    ["email", "one@example.com,two@example.com"],
    ["type", "general&bcc=attacker@example.com"],
    ["message", "  \r\n "],
    ["message", "Text\u0000hidden"],
    ["message", "\ud800"],
    ["name", "a".repeat(81)],
    ["email", "a".repeat(109) + "@example.com"],
    ["message", "a".repeat(601)],
  ];
  for (const [field, value] of cases) {
    const result = buildInquiryDraft({ ...inquiry, [field]: value });
    assert.equal(result.ok, false, `${field}: ${JSON.stringify(value)}`);
    if (!result.ok) assert(result.errors[field], field);
  }
});

test("all inquiry types and maximum ASCII input remain complete, not truncated", () => {
  for (const [type, label] of [
    ["general", "General / products"],
    ["colony-removal", "Colony removal"],
    ["farm-pollination", "Farm pollination"],
  ]) {
    const input = {
      name: "N".repeat(80),
      email: "e".repeat(108) + "@example.com",
      type: type!,
      message: "x".repeat(600),
    };
    const result = buildInquiryDraft(input);
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    const url = new URL(result.url);
    const body = url.searchParams.get("body")!;
    assert(body.includes(`Name: ${input.name}\r\n`));
    assert(body.includes(`Reply-to email: ${input.email}\r\n`));
    assert(body.includes(`Inquiry: ${label}\r\n`));
    assert(body.endsWith(input.message));
    assert(result.url.length <= 2000);
  }
});

test("encoded URI overflow returns a manual-email fallback instead of truncation", () => {
  const result = buildInquiryDraft({
    ...inquiry,
    message: "🐝".repeat(300),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.errors.form!, /too long/i);
    assert.match(result.errors.form!, /copy.*email/i);
    assert(!("url" in result));
  }
});
