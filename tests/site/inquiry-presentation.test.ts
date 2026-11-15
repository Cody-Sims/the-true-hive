import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { transform } from "@astrojs/compiler-rs";
import { parse } from "es-module-lexer";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import AxeBuilder from "@axe-core/playwright";

const root = new URL("../../", import.meta.url);
const styles: string[] = [];
const extractedScripts = new Map<string, string>();

async function moduleUrl(file: URL): Promise<string> {
  const source = await readFile(file, "utf8");
  let code: string;
  if (file.pathname.endsWith(".astro")) {
    const compiled = transform(source, {
      filename: file.pathname,
      internalURL: "astro/compiler-runtime",
      resolvePath: (specifier) => specifier,
    });
    styles.push(...compiled.css);
    compiled.scripts.forEach((script, index) => {
      if (script.type === "inline" && script.code !== undefined) {
        extractedScripts.set(
          `${file.pathname}?astro&type=script&index=${index}&lang.ts`,
          script.code,
        );
      }
    });
    code = compiled.code;
  } else {
    code = stripTypeScriptTypes(source, { mode: "transform" });
  }
  const [imports] = parse(code);
  for (const item of [...imports].reverse()) {
    if (!item.specifier) continue;
    const resolved = item.specifier.endsWith(".css")
      ? "data:text/javascript,export default {}"
      : item.specifier.startsWith(".")
        ? await moduleUrl(new URL(item.specifier, file))
        : import.meta.resolve(item.specifier);
    code = code.slice(0, item.start) + resolved + code.slice(item.end);
  }
  return `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
}

async function contactHtml() {
  const component = await import(
    await moduleUrl(new URL("src/components/ContactSection.astro", root))
  );
  const container = await AstroContainer.create();
  return container.renderToString(component.default, {
    props: {
      contact: {
        phone: "423-555-0100",
        phoneHref: "tel:+14235550100",
      },
    },
  });
}

test("contact offers an explicitly local email draft and a no-JavaScript email fallback", async () => {
  const html = (await contactHtml()).replace(/\s+/g, " ");
  assert.match(html, /Open email draft/);
  assert.match(html, /href="mailto:loganstakely18@gmail\.com"/);
  assert.match(html, /Nothing is sent by this website/);
  assert.match(html, /review and send/i);
  assert.match(html, /No booking or availability is confirmed/);
  assert.match(html, /Do not disturb a colony or approach it for a photograph/);
  assert.match(html, /href="tel:\+14235550100"/);
  assert.match(html, /id="inquiry"/);
});

test(
  "isolated browser: no-JS fallback, accessible validation, draft opening and overflow",
  { skip: process.env["INQUIRY_BROWSER_TESTS"] !== "1" },
  async () => {
    const { chromium } = await import("@playwright/test");
    const originalTmpDir = process.env["TMPDIR"];
    // Keep browser-owned scratch directories inside this isolated worktree.
    process.env["TMPDIR"] = root.pathname;
    const browser = await chromium.launch({ env: process.env, timeout: 10000 });
    try {
      const html = await contactHtml();
      const css =
        (await readFile(new URL("src/styles/site.css", root), "utf8")) +
        "\n" +
        [...new Set(styles)].join("\n");
      const scripts = new Map(
        await Promise.all(
          ["inquiry", "inquiry-draft"].map(
            async (name): Promise<[string, string]> => [
              `/${name}.js`,
              stripTypeScriptTypes(
                await readFile(new URL(`src/client/${name}.ts`, root), "utf8"),
                { mode: "transform" },
              ).replaceAll('"./inquiry-draft.ts"', '"/inquiry-draft.js"'),
            ],
          ),
        ),
      );
      for (const [path, script] of extractedScripts) {
        scripts.set(
          path,
          script.replaceAll('"../client/inquiry.ts"', '"/inquiry.js"'),
        );
      }
      async function fixture(javaScriptEnabled: boolean, width = 320) {
        const context = await browser.newContext({
          javaScriptEnabled,
          viewport: { width, height: 900 },
          serviceWorkers: "block",
        });
        const page = await context.newPage();
        page.setDefaultTimeout(3000);
        const requests: string[] = [];
        page.on("request", (request) => requests.push(request.url()));
        await page.route("**/*", (route) => {
          const url = new URL(route.request().url());
          if (url.origin !== "https://inquiry.example.invalid")
            return route.abort();
          const script = scripts.get(url.pathname + url.search);
          if (script)
            return route.fulfill({
              contentType: "text/javascript",
              body: script,
            });
          if (url.pathname !== "/") return route.abort();
          return route.fulfill({
            contentType: "text/html",
            headers: {
              "Content-Security-Policy":
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; form-action 'self'",
            },
            body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Contact component test</title><style>${css}</style></head><body><main><h1>Contact</h1>${html}</main></body></html>`,
          });
        });
        await page.goto("https://inquiry.example.invalid/");
        return { context, page, requests };
      }

      {
        const { context, page } = await fixture(false);
        try {
          assert.equal(
            await page.locator("[data-inquiry-form]").isVisible(),
            false,
          );
          assert.equal(
            await page
              .getByRole("link", { name: "Email loganstakely18@gmail.com" })
              .getAttribute("href"),
            "mailto:loganstakely18@gmail.com",
          );
        } finally {
          await context.close();
        }
      }

      {
        const { context, page, requests } = await fixture(true);
        try {
          await page
            .locator("[data-inquiry-form]")
            .waitFor({ state: "visible" });
          const button = page.getByRole("button", {
            name: "Open email draft",
          });
          assert.equal(
            await page.getByRole("status").count(),
            1,
            "the live status region must be exposed before its first update",
          );
          await button.click();
          assert.equal(
            await page.locator(":focus").getAttribute("id"),
            "inquiry-name",
          );
          assert.equal(
            await page.getByLabel("Your name").getAttribute("aria-invalid"),
            "true",
          );
          assert.match(
            await page.getByRole("status").innerText(),
            /Nothing has been sent/,
          );
          await page.getByLabel("Your name").fill("Renée 🐝");
          await page.getByLabel("Reply-to email").fill("not-an-email");
          await button.click();
          assert.equal(
            await page.locator(":focus").getAttribute("id"),
            "inquiry-email",
          );
          await page
            .getByLabel("Reply-to email")
            .fill("renee+bees@example.com");
          await page
            .getByLabel("Inquiry type")
            .selectOption("farm-pollination");
          const message =
            "<img src=x onerror=alert(1)> & bees\nCan we discuss timing?";
          await page.getByLabel("Message", { exact: true }).fill(message);
          await page.evaluate(() => {
            const draft = document.querySelector<HTMLAnchorElement>(
              "[data-inquiry-draft]",
            )!;
            draft.addEventListener("click", (event) => {
              event.preventDefault();
              document.documentElement.dataset["openedDraft"] = draft.href;
            });
          });
          await button.click();
          const opened = await page
            .locator("html")
            .getAttribute("data-opened-draft");
          assert(opened);
          const url = new URL(opened);
          assert.equal(url.pathname, "loganstakely18@gmail.com");
          assert.equal(
            url.searchParams.get("subject"),
            "The True Hive — Farm pollination inquiry",
          );
          assert.equal(
            url.searchParams.get("body"),
            "Name: Renée 🐝\r\nReply-to email: renee+bees@example.com\r\nInquiry: Farm pollination\r\n\r\nMessage:\r\n" +
              message.replaceAll("\n", "\r\n"),
          );
          assert.match(
            await page.getByRole("status").innerText(),
            /requested, not sent/,
          );
          assert.match(
            await page.getByRole("status").innerText(),
            /If nothing opens/,
          );
          assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
          assert.equal(await page.locator("img").count(), 0);
          assert.equal(
            await page.getByLabel("Message", { exact: true }).inputValue(),
            message,
          );
          assert.deepEqual(
            requests.sort(),
            [
              "https://inquiry.example.invalid/",
              "https://inquiry.example.invalid/inquiry-draft.js",
              "https://inquiry.example.invalid/inquiry.js",
              ...[...extractedScripts.keys()].map(
                (path) => new URL(path, "https://inquiry.example.invalid").href,
              ),
            ].sort(),
          );
          assert.equal(await page.evaluate(() => localStorage.length), 0);
          assert.deepEqual(
            (await new AxeBuilder({ page }).analyze()).violations,
            [],
          );
          for (const width of [320, 1280]) {
            await page.setViewportSize({ width, height: 900 });
            assert(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
              ),
              `no horizontal overflow at ${width}px`,
            );
          }
          await page
            .getByLabel("Message", { exact: true })
            .fill("🐝".repeat(300));
          assert.equal(
            await page.locator("[data-inquiry-draft]").isVisible(),
            false,
          );
          await page.locator("html").evaluate((html) => {
            delete html.dataset["openedDraft"];
          });
          await button.click();
          assert.match(await page.getByRole("status").innerText(), /too long/);
          assert.equal(
            await page.getByLabel("Message", { exact: true }).inputValue(),
            "🐝".repeat(300),
          );
          assert.equal(
            await page.locator("html").getAttribute("data-opened-draft"),
            null,
          );
          assert.equal(
            await page.locator(":focus").getAttribute("data-inquiry-status"),
            "",
          );
          const longMessage = "x".repeat(601);
          await page.getByLabel("Message", { exact: true }).fill(longMessage);
          assert.equal(
            await page.getByLabel("Message", { exact: true }).inputValue(),
            longMessage,
            "over-limit pasted text must remain intact for manual email",
          );
          await button.click();
          assert.equal(
            await page
              .getByLabel("Message", { exact: true })
              .getAttribute("aria-invalid"),
            "true",
          );
          assert.equal(
            await page.locator("[data-inquiry-draft]").isVisible(),
            false,
          );
        } finally {
          await context.close();
        }
      }
    } finally {
      await browser.close();
      if (originalTmpDir === undefined) delete process.env["TMPDIR"];
      else process.env["TMPDIR"] = originalTmpDir;
    }
  },
);
