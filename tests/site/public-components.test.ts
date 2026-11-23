import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { transform } from "@astrojs/compiler-rs";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { parse } from "es-module-lexer";
import { readConfig } from "../../src/server/config.ts";
import type { Product } from "../../src/domain/catalog.ts";
import { showcaseProducts } from "../../src/content/showcase.ts";

const root = new URL("../../", import.meta.url);
const modules = new Map<string, Promise<string>>();

function scriptUrl(code: string): string {
  return `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
}

function moduleUrl(file: URL, cache = modules): Promise<string> {
  const cached = cache.get(file.href);
  if (cached) return cached;
  const pending = compileModule(file, cache);
  cache.set(file.href, pending);
  return pending;
}

async function compileModule(
  file: URL,
  cache: Map<string, Promise<string>>,
): Promise<string> {
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
      : item.specifier.endsWith("?url") || item.specifier.endsWith(".webp")
        ? scriptUrl(`export default ${JSON.stringify(item.specifier)}`)
        : item.specifier === "astro:assets"
          ? // Keep the real page's image props; Vite's image optimization is outside this render harness.
            scriptUrl(`
              import { createComponent, render, spreadAttributes } from ${JSON.stringify(import.meta.resolve("astro/compiler-runtime"))};
              export const Image = createComponent((_result, props) =>
                render\`<img\${spreadAttributes(props)}>\`);
            `)
          : item.specifier.startsWith(".")
            ? await moduleUrl(new URL(item.specifier, file), cache)
            : import.meta.resolve(item.specifier);
    code = code.slice(0, item.start) + resolved + code.slice(item.end);
  }
  return scriptUrl(code);
}

async function pageResponse(
  path: string,
  options: {
    search?: string;
    catalog?: readonly Product[] | "unavailable";
  } = {},
) {
  const cache =
    options.catalog === undefined
      ? modules
      : new Map<string, Promise<string>>();
  if (options.catalog !== undefined) {
    cache.set(
      new URL("src/server/catalog.ts", root).href,
      Promise.resolve(
        scriptUrl(`
          export class CatalogUnavailableError extends Error {}
          export async function getCatalog() {
            ${
              options.catalog === "unavailable"
                ? "throw new CatalogUnavailableError();"
                : `return ${JSON.stringify({ source: "showcase", products: options.catalog })};`
            }
          }
        `),
      ),
    );
  }
  const component = await import(
    await moduleUrl(new URL(`src/pages/${path}.astro`, root), cache)
  );
  const container = await AstroContainer.create();
  const pathname = path === "index" ? "/" : path.replace(/\/index$/, "");
  return container.renderToResponse(component.default, {
    request: new Request(
      new URL(`${pathname}${options.search ?? ""}`, readConfig().siteOrigin),
    ),
    locals: { nonce: "public-components-test" },
  });
}

function notices(html: string): string[] {
  return [
    ...html.matchAll(
      /<div\b[^>]*class="notice(?: [^"]*)?"[^>]*>[\s\S]*?<\/div>/g,
    ),
  ].map(([notice]) => markup(notice));
}

async function storefrontHtml(response: Response): Promise<string> {
  const html = await response.text();
  const scope = html.match(
    /<section\b[^>]*class="(?:wrap home-goods|wrap collection-section) (astro-[\w-]+)"/,
  )?.[1];
  assert(scope, "the current storefront section keeps its scoped styles");
  for (const [panel] of html.matchAll(
    /<div\b[^>]*class="notice(?: [^"]*)?"[^>]*>[\s\S]*?<\/div>/g,
  )) {
    assert(
      panel.slice(0, panel.indexOf(">")).includes(scope),
      "the notice wrapper keeps the page's CSS scope",
    );
  }
  return html.replace(/ class="([^"]*)"/g, (_attribute, classes: string) => {
    const names = classes
      .split(" ")
      .filter((name) => !name.startsWith("astro-"));
    return names.length ? ` class="${names.join(" ")}"` : "";
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

for (const search of ["", "?payment=paid"]) {
  test(`native checkout return preserves private SEO and test-only status disclosure ${search || "(no query)"}`, async () => {
    const response = await pageResponse("checkout/return", { search });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    const html = await response.text();
    assert.match(
      html,
      /<title>Back from test checkout \| The True Hive<\/title>/,
    );
    assert.match(
      html,
      /<meta name="description" content="Check your test checkout status and arrange pickup for a paid test order\. No real payment\.">/,
    );
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
    assert.doesNotMatch(html, /rel="canonical"/);
    const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1];
    assert(main, "the native return flow keeps the main landmark");
    assert.equal((main.match(/<h1\b/g) ?? []).length, 1);
    assert.match(
      main,
      /<h1 id="pickup-title">A little closer to pickup\.<\/h1>/,
    );
    assert.match(main, /Stripe test checkout — no real payment/);
    assert.match(markup(main), /Returning here does not confirm payment\./);
    assert.doesNotMatch(
      main,
      /class="pickup-receipt"|I confirm this pickup time|Pickup complete/,
      "neither a return visit nor a paid-looking query is a verified order or booking",
    );
  });
}

test("native checkout return bootstraps the customer controller with same-browser and cart/contact recovery", async () => {
  const response = await pageResponse("checkout/return");
  const html = await response.text();
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1];
  assert(main);
  const customers = [
    ...main.matchAll(
      /<section\b(?=[^>]*data-pickup-mode="customer")[^>]*>[\s\S]*?<\/section>/g,
    ),
  ];
  assert.equal(
    customers.length,
    1,
    "the real page renders one customer pickup root",
  );
  const customer = markup(customers[0]![0]);
  assert.match(customer, /aria-labelledby="pickup-title"/);
  assert.match(
    customer,
    /<button type="button" data-pickup-refresh>Refresh status<\/button>/,
  );
  assert.match(
    customer,
    /<button type="button" data-pickup-retry hidden>Retry exact request<\/button>/,
  );
  assert.match(
    customer,
    /<p class="pickup-feedback" data-pickup-status role="status" tabindex="-1">Loading the current test checkout status…<\/p>/,
  );
  assert.match(customer, /<div data-pickup-content><\/div>/);
  assert.match(customer, /Use the same browser as checkout\./);
  assert.match(customer, /An order number alone cannot restore access\./);
  assert.match(customer, /Your cart and checkout recovery stay unchanged\./);
  assert.deepEqual(
    [...customer.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map(
      ([, href, label]) => ({ href, label }),
    ),
    [
      { href: "/cart", label: "View your cart" },
      { href: "/contact", label: "Contact the shop" },
    ],
  );
  assert.match(
    customer,
    /<noscript>JavaScript is required to retrieve your private test checkout status\. Your cart remains available\.<\/noscript>/,
  );
  assert.doesNotMatch(
    customer,
    /data-pickup-authorized|data-pickup-mode="admin"|session_id|csrfToken/,
    "buyer access and CSRF are fetched in memory, not embedded in the return document",
  );
  const file = new URL("src/pages/checkout/return.astro", root);
  const compiled = transform(await readFile(file, "utf8"), {
    filename: file.pathname,
    internalURL: "astro/compiler-runtime",
    resolvePath: (specifier) => specifier,
  });
  assert(
    compiled.scripts.some(
      (script) =>
        script.type === "inline" &&
        typeof script.code === "string" &&
        parse(script.code)[0].some(
          (entry) => entry.specifier === "../../client/pickup.ts",
        ),
    ),
    "the actual return page wires the customer controller, not just its markup",
  );
});

for (const page of [
  {
    path: "index",
    unavailable: `<div class="notice" role="status">
      <h3>The collection is temporarily unavailable.</h3>
      <p>Please try again shortly, or contact us for help.</p>
    </div>`,
    empty: `<div class="notice">
      <h3>No products available.</h3>
      <p>Check back soon or <a href="/contact">get in touch</a>.</p>
    </div>`,
  },
  {
    path: "goods/index",
    unavailable: `<div class="notice" role="status">
      <h2>The catalog is temporarily unavailable.</h2>
      <p>Please try again shortly.</p>
    </div>`,
    empty: `<div class="notice">
      <h3>No products available.</h3>
      <p>Please check back soon.</p>
    </div>`,
  },
]) {
  test(`${page.path} preserves unavailable and empty notice markup and HTTP status`, async () => {
    for (const [catalog, status, notice] of [
      ["unavailable", 503, page.unavailable],
      [[], 200, page.empty],
    ] as const) {
      const response = await pageResponse(page.path, { catalog });
      assert.equal(response.status, status);
      const html = await storefrontHtml(response);
      assert.deepEqual(notices(html), [markup(notice)]);
      assert.doesNotMatch(html, /class="product-shelf"/);
      if (page.path === "index") {
        assert.match(html, /class="home-scene-art"/);
        assert.match(html, /alt="Honeybees tending golden honeycomb\."/);
        assert.match(html, /Shop all products/);
        if (catalog !== "unavailable") {
          assert.match(
            html,
            /Check back soon or <a href="\/contact">get in touch<\/a>\./,
          );
        }
      } else {
        assert.doesNotMatch(html, /class="result-count"/);
        assert.match(html, /Local Pickup Only/);
        assert.doesNotMatch(html, /id="pickup"|aria-label="Pickup locations"/);
      }
    }
  });
}

const categoryError = `<div id="filter-error" class="notice filter-error" role="status">
  <h3>Let's try those filters again.</h3>
  <p>Choose one collection from the list. The collection in this link
    wasn't recognized or was repeated.</p>
  <p>These filters have not been applied. Choose Find goods to try again,
    or use Clear filters above to start over.</p>
</div>`;

for (const search of ["?category=unknown", "?category=soap&category=honey"]) {
  test(`collection characterizes invalid category ${search}`, async () => {
    const response = await pageResponse("goods/index", {
      catalog: showcaseProducts,
      search,
    });
    assert.equal(response.status, 400);
    const html = await storefrontHtml(response);
    assert.deepEqual(notices(html), [markup(categoryError)]);
    assert.match(
      html,
      /id="collection-category"[^>]*aria-invalid="true"[^>]*aria-describedby="filter-error"/,
    );
    assert.match(html, /href="\/goods"[^>]*>[\s\S]*?Clear filters/);
    assert.doesNotMatch(
      html,
      /class="(?:product-shelf|result-count|notice no-matches)"/,
    );
  });
}

for (const entry of [
  {
    search: `?q=${"a".repeat(81)}`,
    value: "a".repeat(80),
    message:
      "The search is longer than 80 characters. Only the first 80 characters are shown in the field; edit and submit them to search.",
  },
  {
    search: "?q=soap&q=honey",
    value: "soap",
    message:
      "Use one search field with ordinary text. Repeated search values or control characters cannot be applied; review the field and submit again.",
  },
  {
    search: "?q=so%00ap",
    value: "soap",
    message:
      "Use one search field with ordinary text. Repeated search values or control characters cannot be applied; review the field and submit again.",
  },
]) {
  test(`collection preserves invalid search guidance for ${entry.search}`, async () => {
    const response = await pageResponse("goods/index", {
      catalog: showcaseProducts,
      search: entry.search,
    });
    assert.equal(response.status, 400);
    const html = await storefrontHtml(response);
    assert.deepEqual(notices(html), [
      markup(`<div id="filter-error" class="notice filter-error" role="status">
        <h3>Let's try those filters again.</h3>
        <p>${entry.message}</p>
        <p>These filters have not been applied. Choose Find goods to try again,
          or use Clear filters above to start over.</p>
      </div>`),
    ]);
    assert.match(
      html,
      /id="collection-query"[^>]*aria-invalid="true"[^>]*aria-describedby="search-help filter-error"/,
    );
    assert(html.includes(`value="${entry.value}"`));
    assert.doesNotMatch(
      html,
      /class="(?:product-shelf|result-count|notice no-matches)"/,
    );
  });
}

test("collection keeps filter guidance alongside catalog failures and empty results", async () => {
  for (const [catalog, status, heading] of [
    ["unavailable", 503, "<h2>The catalog is temporarily unavailable.</h2>"],
    [[], 400, "<h3>No products available.</h3>"],
  ] as const) {
    const response = await pageResponse("goods/index", {
      catalog,
      search: "?category=unknown",
    });
    assert.equal(response.status, status);
    const html = await storefrontHtml(response);
    const panels = notices(html);
    assert.equal(panels.length, 2);
    assert.equal(panels[0], markup(categoryError));
    assert(panels[1]?.includes(heading));
    assert.doesNotMatch(
      html,
      /class="(?:product-shelf|result-count|notice no-matches)"/,
    );
  }
});

for (const entry of [
  {
    search: "?q=missing%20%26%20%3Cbar%3E&category=soap",
    sentence:
      "Nothing in the published collection matches “missing &amp; &lt;bar&gt;” in soap . Try another word or collection, or clear the filters to see all products.",
  },
  {
    search: "?category=gifts",
    sentence:
      "Nothing in the published collection matches these filters in gifts . Try another word or collection, or clear the filters to see all products.",
  },
]) {
  test(`collection preserves no-match text, escaping and direct children for ${entry.search}`, async () => {
    const response = await pageResponse("goods/index", {
      catalog: showcaseProducts,
      search: entry.search,
    });
    assert.equal(response.status, 200);
    const html = await storefrontHtml(response);
    assert.deepEqual(notices(html), [
      markup(`<div class="notice no-matches" role="status">
        <p class="eyebrow">Room to look again</p>
        <h3>No matches, this time.</h3>
        <p>${entry.sentence}</p>
      </div>`),
    ]);
    assert.match(markup(html), /class="result-count">0 products found<\/p>/);
    assert.doesNotMatch(html, /class="product-shelf"|id="filter-error"/);
  });
}

test("current image-led storefront keeps product cards, format links and collection filtering", async () => {
  const product: Product = {
    key: "render-soap",
    slug: "render-soap",
    title: "Everyday Soap",
    summary: "A familiar favorite.",
    details: ["Gentle daily ritual"],
    ingredients: [],
    category: "soap",
    imageKey: "soap",
    kind: "active",
    variants: [
      {
        key: "full-bar",
        label: "Full bar",
        priceMinor: 900,
        currency: "USD",
        stock: { state: "available" },
      },
      {
        key: "small-bar",
        label: "Small bar",
        priceMinor: 500,
        currency: "USD",
        stock: { state: "out_of_stock" },
      },
    ],
  };
  for (const path of ["index", "goods/index"]) {
    const response = await pageResponse(path, {
      catalog: [product],
      search: path === "index" ? "" : "?category=soap&q=GENTLE",
    });
    assert.equal(response.status, 200);
    const html = await storefrontHtml(response);
    assert.deepEqual(notices(html), []);
    assert.match(html, /class="product-shelf"/);
    assert.match(
      html,
      /href="\/goods\/render-soap\?variant=full-bar#add-to-cart"/,
    );
    assert.doesNotMatch(html, /href="[^"]*variant=small-bar/);
    assert.match(html, /class="shelf-format format-unavailable"/);
    assert.match(html, /Full bar/);
    assert.match(html, /\$9\.00/);
    if (path === "index") {
      assert.match(html, /class="home-hero wrap"/);
      assert.match(html, /alt="Honeybees tending golden honeycomb\."/);
      assert.match(html, /loading="eager" fetchpriority="high"/);
      assert.match(html, /Explore our soaps, compare ingredients/);
    } else {
      assert.match(markup(html), /class="result-count">1 product found<\/p>/);
    }
  }
});

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
