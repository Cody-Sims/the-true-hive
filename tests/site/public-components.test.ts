import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { transform } from "@astrojs/compiler-rs";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { parse } from "es-module-lexer";
import { readConfig } from "../../src/server/config.ts";

const root = new URL("../../", import.meta.url);
const modules = new Map<string, Promise<string>>();

function moduleUrl(file: URL): Promise<string> {
  const cached = modules.get(file.href);
  if (cached) return cached;
  const pending = compileModule(file);
  modules.set(file.href, pending);
  return pending;
}

async function compileModule(file: URL): Promise<string> {
  const source = await readFile(file, "utf8");
  let code = file.pathname.endsWith(".astro")
    ? transform(source, {
        filename: file.pathname,
        internalURL: "astro/compiler-runtime",
        resolvePath: (specifier) => specifier,
      }).code
    : file.pathname.endsWith(".ts")
      ? stripTypeScriptTypes(source, { mode: "transform" })
      : source;
  const [imports] = parse(code);
  for (const item of [...imports].reverse()) {
    if (!item.specifier) continue;
    const resolved = item.specifier.endsWith(".css")
      ? "data:text/javascript,export default {}"
      : item.specifier.endsWith("?url")
        ? `data:text/javascript;base64,${Buffer.from(
            `export default ${JSON.stringify(item.specifier)}`,
          ).toString("base64")}`
        : item.specifier.startsWith(".")
          ? await moduleUrl(new URL(item.specifier, file))
          : import.meta.resolve(item.specifier);
    code = code.slice(0, item.start) + resolved + code.slice(item.end);
  }
  return `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
}

async function pageResponse(path: string) {
  const component = await import(
    await moduleUrl(new URL(`src/pages/${path}.astro`, root))
  );
  const container = await AstroContainer.create();
  return container.renderToResponse(component.default, {
    request: new Request(new URL(path, readConfig().siteOrigin)),
    locals: { nonce: "public-components-test" },
  });
}

function markup(html: string): string {
  return html
    .replace(/\s+/g, " ")
    .replace(/>\s+/g, ">")
    .replace(/\s+</g, "<")
    .trim();
}

const { contact } = readConfig();

test("accessibility intro keeps the original unbroken text-node guidance", async () => {
  const response = await pageResponse("accessibility");
  const html = await response.text();
  const intro = html.match(
    /<section class="page-intro wrap" aria-labelledby="accessibility-title">([\s\S]*?)<\/section>/,
  )?.[1];
  assert(intro);
  const description = [...intro.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g)].at(
    -1,
  )?.[1];
  assert(description);
  assert.match(description, /not.*certification/i);
  assert.equal(
    description.trim(),
    "WCAG 2.2 AA is the target for this website. This guidance is not a certification or a promise of universal accessibility across every browser, device, and assistive technology.",
  );
});

for (const page of [
  {
    path: "privacy",
    title: "Privacy and contact",
    description:
      "How The True Hive handles website browsing, collection searches and contact links.",
    intro: `<section class="page-intro wrap" aria-labelledby="privacy-title">
      <p class="eyebrow">Keep things clear</p>
      <h1 id="privacy-title">Privacy, <br /><em>without surprises.</em></h1>
      <p>This page explains the information involved in browsing The True Hive,
        searching the collection and following our contact links.</p>
    </section>`,
    actions: [
      `<a class="text-link" href="${contact.phoneHref}">Call ${contact.phone} <span aria-hidden="true">&rarr;</span></a>`,
    ],
  },
  {
    path: "accessibility",
    title: "Accessibility",
    description:
      "Keyboard navigation, text zoom, reduced motion and accessibility support for The True Hive.",
    intro: `<section class="page-intro wrap" aria-labelledby="accessibility-title">
      <p class="eyebrow">Make yourself at home</p>
      <h1 id="accessibility-title">Accessibility, <br /><em>at your pace.</em></h1>
      <p>WCAG 2.2 AA is the target for this website. This guidance is not a
        certification or a promise of universal accessibility across every
        browser, device, and assistive technology.</p>
    </section>`,
    actions: [
      `<a class="text-link" href="/goods">Browse the collection <span aria-hidden="true">&rarr;</span></a>`,
      `<a class="text-link" href="/contact">Contact channels <span aria-hidden="true">&rarr;</span></a>`,
      `<a class="text-link" href="${contact.phoneHref}">Call ${contact.phone} <span aria-hidden="true">&rarr;</span></a>`,
    ],
  },
  {
    path: "checkout/return",
    title: "Back from test checkout",
    description:
      "Return to your cart to check your Stripe test checkout status.",
    intro: `<section class="wrap page-intro">
      <p class="eyebrow">Stripe test checkout — no real payment</p>
      <h1>Back from test checkout.</h1>
      <p>Return to your cart to check the status of your test checkout before
        trying again.</p>
      <a class="button button-primary" href="/cart">View your cart</a>
      <a class="text-link" href="/goods">Keep shopping</a>
    </section>`,
    actions: [
      `<a class="button button-primary" href="/cart">View your cart</a>`,
      `<a class="text-link" href="/goods">Keep shopping</a>`,
    ],
  },
  {
    path: "checkout/cancel",
    title: "Return to your cart",
    description: "Review your cart and Stripe test checkout status.",
    intro: `<section class="wrap page-intro">
      <p class="eyebrow">Stripe test checkout — no real payment</p>
      <h1>Back to your cart.</h1>
      <p>Review your selections and check the status of your test checkout before
        trying again.</p>
      <a class="button button-primary" href="/cart">View your cart</a>
      <a class="text-link" href="/goods">Keep shopping</a>
    </section>`,
    actions: [
      `<a class="button button-primary" href="/cart">View your cart</a>`,
      `<a class="text-link" href="/goods">Keep shopping</a>`,
    ],
  },
]) {
  test(`${page.path} preserves its public intro, native actions and document metadata`, async () => {
    const response = await pageResponse(page.path);
    assert.equal(response.status, 200);
    const html = await response.text();
    const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1];
    assert(main, "the page keeps its main landmark");
    const intro = main.match(/<section\b[^>]*>[\s\S]*?<\/section>/)?.[0];
    assert(intro, "the page keeps its introductory section");
    assert.equal(
      markup(intro),
      markup(page.intro).replaceAll("<br />", "<br>"),
    );
    assert.equal((main.match(/<h1\b/g) ?? []).length, 1);
    assert.deepEqual(
      [
        ...main.matchAll(
          /<a class="(?:text-link|button button-primary)"[^>]*>[\s\S]*?<\/a>/g,
        ),
      ].map(([anchor]) => markup(anchor)),
      page.actions.map(markup),
    );
    assert(html.includes(`<title>${page.title} | The True Hive</title>`));
    assert(
      html.includes(`<meta name="description" content="${page.description}">`),
    );
    if (page.path.startsWith("checkout/")) {
      assert.match(html, /<meta name="robots" content="noindex, follow">/);
      assert.doesNotMatch(html, /rel="canonical"/);
    } else {
      assert(
        html.includes(
          `<link rel="canonical" href="${new URL(page.path, readConfig().siteOrigin).href}">`,
        ),
      );
    }
  });
}
