import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { randomBytes } from "node:crypto";
import { transform } from "@astrojs/compiler-rs";
import { parse } from "es-module-lexer";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import type {
  Browser,
  Page,
  Request as BrowserRequest,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type {
  AdminInventoryLevel,
  AdminOrder,
  AdminProduct,
} from "../../src/domain/admin.ts";
import { pageQuery } from "../../src/components/admin/presentation.ts";
import { issueCsrf, verifyCsrf } from "../../src/server/auth/csrf.ts";
import { AdminAuthError } from "../../src/server/auth/service.ts";
import { readConfig } from "../../src/server/config.ts";

const root = new URL("../../", import.meta.url);
const modules = new Map<string, Promise<string>>();
const componentStyles = new Map<string, string[]>();
const inventoryOrigin = "https://inventory.example.invalid";
let productionMiddleware:
  | Promise<{
      onRequest: (
        context: {
          request: Request;
          url: URL;
          locals: Record<string, unknown>;
        },
        next: () => Promise<Response>,
      ) => Promise<Response>;
    }>
  | undefined;

async function productionHeaders(
  path: string,
  origin = inventoryOrigin,
  host?: string,
) {
  productionMiddleware ??= (async () => {
    let code = stripTypeScriptTypes(
      (await readFile(new URL("src/middleware.ts", root), "utf8")).replaceAll(
        "import.meta.env.PROD",
        "true",
      ),
      { mode: "transform" },
    );
    const inline = (source: string) =>
      `data:text/javascript,${encodeURIComponent(source)}`;
    const replacements: Record<string, string> = {
      "astro:middleware": inline(
        "export const defineMiddleware = handler => handler;",
      ),
      "./server/admin/config.ts": inline(
        `export const readAdminConfig = () => (${JSON.stringify({
          origin: inventoryOrigin,
          projectId: "hive-test",
        })});`,
      ),
      "./server/auth/runtime.ts": inline(
        "export const getAdminBoundary = () => ({gate: async () => ({cookies: [], response: null})});",
      ),
      "./server/auth/http.ts": new URL("src/server/auth/http.ts", root).href,
    };
    const [imports] = parse(code);
    for (const item of [...imports].reverse()) {
      if (!item.specifier || !replacements[item.specifier]) continue;
      code =
        code.slice(0, item.start) +
        replacements[item.specifier] +
        code.slice(item.end);
    }
    return import(inline(code));
  })();
  const url = new URL(path, origin);
  const middleware = await productionMiddleware;
  const response = await middleware.onRequest(
    {
      request: new Request(url, { headers: host ? { host } : {} }),
      url,
      locals: {},
    },
    async () =>
      new Response("<!doctype html>", {
        headers: { "content-type": "text/html" },
      }),
  );
  return Object.fromEntries(response.headers);
}

// Compile the actual components in memory: no site build, fixture route or port.
async function componentModule(file: URL): Promise<string> {
  let pending = modules.get(file.href);
  if (!pending) {
    pending = (async () => {
      const source = await readFile(file, "utf8");
      let code: string;
      if (file.pathname.endsWith(".astro")) {
        const compiled = transform(source, {
          filename: file.pathname,
          internalURL: "astro/compiler-runtime",
          resolvePath: (specifier) => specifier,
        });
        componentStyles.set(file.href, compiled.css);
        code = compiled.code;
      } else {
        code = stripTypeScriptTypes(source, { mode: "transform" });
      }
      const [imports] = parse(code);
      for (const item of [...imports].reverse()) {
        if (!item.specifier) continue;
        let resolved: string;
        if (item.specifier.endsWith("?url")) {
          const asset = new URL(item.specifier.slice(0, -4), file);
          resolved = `data:text/javascript,${encodeURIComponent(`export default ${JSON.stringify(asset.pathname)};`)}`;
        } else if (item.specifier.endsWith(".css")) {
          resolved = "data:text/javascript,export default {}";
        } else if (item.specifier.startsWith(".")) {
          resolved = await componentModule(new URL(item.specifier, file));
        } else {
          resolved = import.meta.resolve(item.specifier);
        }
        code = code.slice(0, item.start) + resolved + code.slice(item.end);
      }
      return `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
    })();
    modules.set(file.href, pending);
  }
  return pending;
}

async function render(
  path: string,
  props: Record<string, unknown>,
  options = {},
) {
  const component = await import(await componentModule(new URL(path, root)));
  const container = await AstroContainer.create();
  return container.renderToString(component.default, { props, ...options });
}

let browser: Browser;
const runDom = process.env["INVENTORY_UI_BROWSER_TESTS"] === "1";
const domTest = runDom ? test : test.skip;
const originalTmpDir = process.env["TMPDIR"];
test.before(async () => {
  if (!runDom) return;
  process.env["TMPDIR"] = new URL(".", root).pathname;
  const { chromium } = await import("@playwright/test");
  browser = await chromium.launch({
    env: process.env,
    timeout: 10000,
  });
});
test.after(async () => {
  await browser?.close();
  if (originalTmpDir === undefined) delete process.env["TMPDIR"];
  else process.env["TMPDIR"] = originalTmpDir;
});

const level: AdminInventoryLevel = {
  variantKey: "fixture-variant",
  locationKey: "fixture-location",
  onHand: 20,
  held: 3,
  committed: 2,
  unavailable: 1,
  sellable: 14,
  revision: 5,
};
const product: AdminProduct = {
  key: "fixture-product",
  slug: "fixture-product",
  title: "Component-only record",
  summary: "Presentation fixture, not a real product or stock seed.",
  details: [],
  ingredients: ["Fixture first", "<b>Fixture second</b>"],
  category: "soap",
  imageKey: "soap",
  kind: "active",
  status: "draft",
  revision: 7,
  variants: [
    {
      key: level.variantKey,
      sku: "COMPONENT-ONLY",
      label: "Fixture format",
      priceMinor: null,
      currency: "USD",
      active: false,
      levels: [level],
    },
  ],
};

test("ingredient editing is explicit, empty by default, ordered and escaped", async () => {
  const saved = await render("src/components/admin/ProductForm.astro", {
    product,
  });
  assert.match(saved, /name="ingredients"/);
  assert.match(saved, /Fixture first\n&lt;b&gt;Fixture second&lt;\/b&gt;/);
  assert.doesNotMatch(saved, /<b>Fixture second<\/b>/);
  const draft = await render("src/components/admin/ProductForm.astro", {});
  assert.match(draft, /name="ingredients"[^>]*><\/textarea>/);
  const html = await render("src/components/ProductIngredients.astro", {
    ingredients: product.ingredients,
  });
  assert.match(html, /<li>Fixture first<\/li>/);
  assert.match(html, /&lt;b&gt;Fixture second&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>/);
  assert.equal(
    (await render("src/components/ProductIngredients.astro", {})).trim(),
    "",
  );
  assert.equal(
    (
      await render("src/components/ProductIngredients.astro", {
        ingredients: [],
      })
    ).trim(),
    "",
  );
});

async function fixturePage(
  component: string,
  props: Record<string, unknown>,
  client = "admin.ts",
  options: {
    headers?: Record<string, string>;
    path?: string;
    csrf?: string;
  } = {},
) {
  const context = await browser.newContext({
    viewport: { width: 320, height: 1000 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(3000);
  page.setDefaultNavigationTimeout(3000);
  const html = await render(component, props);
  const script = stripTypeScriptTypes(
    await readFile(new URL(`src/client/${client}`, root), "utf8"),
    { mode: "transform" },
  );
  const nonce =
    options.headers?.["content-security-policy"]?.match(/'nonce-([^']+)'/)?.[1];
  await page.route("**/*", (route) => {
    if (route.request().isNavigationRequest()) {
      return route.fulfill({
        contentType: "text/html",
        ...(options.headers ? { headers: options.headers } : {}),
        body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Isolated component test</title><meta name="csrf-token" content="${options.csrf ?? "component-only-signed-token"}"></head><body><main><h1>Isolated component test</h1>${html}</main>${nonce ? `<script nonce="${nonce}">${script.replaceAll("</script", "<\\/script")}</script>` : ""}</body></html>`,
      });
    }
    return route.abort();
  });
  await page.goto(
    `${inventoryOrigin}${options.path ?? "/inventory/products/fixture-product"}`,
  );
  await page.addStyleTag({
    content: await readFile(new URL("src/styles/admin.css", root), "utf8"),
  });
  const styles = [...componentStyles.values()].flat().join("\n");
  if (styles) await page.addStyleTag({ content: styles });
  if (!nonce) await page.addScriptTag({ content: script });
  return page;
}

async function waitPhase(
  page: Page,
  phase: string,
  selector = "[data-admin-form]",
) {
  await page
    .locator(`${selector}[data-phase="${phase}"]`)
    .waitFor({ state: "attached", timeout: 3000 });
}

test("real priced products advertise test checkout only when explicitly enabled", async () => {
  const product = {
    key: "test-product",
    slug: "test-product",
    title: "A test record",
    summary: "Component-only merchandise, never seeded.",
    details: [],
    category: "soap",
    imageKey: "soap",
    kind: "active",
    variants: [
      {
        key: "test-variant",
        label: "Test format",
        priceMinor: 450,
        currency: "USD",
      },
    ],
  };
  assert.match(
    await render("src/components/ProductCard.astro", {
      product,
      testCheckoutEnabled: true,
    }),
    /href="\/goods\/test-product#test-checkout">\s*Test checkout\s*<\/a>/,
  );
  assert.doesNotMatch(
    await render("src/components/ProductCard.astro", {
      product,
      testCheckoutEnabled: false,
    }),
    /Test checkout/,
  );
  assert.doesNotMatch(
    await render("src/components/ProductCard.astro", {
      product: { ...product, kind: "concept" },
      testCheckoutEnabled: true,
    }),
    /Test checkout/,
  );
  assert.doesNotMatch(
    await render("src/components/ProductCard.astro", {
      product: {
        ...product,
        variants: [{ ...product.variants[0], priceMinor: null }],
      },
      testCheckoutEnabled: true,
    }),
    /Test checkout/,
  );
});

test("legacy test checkout keeps verified low-stock variants selectable", async () => {
  const html = await render("src/components/TestCheckout.astro", {
    product: {
      ...product,
      variants: [{ ...product.variants[0], priceMinor: 725 }],
    },
    enabled: true,
    availability: { [product.variants[0]!.key]: "low_stock" },
  });
  assert.match(html, /Low stock/);
  assert.match(
    html,
    new RegExp(`<option\\b[^>]*value="${product.variants[0]!.key}"`),
  );
});

test("public contact channels use the confirmed phone and free email drafts without social placeholders", async () => {
  const html = await render("src/components/ContactSection.astro", {
    contact: readConfig({}).contact,
  });
  assert.match(html, /href="tel:\+14233682262"/);
  assert.doesNotMatch(
    html,
    /not published|will appear|future beekeeping|email.*not open/i,
  );
  assert.doesNotMatch(html, /facebook\.com|instagram\.com/i);
  assert.match(html, /data-inquiry-form/);
  assert.match(html, /href="mailto:loganstakely18@gmail\.com"/);
  assert.match(html, /Nothing is sent by this website/);
  const configured = await render("src/components/ContactSection.astro", {
    contact: readConfig({
      FACEBOOK_URL: "https://www.facebook.com/verified-business",
      INSTAGRAM_URL: "https://www.instagram.com/verified-business/",
    }).contact,
  });
  assert.match(
    configured,
    /href="https:\/\/www\.facebook\.com\/verified-business"/,
  );
  assert.match(
    configured,
    /href="https:\/\/www\.instagram\.com\/verified-business\/"/,
  );
});

test("the configured phone override reaches every rendered service contact link", async () => {
  const previous = process.env["CONTACT_PHONE"];
  process.env["CONTACT_PHONE"] = "+1 (865) 555-0117";
  try {
    const html = await render(
      "src/pages/services.astro",
      {},
      {
        request: new Request("https://thetruehive.com/services"),
      },
    );
    const links = [...html.matchAll(/href="(tel:[^"]+)"/g)].map(
      (match) => match[1],
    );
    assert.ok(links.length >= 3);
    assert.deepEqual([...new Set(links)], ["tel:+18655550117"]);
    assert.doesNotMatch(html, /368-2262/);
  } finally {
    if (previous === undefined) delete process.env["CONTACT_PHONE"];
    else process.env["CONTACT_PHONE"] = previous;
  }
});

test("non-shopping information pages contain current business information rather than launch placeholders", async () => {
  for (const page of ["about", "services", "privacy", "accessibility"]) {
    const html = await render(
      `src/pages/${page}.astro`,
      {},
      {
        request: new Request(`https://thetruehive.com/${page}`),
      },
    );
    const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1];
    assert.ok(main);
    assert.doesNotMatch(
      html.replace(/<[^>]*>/g, " "),
      /Online ordering (?:isn't|is not) open yet/i,
      page,
    );
    const copy = main.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    assert.doesNotMatch(
      copy,
      /planned paths|future directions|when it's ready|not a finished story|may still be pending|channels may still be pending|reviewed before public launch|public showcase|current-showcase|Email setup remains deferred/i,
      page,
    );
    if (page === "about") {
      assert.match(copy, /Colony Rescue/);
      assert.match(copy, /Farm Pollination/);
    } else assert.match(main, /href="tel:\+14233682262"/);
  }
});

test("services copy is ready to share without planning-stage notices or booking promises", async () => {
  const html = await render(
    "src/pages/services.astro",
    {},
    {
      request: new Request("https://thetruehive.com/services"),
    },
  );
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1];
  assert.ok(main);
  const copy = main.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  assert.doesNotMatch(
    copy,
    /two directions|no instant booking|different settings|the same careful start|services are planned|planned\s*\/|not bookable|if services become available|future conversation|when it's ready/i,
  );
  assert.match(copy, /Colony Rescue/);
  assert.match(copy, /Farm Pollination/);
  assert.match(copy, /Monroe, Blount, and Knox/);
  assert.match(copy, /no cost|no-cost/i);
  assert.match(main, /href="tel:\+14233682262"/);
  assert.match(main, /href="https:\/\/doi\.org\/10\.1126\/science\.aac7287"/);
  assert.ok(main.replace(/<[^>]*>/g, "").includes("2016 study in Science"));
  assert.match(copy, /24%/);
  assert.match(copy, /fields smaller than 2 hectares/);
  for (const detail of [
    "Address",
    "Location of hive",
    "A good time to come",
    "Farm location",
    "Crops grown on the land",
    "Number of hives",
    "Preferred inspection day",
  ])
    assert.ok(copy.includes(detail), detail);
  assert.match(copy, /Do not disturb a colony or approach it for a photograph/);
  assert.match(main, /href="\/#inquiry"/);
  assert.doesNotMatch(main, /<(?:form|input|textarea)\b|href="mailto:/i);
  assert.match(html, /<title>Beekeeping services for home and farm/);
});

test("saved products expose a separate photo editor without implying new drafts already have an upload target", async () => {
  const saved = await render("src/components/admin/ProductForm.astro", {
    product,
    photosEnabled: true,
  });
  assert.match(saved, /href="\/inventory\/products\/fixture-product\/photo"/);
  const draft = await render("src/components/admin/ProductForm.astro", {
    photosEnabled: true,
  });
  assert.match(draft, /Save the draft first/i);
  assert.doesNotMatch(draft, /href="\/inventory\/products\/[^"]+\/photo"/);
  const disabled = await render("src/components/admin/ProductForm.astro", {
    product,
  });
  assert.doesNotMatch(disabled, /href="\/inventory\/products\/[^"]+\/photo"/);
  assert.match(disabled, /separate setup and billing authorization/);
  assert.doesNotMatch(saved, /still needs/);
});

domTest(
  "unsaved storefront preview follows product fields safely without saving or publishing",
  async () => {
    const page = await fixturePage(
      "src/components/admin/ProductForm.astro",
      {},
      "admin.ts",
      {
        path: "/inventory/products/new",
        headers: await productionHeaders("/inventory/products/new"),
      },
    );
    let mutations = 0;
    await page.route("**/api/**", (route) => {
      if (route.request().method() !== "GET") mutations++;
      return route.abort();
    });
    try {
      const preview = page.getByRole("complementary", {
        name: "Storefront preview",
      });
      await preview.waitFor();
      assert.match(
        await preview.innerText(),
        /Previewing never saves or publishes/,
      );
      assert.equal(await preview.locator(".shelf-product a").count(), 0);
      await page.getByLabel("Product name", { exact: true }).fill("Honey soap");
      assert.equal(
        await preview.locator("[data-preview-url]").textContent(),
        "/goods/honey-soap",
      );
      await page
        .getByLabel("Product name", { exact: true })
        .fill('Honey <img src=x onerror="window.previewRan=true">');
      await page
        .getByLabel("Summary", { exact: true })
        .fill("<script>window.previewRan=true</script> & small batches.");
      await page
        .getByRole("combobox", { name: /^Category/ })
        .selectOption("honey");
      await page
        .getByRole("combobox", { name: /^Placeholder illustration/ })
        .selectOption("honey");
      await page
        .getByRole("combobox", { name: /^Record type/ })
        .selectOption("concept");
      await page
        .getByLabel("Store URL name (slug)", { exact: true })
        .fill("honey-jar");
      assert.match(
        await preview.locator("h3").innerText(),
        /Honey <img src=x onerror=/,
      );
      assert.equal(
        await preview.locator(".shelf-description").textContent(),
        "<script>window.previewRan=true</script> & small batches.",
      );
      assert.equal(await preview.locator(".eyebrow").textContent(), "Honey");
      assert.equal(
        await preview.locator(".shelf-ticket").textContent(),
        "For the table",
      );
      assert.match(
        (await preview.locator(".product-illustration").getAttribute("src")) ??
          "",
        /honey-jar\.svg/,
      );
      assert.equal(
        await preview.locator(".pill").textContent(),
        "Concept product",
      );
      assert.equal(
        await preview.locator("[data-preview-url]").textContent(),
        "/goods/honey-jar",
      );
      assert.equal(await preview.locator("script, img[onerror]").count(), 0);
      assert.equal(await page.evaluate(() => "previewRan" in window), false);
      for (const width of [320, 768, 1280]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
      }
      await preview.locator("summary").focus();
      await page.keyboard.press("Enter");
      assert.equal(await preview.locator("details").getAttribute("open"), null);
      await page.keyboard.press("Enter");
      assert.deepEqual(
        (await new AxeBuilder({ page }).analyze()).violations,
        [],
      );
      await page.getByLabel("Product name", { exact: true }).fill("");
      await page.getByLabel("Summary", { exact: true }).fill("");
      await page.getByRole("combobox", { name: /^Category/ }).selectOption("");
      await page
        .getByRole("combobox", { name: /^Placeholder illustration/ })
        .selectOption("");
      assert.match(
        await preview.locator("h3").innerText(),
        /Your product name/,
      );
      assert.match(
        await preview.locator(".shelf-description").innerText(),
        /short summary/,
      );
      assert.equal(
        await preview.locator(".product-illustration").isVisible(),
        false,
      );
      assert.equal(mutations, 0);
      assert.equal(await page.evaluate(() => localStorage.length), 0);
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "saved-product storefront preview uses private photos and keeps concept illustrations honest",
  async () => {
    const page = await fixturePage("src/components/admin/ProductForm.astro", {
      product: { ...product, photo },
      photosEnabled: true,
    });
    try {
      const preview = page.getByRole("complementary", {
        name: "Storefront preview",
      });
      const image = preview.locator(".product-illustration");
      await preview.waitFor();
      assert.equal(
        await image.getAttribute("src"),
        `/api/admin/products/${product.key}/photo?revision=${product.revision}`,
      );
      assert.equal(await image.getAttribute("alt"), photo.alt);
      await page
        .getByRole("combobox", { name: /^Placeholder illustration/ })
        .selectOption("honey");
      assert.match((await image.getAttribute("src")) ?? "", /^\/api\/admin\//);
      await page
        .getByRole("combobox", { name: /^Record type/ })
        .selectOption("concept");
      assert.match((await image.getAttribute("src")) ?? "", /honey-jar\.svg/);
      assert.match(
        await preview.locator(".art-caption").innerText(),
        /Original illustration/,
      );
      await page
        .getByRole("combobox", { name: /^Record type/ })
        .selectOption("active");
      assert.match((await image.getAttribute("src")) ?? "", /^\/api\/admin\//);
      assert.equal(await image.getAttribute("alt"), photo.alt);
      assert.equal(await preview.locator('img[src^="/media/"]').count(), 0);
    } finally {
      await page.context().close();
    }
  },
);

test("uploaded product photos render through first-party media URLs rather than illustration labels", async () => {
  const photo = {
    id: "22222222-2222-4222-8222-222222222222",
    alt: "Wrapped component-only product",
    width: 800,
    height: 600,
    bytes: 1000,
  };
  const html = await render("src/components/ProductCard.astro", {
    product: { ...product, photo },
  });
  assert.match(
    html,
    /src="\/media\/products\/22222222-2222-4222-8222-222222222222"/,
  );
  assert.match(html, /alt="Wrapped component-only product"/);
  assert.doesNotMatch(html, /Original illustration|storage\.googleapis\.com/);
  assert.match(html, /width="800" height="600"/);
  const fallback = await render("src/components/ProductArt.astro", {
    image: "soap",
    alt: "Original concept illustration",
    eager: true,
  });
  assert.match(fallback, /soap\.svg/);
  assert.match(fallback, /alt="Original concept illustration"/);
  assert.match(fallback, /width="420" height="360" loading="eager"/);
});

const photo = {
  id: "22222222-2222-4222-8222-222222222222",
  alt: "Wrapped component-only product",
  width: 800,
  height: 600,
  bytes: 1000,
};
const photoFile = {
  name: "private-original-name.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPd8AAAAASUVORK5CYII=",
    "base64",
  ),
};

function photoMultipart(request: BrowserRequest) {
  assert.equal(request.method(), "POST");
  return new Request("https://fixture.invalid", {
    method: "POST",
    headers: { "content-type": request.headers()["content-type"]! },
    body: new Uint8Array(request.postDataBuffer()!),
  }).formData();
}

async function observePhotoUrls(page: Page) {
  await page.evaluate(() => {
    const state = window as typeof window & { releasedPhotoUrls: string[] };
    state.releasedPhotoUrls = [];
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url) => {
      state.releasedPhotoUrls.push(url);
      revoke(url);
    };
  });
}

function releasedPhotoUrls(page: Page) {
  return page.evaluate(
    () =>
      (window as typeof window & { releasedPhotoUrls: string[] })
        .releasedPhotoUrls,
  );
}

async function photoShell(token: string, record = product) {
  return `<!doctype html><html><head><meta name="csrf-token" content="${token}"></head><body>${await render(
    "src/components/admin/ProductPhotoEditor.astro",
    {
      product: record,
      enabled: true,
    },
  )}</body></html>`;
}

test("photo preview CSP permits blob images only on the exact inventory-host saved-product editor", async () => {
  const headers = await productionHeaders(
    "/inventory/products/fixture-product/photo",
  );
  assert.match(
    headers["content-security-policy"]!,
    /(?:^|; )img-src 'self' data: blob:;/,
  );
  const login = await productionHeaders("/inventory/login");
  const normalize = (value: string) =>
    value
      .replace(/'nonce-[^']+'/g, "'nonce-test'")
      .replace(" data: blob:", " data:");
  assert.deepEqual(
    {
      ...headers,
      "content-security-policy": normalize(headers["content-security-policy"]!),
    },
    {
      ...login,
      "content-security-policy": normalize(login["content-security-policy"]!),
    },
  );
  const trailingSlash = await productionHeaders(
    "/inventory/products/fixture-product/photo/",
  );
  assert.match(
    trailingSlash["content-security-policy"]!,
    /(?:^|; )img-src 'self' data: blob:;/,
  );
  assert.equal(
    normalize(trailingSlash["content-security-policy"]!),
    normalize(headers["content-security-policy"]!),
  );
  for (const [path, origin, host] of [
    ["/goods/fixture-product", "https://shop.example.invalid"],
    [
      "/inventory/products/fixture-product/photo",
      "https://shop.example.invalid",
    ],
    [
      "/inventory/products/fixture-product/photo/",
      "https://shop.example.invalid",
    ],
    ["/inventory/login", inventoryOrigin],
    ["/inventory/login/", inventoryOrigin],
    ["/inventory/products", inventoryOrigin],
    ["/inventory/products/new", inventoryOrigin],
    ["/inventory/products/fixture-product", inventoryOrigin],
    ["/inventory/products/fixture-product/photo//", inventoryOrigin],
    ["/inventory/products/fixture-product/photo/extra", inventoryOrigin],
    ["/inventory/products/fixture-product/photo/extra/", inventoryOrigin],
    ["/inventory/products/fixture_product/photo", inventoryOrigin],
    [`/inventory/products/${"a".repeat(81)}/photo`, inventoryOrigin],
    ["/inventory/products/fixture-product/%70hoto", inventoryOrigin],
    ["/api/admin/products/fixture-product/photo", inventoryOrigin],
    [
      "/inventory/products/fixture-product/photo",
      inventoryOrigin,
      "shop.example.invalid",
    ],
  ] as const) {
    const policy = (await productionHeaders(path, origin, host))[
      "content-security-policy"
    ]!;
    assert.match(policy, /(?:^|; )img-src 'self' data:;/, `${origin}${path}`);
    assert.doesNotMatch(policy, /blob:/, `${origin}${path}`);
  }
});

for (const suffix of ["", "/"])
  domTest(
    `photo selection works under enforced production CSP without permitting unsigned scripts${suffix ? " on a trailing-slash editor URL" : ""}`,
    async () => {
      const path = `/inventory/products/fixture-product/photo${suffix}`;
      const headers = await productionHeaders(path);
      const page = await fixturePage(
        "src/components/admin/ProductPhotoEditor.astro",
        { product, enabled: true },
        "admin-photo.ts",
        { headers, path },
      );
      try {
        await page.evaluate(() => {
          const script = document.createElement("script");
          script.textContent = "window.unsignedPhotoScriptRan = true";
          document.body.append(script);
        });
        await page
          .getByLabel("Photo file", { exact: true })
          .setInputFiles(photoFile);
        await page.locator("[data-photo-local] img").waitFor();
        assert.equal(
          await page
            .locator("[data-photo-local] img")
            .evaluate(
              (image: HTMLImageElement) =>
                image.complete && image.naturalWidth === 1,
            ),
          true,
        );
        assert.equal(
          await page.evaluate(() => "unsignedPhotoScriptRan" in window),
          false,
        );
      } finally {
        await page.context().close();
      }
    },
  );

domTest(
  "photo authentication recovery refreshes signed CSRF after session and nonce rotation without changing its intent",
  async () => {
    const secret = randomBytes(32).toString("base64");
    let session = "component-only-expired-session";
    let csrf = issueCsrf(secret, session);
    const oldCsrf = csrf.token;
    const page = await fixturePage(
      "src/components/admin/ProductPhotoEditor.astro",
      { product, enabled: true },
      "admin-photo.ts",
      { csrf: oldCsrf },
    );
    const recoveryOptions: Record<string, unknown>[] = [];
    await page.exposeFunction(
      "capturePhotoRecoveryOptions",
      (value: Record<string, unknown>) => {
        recoveryOptions.push(value);
      },
    );
    await page.evaluate(() => {
      const original = window.fetch.bind(window);
      window.fetch = (input, init) => {
        if (
          String(input).endsWith("/inventory/products/fixture-product/photo")
        ) {
          void (
            window as unknown as {
              capturePhotoRecoveryOptions: (value: unknown) => Promise<void>;
            }
          ).capturePhotoRecoveryOptions({
            method: init?.method,
            credentials: init?.credentials,
            mode: init?.mode,
            cache: init?.cache,
            redirect: init?.redirect,
            bounded: init?.signal instanceof AbortSignal,
            accept: new Headers(init?.headers).get("accept"),
          });
        }
        return original(input, init);
      };
    });
    const cookies = () => [
      {
        name: "__Host-hive-admin",
        value: session,
        url: inventoryOrigin,
        secure: true,
        httpOnly: true,
        sameSite: "Strict" as const,
      },
      {
        name: "__Host-hive-admin-csrf",
        value: csrf.nonce,
        url: inventoryOrigin,
        secure: true,
        httpOnly: true,
        sameSite: "Strict" as const,
      },
    ];
    await page.context().addCookies(cookies());
    let authenticated = false;
    let shellReads = 0;
    const attempts: {
      id: string;
      alt: string;
      revision: string;
      bytes: string;
      csrf: string;
    }[] = [];
    const renewedSession = "component-only-rotated-session";
    const renewedCsrf = issueCsrf(secret, renewedSession);
    const recoveryHtml = (
      await photoShell(renewedCsrf.token, {
        ...product,
        revision: 99,
        title: "Do not replace the live editor",
      })
    ).replace(
      "</body>",
      "<script>window.photoRecoveryScriptRan = true</script></body>",
    );
    await page.route("**/inventory/products/fixture-product/photo", (route) => {
      shellReads++;
      return route.fulfill({ contentType: "text/html", body: recoveryHtml });
    });
    await page.route("**/api/admin/products/fixture-product", (route) =>
      route.fulfill({ json: { product: { ...product, revision: 8, photo } } }),
    );
    await page.route(
      "**/api/admin/products/fixture-product/photo",
      async (route) => {
        const request = route.request();
        const form = await photoMultipart(request);
        const headers = request.headers();
        attempts.push({
          id: String(form.get("operationId")),
          alt: String(form.get("alt")),
          revision: String(form.get("expectedRevision")),
          bytes: Buffer.from(
            await (form.get("file") as File).arrayBuffer(),
          ).toString("hex"),
          csrf: headers["x-csrf-token"]!,
        });
        if (!authenticated) return route.fulfill({ status: 401, json: {} });
        const sentCookies = Object.fromEntries(
          (headers["cookie"] ?? "").split(";").map((part) => {
            const [name, ...value] = part.trim().split("=");
            return [name, value.join("=")];
          }),
        );
        assert.equal(sentCookies["__Host-hive-admin"], session);
        assert.equal(sentCookies["__Host-hive-admin-csrf"], csrf.nonce);
        try {
          verifyCsrf(
            new Request(request.url(), { method: "POST", headers }),
            inventoryOrigin,
            secret,
            session,
            csrf.nonce,
          );
        } catch (error) {
          assert(error instanceof AdminAuthError);
          return route.fulfill({ status: 403, json: {} });
        }
        return route.fulfill({
          json: {
            productKey: product.key,
            revision: 8,
            photo: { ...photo, alt: attempts[0]!.alt },
          },
        });
      },
    );
    try {
      await page
        .getByLabel("Photo file", { exact: true })
        .setInputFiles(photoFile);
      await page.locator("[data-photo-local] img").waitFor();
      const selectedUrl = await page
        .locator("[data-photo-local] img")
        .getAttribute("src");
      await page
        .getByLabel("Photo description", { exact: true })
        .fill("Only confirmed facts");
      await page
        .getByRole("button", { name: "Upload photo", exact: true })
        .click();
      await waitPhase(page, "uncertain", "[data-photo-form]");
      session = renewedSession;
      csrf = renewedCsrf;
      await page.context().addCookies(cookies());
      authenticated = true;
      assert.throws(
        () =>
          verifyCsrf(
            new Request(
              `${inventoryOrigin}/api/admin/products/fixture-product/photo`,
              {
                method: "POST",
                headers: { origin: inventoryOrigin, "x-csrf-token": oldCsrf },
              },
            ),
            inventoryOrigin,
            secret,
            session,
            csrf.nonce,
          ),
        AdminAuthError,
      );
      assert.equal(await page.evaluate(() => document.cookie), "");
      assert.equal(
        await page.locator("[data-photo-local] img").getAttribute("src"),
        selectedUrl,
      );
      await page
        .getByRole("button", { name: "Retry the same photo operation" })
        .click();
      await waitPhase(page, "idle", "[data-photo-form]");
      assert.equal(shellReads, 1);
      assert.deepEqual(recoveryOptions, [
        {
          method: "GET",
          credentials: "same-origin",
          mode: "same-origin",
          cache: "no-store",
          redirect: "error",
          bounded: true,
          accept: "text/html",
        },
      ]);
      assert.equal(attempts.length, 2);
      assert.equal(attempts[0]!.csrf, oldCsrf);
      assert.equal(attempts[1]!.csrf, csrf.token);
      assert.deepEqual(
        { ...attempts[0], csrf: "" },
        { ...attempts[1], csrf: "" },
      );
      assert.equal(attempts[1]!.revision, "7");
      assert.equal(attempts[1]!.bytes, photoFile.buffer.toString("hex"));
      assert.equal(
        await page.evaluate(() => "photoRecoveryScriptRan" in window),
        false,
      );
      assert.equal(await page.getByRole("form").count(), 1);
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "photo authentication recovery rejects login, redirected and malformed shells while preserving its frozen file and UUID",
  async () => {
    const secret = randomBytes(32).toString("base64");
    const token = issueCsrf(secret, "component-only-session").token;
    const page = await fixturePage(
      "src/components/admin/ProductPhotoEditor.astro",
      { product, enabled: true },
      "admin-photo.ts",
      { csrf: token },
    );
    const valid = await photoShell(token);
    const responses = [
      { status: 303, headers: { location: "/inventory/login" } },
      { status: 401, contentType: "text/html", body: valid },
      {
        status: 200,
        contentType: "text/html",
        body: `<head><meta name="csrf-token" content="${token}"></head><body>Sign in</body>`,
      },
      {
        status: 200,
        contentType: "text/html",
        body: await photoShell(token, { ...product, key: "another-product" }),
      },
      {
        status: 200,
        contentType: "text/html",
        body: valid.replace(token, "unsigned-token"),
      },
      {
        status: 200,
        contentType: "text/html",
        body: valid.replace(
          "</head>",
          `<meta name="csrf-token" content="${token}"></head>`,
        ),
      },
      { status: 200, contentType: "application/json", body: valid },
      {
        status: 200,
        contentType: "text/html",
        body: valid + " ".repeat(1024 * 1024),
      },
    ];
    let shellReads = 0;
    let authenticated = false;
    const attempts: {
      id: string;
      alt: string;
      revision: string;
      bytes: string;
    }[] = [];
    await page.route("**/inventory/products/fixture-product/photo", (route) => {
      const response = responses[shellReads++];
      return route.fulfill(
        response ?? { status: 200, contentType: "text/html", body: valid },
      );
    });
    await page.route("**/api/admin/products/fixture-product", (route) =>
      route.fulfill({ json: { product: { ...product, revision: 8, photo } } }),
    );
    await page.route(
      "**/api/admin/products/fixture-product/photo",
      async (route) => {
        const form = await photoMultipart(route.request());
        attempts.push({
          id: String(form.get("operationId")),
          alt: String(form.get("alt")),
          revision: String(form.get("expectedRevision")),
          bytes: Buffer.from(
            await (form.get("file") as File).arrayBuffer(),
          ).toString("hex"),
        });
        return authenticated
          ? route.fulfill({
              json: {
                productKey: product.key,
                revision: 8,
                photo: { ...photo, alt: product.title },
              },
            })
          : route.fulfill({ status: 403, json: {} });
      },
    );
    try {
      await page
        .getByLabel("Photo file", { exact: true })
        .setInputFiles(photoFile);
      await page.locator("[data-photo-local] img").waitFor();
      const preview = await page
        .locator("[data-photo-local] img")
        .getAttribute("src");
      await page
        .getByRole("button", { name: "Upload photo", exact: true })
        .click();
      await waitPhase(page, "uncertain", "[data-photo-form]");
      for (let index = 0; index < responses.length; index++) {
        await page
          .getByRole("button", { name: "Retry the same photo operation" })
          .click();
        await waitPhase(page, "uncertain", "[data-photo-form]");
        assert.equal(shellReads, index + 1);
        assert.equal(attempts.length, 1);
        assert.equal(
          await page
            .getByRole("link", { name: "Sign in again in a separate tab" })
            .isVisible(),
          true,
        );
        assert.equal(
          await page.getByLabel("Photo file", { exact: true }).isDisabled(),
          true,
        );
        assert.equal(
          await page.locator("[data-photo-local] img").getAttribute("src"),
          preview,
        );
        assert.equal(
          await page.locator('meta[name="csrf-token"]').getAttribute("content"),
          token,
        );
        assert.equal(
          await page.locator('[name="expectedRevision"]').inputValue(),
          "7",
        );
      }
      authenticated = true;
      await page
        .getByRole("button", { name: "Retry the same photo operation" })
        .click();
      await waitPhase(page, "idle", "[data-photo-form]");
      assert.equal(attempts.length, 2);
      assert.deepEqual(attempts[0], attempts[1]);
    } finally {
      await page.context().close();
    }
  },
);

test("photo editor keeps storage disabled truthfully and previews saved photos only through its private endpoint", async () => {
  const disabled = await render(
    "src/components/admin/ProductPhotoEditor.astro",
    { product, enabled: false },
  );
  assert.match(disabled, /Photo uploads are not enabled/);
  assert.doesNotMatch(disabled, /type="file"|data-photo-form/);
  const editor = await render("src/components/admin/ProductPhotoEditor.astro", {
    product: { ...product, photo },
    enabled: true,
  });
  assert.match(editor, /data-photo-form/);
  assert.match(editor, /src="\/api\/admin\/products\/fixture-product\/photo/);
  assert.match(editor, /value="Wrapped component-only product"/);
  assert.match(editor, /Help: Photo description/);
  assert.match(editor, /GPS/);
  assert.doesNotMatch(editor, /storage\.googleapis|Original illustration/);
});

domTest(
  "photo selection validates formats and size, previews locally, and stays accessible at narrow sizes",
  async () => {
    const page = await fixturePage(
      "src/components/admin/ProductPhotoEditor.astro",
      { product, enabled: true },
      "admin-photo.ts",
    );
    await observePhotoUrls(page);
    let mutations = 0;
    await page.route("**/api/admin/**", (route) => {
      mutations++;
      return route.abort();
    });
    try {
      await page.emulateMedia({ reducedMotion: "reduce" });
      const file = page.getByLabel("Photo file", { exact: true });
      const alt = page.getByLabel("Photo description", { exact: true });
      assert.equal(await alt.inputValue(), product.title);
      await file.setInputFiles({
        name: "not-an-image.svg",
        mimeType: "image/svg+xml",
        buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"),
      });
      await page
        .getByRole("status")
        .filter({ hasText: /JPG, PNG or WebP/ })
        .waitFor();
      assert.equal(await page.locator("[data-photo-local]").isVisible(), false);
      await file.setInputFiles({
        name: "large.png",
        mimeType: "image/png",
        buffer: Buffer.alloc(8 * 1024 * 1024 + 1),
      });
      await page.getByRole("status").filter({ hasText: /8 MiB/ }).waitFor();
      await file.setInputFiles({
        ...photoFile,
        buffer: Buffer.from("not actually an image"),
      });
      await page
        .getByRole("status")
        .filter({ hasText: /valid|decode/i })
        .waitFor();
      const tooManyPixels = Buffer.from(photoFile.buffer);
      tooManyPixels.writeUInt32BE(25000001, 16);
      await file.setInputFiles({ ...photoFile, buffer: tooManyPixels });
      await page
        .getByRole("status")
        .filter({ hasText: /25 million/ })
        .waitFor();
      const largeWebp = Buffer.alloc(30);
      largeWebp.write("RIFF");
      largeWebp.writeUInt32LE(22, 4);
      largeWebp.write("WEBPVP8X", 8);
      largeWebp.writeUInt32LE(10, 16);
      largeWebp.writeUIntLE(5000, 24, 3);
      largeWebp.writeUIntLE(4999, 27, 3);
      const largeJpeg = Buffer.from([
        0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0x13, 0x88, 0x13, 0x89, 3, 1, 17, 0,
        2, 17, 0, 3, 17, 0, 0xff, 0xd9,
      ]);
      for (const [mimeType, buffer] of [
        ["image/webp", largeWebp],
        ["image/jpeg", largeJpeg],
      ] as const) {
        await file.setInputFiles({
          name: "oversized-header",
          mimeType,
          buffer,
        });
        await page
          .getByRole("status")
          .filter({ hasText: /25 million/ })
          .waitFor();
      }
      const animationChunk = Buffer.alloc(20);
      animationChunk.writeUInt32BE(8);
      animationChunk.write("acTL", 4);
      await file.setInputFiles({
        ...photoFile,
        buffer: Buffer.concat([
          photoFile.buffer.subarray(0, 33),
          animationChunk,
          photoFile.buffer.subarray(33),
        ]),
      });
      await page
        .getByRole("status")
        .filter({ hasText: /animation/ })
        .waitFor();
      const selections: string[] = [];
      for (const mimeType of ["image/jpeg", "image/webp"]) {
        const bytes = await page.evaluate(async (mimeType) => {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 2;
          const blob = await new Promise<Blob>((resolve) =>
            canvas.toBlob((blob) => resolve(blob!), mimeType),
          );
          return [...new Uint8Array(await blob.arrayBuffer())];
        }, mimeType);
        await file.setInputFiles({
          name: "component-only",
          mimeType,
          buffer: Buffer.from(bytes),
        });
        await page.locator("[data-photo-local] img").waitFor();
        selections.push(
          (await page.locator("[data-photo-local] img").getAttribute("src"))!,
        );
      }
      await file.setInputFiles(photoFile);
      await page.locator("[data-photo-local] img").waitFor();
      const selectedUrl = (await page
        .locator("[data-photo-local] img")
        .getAttribute("src"))!;
      assert.match(
        (await page.locator("[data-photo-local] img").getAttribute("src")) ??
          "",
        /^blob:/,
      );
      await alt.fill("A confirmed description");
      assert.equal(
        await page.locator("[data-photo-local] img").getAttribute("alt"),
        "A confirmed description",
      );
      assert.doesNotMatch(
        (await page.locator("main").textContent()) ?? "",
        /private-original-name/,
      );
      for (const width of [320, 375, 768]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
      }
      await page.getByLabel("Help: Photo description", { exact: true }).focus();
      await page.keyboard.press("Enter");
      assert.equal(
        await page.getByText(/Describe the visible product/).isVisible(),
        true,
      );
      assert.deepEqual(
        (await new AxeBuilder({ page }).analyze()).violations,
        [],
      );
      assert.equal(mutations, 0);
      assert.equal(await page.evaluate(() => localStorage.length), 0);
      assert.deepEqual(await releasedPhotoUrls(page), selections);
      await page.evaluate(() =>
        window.dispatchEvent(
          new PageTransitionEvent("pagehide", { persisted: true }),
        ),
      );
      assert.deepEqual(await releasedPhotoUrls(page), [
        ...selections,
        selectedUrl,
      ]);
      assert.equal(await page.locator("[data-photo-local]").isVisible(), false);
      assert.equal(await file.inputValue(), "");
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "photo upload freezes semantic intent through a lost response, 5xx and 429, keeping receipt separate from current photo",
  async () => {
    const page = await fixturePage(
      "src/components/admin/ProductPhotoEditor.astro",
      { product, enabled: true },
      "admin-photo.ts",
    );
    await observePhotoUrls(page);
    const attempts: {
      operationId: string;
      revision: string;
      alt: string;
      bytes: string;
      filename: string;
      headers: Record<string, string>;
      fields: string[];
    }[] = [];
    const options: Record<string, unknown>[] = [];
    await page.exposeFunction(
      "capturePhotoOptions",
      (value: Record<string, unknown>) => {
        options.push(value);
      },
    );
    await page.evaluate(() => {
      const original = window.fetch.bind(window);
      window.fetch = (input, init) => {
        void (
          window as unknown as {
            capturePhotoOptions: (value: unknown) => Promise<void>;
          }
        ).capturePhotoOptions({
          cache: init?.cache,
          credentials: init?.credentials,
          redirect: init?.redirect,
          mode: init?.mode,
          bounded: init?.signal instanceof AbortSignal,
        });
        return original(input, init);
      };
    });
    let receiptPhoto = photo;
    await page.route("**/api/admin/products/fixture-product", (route) =>
      route.fulfill({
        json: {
          product: {
            ...product,
            title: "Later authoritative title",
            revision: 10,
            photo: { ...photo, alt: "Later authoritative description" },
          },
        },
      }),
    );
    await page.route(
      "**/api/admin/products/fixture-product/photo",
      async (route) => {
        const request = route.request();
        const headers = request.headers();
        const multipart = await photoMultipart(request);
        const file = multipart.get("file") as File;
        attempts.push({
          operationId: String(multipart.get("operationId")),
          revision: String(multipart.get("expectedRevision")),
          alt: String(multipart.get("alt")),
          bytes: Buffer.from(await file.arrayBuffer()).toString("hex"),
          filename: file.name,
          headers,
          fields: [...multipart.keys()].sort(),
        });
        if (attempts.length === 1) return route.abort("failed");
        if (attempts.length < 4)
          return route.fulfill({
            status: attempts.length === 2 ? 503 : 429,
            json: {},
          });
        receiptPhoto = { ...photo, alt: attempts[0]!.alt };
        return route.fulfill({
          json: { productKey: product.key, revision: 8, photo: receiptPhoto },
        });
      },
    );
    try {
      await page
        .getByLabel("Photo file", { exact: true })
        .setInputFiles(photoFile);
      await page.locator("[data-photo-local] img").waitFor();
      const localUrl = await page
        .locator("[data-photo-local] img")
        .getAttribute("src");
      await page
        .getByLabel("Photo description", { exact: true })
        .fill("Frozen confirmed facts");
      await page
        .getByRole("button", { name: "Upload photo", exact: true })
        .click();
      for (let attempt = 1; attempt <= 3; attempt++) {
        await waitPhase(page, "uncertain", "[data-photo-form]");
        assert.equal(
          await page.getByLabel("Photo file", { exact: true }).isDisabled(),
          true,
        );
        assert.equal(
          await page
            .getByLabel("Photo description", { exact: true })
            .isDisabled(),
          true,
        );
        assert.equal(
          await page.locator("[data-photo-local] img").getAttribute("src"),
          localUrl,
        );
        assert.deepEqual(await releasedPhotoUrls(page), []);
        await page
          .getByRole("button", { name: "Retry the same photo operation" })
          .click();
      }
      await waitPhase(page, "idle", "[data-photo-form]");
      assert.equal(attempts.length, 4);
      for (const attempt of attempts) {
        assert.equal(attempt.operationId, attempts[0]!.operationId);
        assert.match(attempt.operationId, /^[0-9a-f-]{36}$/);
        assert.equal(attempt.revision, "7");
        assert.equal(attempt.alt, "Frozen confirmed facts");
        assert.equal(attempt.bytes, photoFile.buffer.toString("hex"));
        assert.equal(attempt.filename, "product-photo");
        assert.deepEqual(attempt.fields, [
          "alt",
          "expectedRevision",
          "file",
          "operationId",
        ]);
        assert.equal(
          attempt.headers["x-csrf-token"],
          "component-only-signed-token",
        );
        assert.match(
          attempt.headers["content-type"]!,
          /^multipart\/form-data; boundary=/,
        );
      }
      assert.equal(options.length, 5);
      for (const option of options)
        assert.deepEqual(option, {
          cache: "no-store",
          credentials: "same-origin",
          redirect: "error",
          mode: "same-origin",
          bounded: true,
        });
      const receipt =
        (await page.locator("[data-photo-receipt]").textContent()) ?? "";
      assert.match(receipt, /revision 8/);
      assert.match(receipt, /Frozen confirmed facts/);
      assert.doesNotMatch(receipt, /Later authoritative/);
      assert.match(
        (await page.locator("[data-photo-current]").textContent()) ?? "",
        /Later authoritative title.*revision 10/s,
      );
      assert.equal(
        await page.locator("[data-photo-current] img").getAttribute("alt"),
        "Later authoritative description",
      );
      assert.equal(
        await page.locator('[name="expectedRevision"]').inputValue(),
        "10",
      );
      assert.equal(await page.locator("[data-photo-local]").isVisible(), false);
      assert.deepEqual(await releasedPhotoUrls(page), [localUrl]);
      assert.equal(
        await page.evaluate(async (url) => {
          try {
            await fetch(url!);
            return false;
          } catch {
            return true;
          }
        }, localUrl),
        true,
      );
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "photo conflicts require authoritative refresh and explicit review before a new revision and UUID",
  async () => {
    const page = await fixturePage(
      "src/components/admin/ProductPhotoEditor.astro",
      { product, enabled: true },
      "admin-photo.ts",
    );
    let available = false;
    const attempts: { id: string; revision: string; alt: string }[] = [];
    await page.route("**/api/admin/products/fixture-product", (route) =>
      route.fulfill(
        available
          ? { json: { product: { ...product, revision: 11, photo } } }
          : { status: 503, json: {} },
      ),
    );
    await page.route(
      "**/api/admin/products/fixture-product/photo",
      async (route) => {
        const multipart = await photoMultipart(route.request());
        attempts.push({
          id: String(multipart.get("operationId")),
          revision: String(multipart.get("expectedRevision")),
          alt: String(multipart.get("alt")),
        });
        return route.fulfill({
          status: attempts.length === 1 ? 409 : 422,
          json: { error: { code: "OPERATION_CONFLICT" } },
        });
      },
    );
    try {
      await page
        .getByLabel("Photo file", { exact: true })
        .setInputFiles(photoFile);
      await page.locator("[data-photo-local] img").waitFor();
      await page
        .getByLabel("Photo description", { exact: true })
        .fill("Preserved photo facts");
      await page
        .getByRole("button", { name: "Upload photo", exact: true })
        .click();
      await waitPhase(page, "conflict", "[data-photo-form]");
      assert.equal(
        await page.getByRole("button", { name: /I reviewed/ }).isVisible(),
        false,
      );
      assert.equal(
        await page
          .getByLabel("Photo description", { exact: true })
          .isDisabled(),
        true,
      );
      available = true;
      await page
        .getByRole("button", { name: "Refresh current product" })
        .click();
      await page.getByRole("button", { name: /I reviewed/ }).waitFor();
      assert.equal(
        await page.locator('[name="expectedRevision"]').inputValue(),
        "7",
      );
      assert.equal(
        await page
          .getByLabel("Photo description", { exact: true })
          .inputValue(),
        "Preserved photo facts",
      );
      assert.equal(attempts.length, 1);
      await page.getByRole("button", { name: /I reviewed/ }).click();
      await waitPhase(page, "idle", "[data-photo-form]");
      await page
        .getByRole("button", { name: "Replace photo", exact: true })
        .click();
      await waitPhase(page, "idle", "[data-photo-form]");
      assert.equal(attempts.length, 2);
      assert.notEqual(attempts[0]!.id, attempts[1]!.id);
      assert.equal(attempts[0]!.revision, "7");
      assert.equal(attempts[1]!.revision, "11");
      assert.equal(attempts[1]!.alt, attempts[0]!.alt);
      assert.equal(
        await page.getByLabel("Photo file", { exact: true }).isDisabled(),
        false,
      );
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "photo removal needs explicit confirmation and retries the same DELETE without claiming blob deletion",
  async () => {
    const page = await fixturePage(
      "src/components/admin/ProductPhotoEditor.astro",
      { product: { ...product, photo }, enabled: true },
      "admin-photo.ts",
    );
    const attempts: { method: string; body: Record<string, unknown> }[] = [];
    await page.route("**/api/admin/products/fixture-product", (route) =>
      route.fulfill({ json: { product: { ...product, revision: 8 } } }),
    );
    await page.route("**/api/admin/products/fixture-product/photo", (route) => {
      attempts.push({
        method: route.request().method(),
        body: route.request().postDataJSON(),
      });
      return attempts.length === 1
        ? route.abort("failed")
        : route.fulfill({
            json: { productKey: product.key, revision: 8, photo: null },
          });
    });
    try {
      await page
        .getByRole("button", { name: "Remove photo", exact: true })
        .click();
      assert.equal(attempts.length, 0);
      assert.equal(
        await page
          .getByRole("button", { name: "Confirm remove photo" })
          .isDisabled(),
        true,
      );
      await page.getByRole("button", { name: "Cancel removal" }).click();
      assert.equal(attempts.length, 0);
      await page
        .getByRole("button", { name: "Remove photo", exact: true })
        .click();
      await page
        .getByLabel("I confirm removal of the current primary photo")
        .check();
      await page.getByRole("button", { name: "Confirm remove photo" }).click();
      await waitPhase(page, "uncertain", "[data-photo-form]");
      await page
        .getByRole("button", { name: "Retry the same photo operation" })
        .click();
      await waitPhase(page, "idle", "[data-photo-form]");
      assert.equal(attempts.length, 2);
      assert.deepEqual(attempts[0], attempts[1]);
      assert.equal(attempts[0]!.method, "DELETE");
      assert.deepEqual(Object.keys(attempts[0]!.body).sort(), [
        "expectedRevision",
        "operationId",
      ]);
      assert.equal(attempts[0]!.body.expectedRevision, 7);
      assert.match(
        (await page.locator("[data-photo-receipt]").textContent()) ?? "",
        /removed/i,
      );
      assert.match(
        (await page.locator("[data-photo-current]").textContent()) ?? "",
        /No product photo/,
      );
      assert.doesNotMatch(
        (await page.locator("main").textContent()) ?? "",
        /blobs? (?:was |were )?deleted/i,
      );
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "photo validation prevents a removal intent while a new selection is still being checked",
  async () => {
    const page = await fixturePage(
      "src/components/admin/ProductPhotoEditor.astro",
      { product: { ...product, photo }, enabled: true },
      "admin-photo.ts",
    );
    try {
      await page
        .getByRole("button", { name: "Remove photo", exact: true })
        .click();
      await page
        .getByLabel("I confirm removal of the current primary photo")
        .check();
      await page.evaluate(() => {
        File.prototype.arrayBuffer = () => new Promise(() => {});
      });
      await page
        .getByLabel("Photo file", { exact: true })
        .setInputFiles(photoFile);
      await page
        .getByRole("status")
        .filter({ hasText: /Checking the local selection/ })
        .waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Confirm remove photo" })
          .isDisabled(),
        true,
      );
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "a confirmed photo receipt cannot reopen mutations from a stale, malformed or signed-out current product",
  async () => {
    const page = await fixturePage(
      "src/components/admin/ProductPhotoEditor.astro",
      { product, enabled: true },
      "admin-photo.ts",
    );
    let reads = 0;
    let mutations = 0;
    await page.route("**/api/admin/products/fixture-product", (route) => {
      reads++;
      if (reads === 3) return route.fulfill({ status: 401, json: {} });
      return route.fulfill({
        json: {
          product:
            reads === 1
              ? { ...product, revision: 7, photo }
              : reads === 2
                ? { ...product, key: "another-product", revision: 8, photo }
                : { ...product, revision: 8, photo },
        },
      });
    });
    await page.route("**/api/admin/products/fixture-product/photo", (route) => {
      mutations++;
      return route.fulfill({
        json: {
          productKey: product.key,
          revision: 8,
          photo: { ...photo, alt: product.title },
        },
      });
    });
    try {
      await page
        .getByLabel("Photo file", { exact: true })
        .setInputFiles(photoFile);
      await page.locator("[data-photo-local] img").waitFor();
      await page
        .getByRole("button", { name: "Upload photo", exact: true })
        .click();
      await page
        .getByRole("status")
        .filter({ hasText: /current product is unavailable/ })
        .waitFor();
      await waitPhase(page, "confirmed", "[data-photo-form]");
      assert.equal(
        await page.locator("[data-photo-receipt]").isVisible(),
        true,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Retry the same photo operation" })
          .isVisible(),
        false,
      );
      assert.equal(
        await page.getByLabel("Photo file", { exact: true }).isDisabled(),
        true,
      );
      await page
        .getByRole("button", { name: "Refresh current product" })
        .click();
      await page
        .getByRole("status")
        .filter({ hasText: /current product is unavailable/ })
        .waitFor();
      await waitPhase(page, "confirmed", "[data-photo-form]");
      await page
        .getByRole("button", { name: "Refresh current product" })
        .click();
      await page
        .getByRole("link", { name: "Sign in again in a separate tab" })
        .waitFor();
      await waitPhase(page, "confirmed", "[data-photo-form]");
      await page
        .getByRole("button", { name: "Refresh current product" })
        .click();
      await waitPhase(page, "idle", "[data-photo-form]");
      assert.equal(mutations, 1);
      assert.equal(reads, 4);
      assert.equal(
        await page.locator('[name="expectedRevision"]').inputValue(),
        "8",
      );
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "photo validation rejection allows correction but authentication failures preserve the same retry intent",
  async () => {
    const page = await fixturePage(
      "src/components/admin/ProductPhotoEditor.astro",
      { product, enabled: true },
      "admin-photo.ts",
    );
    const attempts: { id: string; alt: string; bytes: string }[] = [];
    const shell = await photoShell(
      issueCsrf(randomBytes(32).toString("base64"), "component-only-session")
        .token,
    );
    let shellReads = 0;
    await page.route("**/inventory/products/fixture-product/photo", (route) => {
      shellReads++;
      return route.fulfill({ contentType: "text/html", body: shell });
    });
    await page.route("**/api/admin/products/fixture-product", (route) =>
      route.fulfill({ json: { product: { ...product, revision: 8, photo } } }),
    );
    await page.route(
      "**/api/admin/products/fixture-product/photo",
      async (route) => {
        const multipart = await photoMultipart(route.request());
        attempts.push({
          id: String(multipart.get("operationId")),
          alt: String(multipart.get("alt")),
          bytes: Buffer.from(
            await (multipart.get("file") as File).arrayBuffer(),
          ).toString("hex"),
        });
        const status = [422, 401, 403, 200][attempts.length - 1]!;
        return route.fulfill({
          status,
          json:
            status === 200
              ? {
                  productKey: product.key,
                  revision: 8,
                  photo: { ...photo, alt: "Corrected facts" },
                }
              : {
                  error: {
                    message:
                      "private-original-name.png storage.googleapis.com raw error",
                  },
                },
        });
      },
    );
    try {
      await page
        .getByLabel("Photo file", { exact: true })
        .setInputFiles(photoFile);
      await page.locator("[data-photo-local] img").waitFor();
      await page
        .getByRole("button", { name: "Upload photo", exact: true })
        .click();
      await waitPhase(page, "idle", "[data-photo-form]");
      assert.equal(
        await page.getByLabel("Photo file", { exact: true }).isDisabled(),
        false,
      );
      await page
        .getByLabel("Photo description", { exact: true })
        .fill("Corrected facts");
      await page
        .getByRole("button", { name: "Upload photo", exact: true })
        .click();
      for (let attempt = 0; attempt < 2; attempt++) {
        await waitPhase(page, "uncertain", "[data-photo-form]");
        await page
          .getByRole("link", { name: "Sign in again in a separate tab" })
          .waitFor();
        assert.equal(
          await page
            .getByLabel("Photo description", { exact: true })
            .inputValue(),
          "Corrected facts",
        );
        await page
          .getByRole("button", { name: "Retry the same photo operation" })
          .click();
      }
      await waitPhase(page, "idle", "[data-photo-form]");
      assert.equal(attempts.length, 4);
      assert.equal(shellReads, 2);
      assert.notEqual(attempts[0]!.id, attempts[1]!.id);
      assert.deepEqual(attempts[1], attempts[2]);
      assert.deepEqual(attempts[2], attempts[3]);
      assert.equal(attempts[3]!.bytes, photoFile.buffer.toString("hex"));
      assert.doesNotMatch(
        (await page.locator("main").textContent()) ?? "",
        /storage\.googleapis|raw error|private-original-name/,
      );
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "photo responses with unverified receipt keys, revisions or photo shapes remain uncertain",
  async () => {
    const page = await fixturePage(
      "src/components/admin/ProductPhotoEditor.astro",
      { product, enabled: true },
      "admin-photo.ts",
    );
    const valid = {
      productKey: product.key,
      revision: 8,
      photo: { ...photo, alt: product.title },
    };
    const receipts = [
      { ...valid, productKey: "another-product" },
      { ...valid, revision: 7 },
      {
        ...valid,
        photo: {
          ...valid.photo,
          id: "https://storage.googleapis.com/not-allowed",
        },
      },
      { ...valid, photo: { ...valid.photo, width: 0 } },
      { ...valid, photo: null },
      valid,
    ];
    const operationIds: string[] = [];
    await page.route("**/api/admin/products/fixture-product", (route) =>
      route.fulfill({ json: { product: { ...product, revision: 8, photo } } }),
    );
    await page.route(
      "**/api/admin/products/fixture-product/photo",
      async (route) => {
        const multipart = await photoMultipart(route.request());
        operationIds.push(String(multipart.get("operationId")));
        return route.fulfill({ json: receipts[operationIds.length - 1] });
      },
    );
    try {
      await page
        .getByLabel("Photo file", { exact: true })
        .setInputFiles(photoFile);
      await page.locator("[data-photo-local] img").waitFor();
      await page
        .getByRole("button", { name: "Upload photo", exact: true })
        .click();
      for (let attempt = 0; attempt < receipts.length - 1; attempt++) {
        await waitPhase(page, "uncertain", "[data-photo-form]");
        assert.equal(
          await page.locator("[data-photo-receipt]").isVisible(),
          false,
        );
        assert.equal(
          await page.getByLabel("Photo file", { exact: true }).isDisabled(),
          true,
        );
        await page
          .getByRole("button", { name: "Retry the same photo operation" })
          .click();
      }
      await waitPhase(page, "idle", "[data-photo-form]");
      assert.equal(new Set(operationIds).size, 1);
      assert.equal(operationIds.length, receipts.length);
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "count corrections preserve one intent through lost response, with separate original receipt and current stock",
  async () => {
    const page = await fixturePage("src/components/admin/CountForm.astro", {
      variant: product.variants[0],
      level,
      productKey: product.key,
    });
    const requests: { body: string; headers: Record<string, string> }[] = [];
    const current = {
      ...level,
      onHand: 19,
      held: 4,
      sellable: 12,
      revision: 9,
    };
    await page.route("**/api/admin/products/fixture-product", (route) =>
      route.fulfill({
        json: {
          product: {
            ...product,
            variants: [{ ...product.variants[0], levels: [current] }],
          },
        },
      }),
    );
    await page.route("**/api/admin/adjustments", async (route) => {
      requests.push({
        body: route.request().postData()!,
        headers: route.request().headers(),
      });
      if (requests.length === 1) return route.abort("failed");
      const operationId = JSON.parse(requests[0]!.body).operationId;
      return route.fulfill({
        json: {
          adjustment: {
            operationId,
            beforeOnHand: 20,
            onHand: 16,
            replayed: true,
          },
          level: { ...current, onHand: 18, sellable: 11, revision: 8 },
        },
      });
    });
    try {
      await page.getByLabel("Direction").selectOption("reduce");
      await page.getByLabel("Positive whole units").fill("4");
      await page
        .getByLabel("Reason", { exact: true })
        .fill("Counted for isolated test");
      await page
        .getByRole("button", { name: "Confirm count correction" })
        .focus();
      await page.keyboard.press("Enter");
      await waitPhase(page, "uncertain");
      assert.equal(
        await page.locator('[data-quantity="onHand"]').textContent(),
        "20",
      );
      assert.equal(
        await page.getByLabel("Positive whole units").isDisabled(),
        true,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Confirm count correction" })
          .isDisabled(),
        true,
      );
      assert.equal(
        await page.getByLabel("Reason", { exact: true }).inputValue(),
        "Counted for isolated test",
      );
      await page
        .getByRole("button", { name: "Retry the same operation" })
        .focus();
      await page.keyboard.press("Enter");
      await waitPhase(page, "idle");
      assert.equal(requests.length, 2);
      assert.equal(requests[0]!.body, requests[1]!.body);
      const payload = JSON.parse(requests[0]!.body);
      assert.match(payload.operationId, /^[0-9a-f-]{36}$/);
      assert.deepEqual(
        { ...payload, operationId: "uuid" },
        {
          operationId: "uuid",
          expectedRevision: 5,
          variantKey: level.variantKey,
          locationKey: level.locationKey,
          delta: -4,
          reason: "Counted for isolated test",
        },
      );
      assert.equal(
        requests[0]!.headers["x-csrf-token"],
        "component-only-signed-token",
      );
      assert.match(
        (await page.locator("[data-admin-receipt-text]").textContent()) ?? "",
        /20 → 16.*same operation replayed/,
      );
      assert.equal(
        await page.locator('[data-quantity="onHand"]').textContent(),
        "19",
      );
      assert.equal(
        await page.locator('[data-quantity="held"]').textContent(),
        "4",
      );
      assert.equal(
        await page.locator('[data-quantity="sellable"]').textContent(),
        "12",
      );
      assert.equal(
        await page.locator('[name="expectedRevision"]').inputValue(),
        "9",
      );
    } finally {
      await page.close();
    }
  },
);

domTest(
  "a stale count requires authoritative refresh and explicit review before a new UUID and revision",
  async () => {
    const page = await fixturePage("src/components/admin/CountForm.astro", {
      variant: product.variants[0],
      level,
      productKey: product.key,
    });
    const requests: Record<string, unknown>[] = [];
    let unavailable = true;
    await page.route("**/api/admin/products/fixture-product", (route) =>
      unavailable
        ? route.fulfill({
            status: 503,
            json: { error: { code: "UNAVAILABLE", message: "Unavailable" } },
          })
        : route.fulfill({
            json: {
              product: {
                ...product,
                title: "Concurrent server edit",
                variants: [
                  {
                    ...product.variants[0],
                    levels: [
                      { ...level, onHand: 22, sellable: 16, revision: 6 },
                    ],
                  },
                ],
              },
            },
          }),
    );
    await page.route("**/api/admin/adjustments", (route) => {
      requests.push(route.request().postDataJSON());
      return route.fulfill({
        status: 409,
        json: {
          error: { code: "REVISION_CONFLICT", message: "Review current stock" },
        },
      });
    });
    try {
      await page.getByLabel("Positive whole units").fill("2");
      await page.getByLabel("Reason", { exact: true }).fill("Fixture recount");
      await page
        .getByRole("button", { name: "Confirm count correction" })
        .click();
      await waitPhase(page, "conflict");
      await page
        .getByRole("button", { name: "Refresh authoritative record" })
        .waitFor();
      assert.equal(
        await page.getByRole("button", { name: /I reviewed/ }).isVisible(),
        false,
      );
      assert.equal(
        await page.getByLabel("Positive whole units").inputValue(),
        "2",
      );
      unavailable = false;
      await page
        .getByRole("button", { name: "Refresh authoritative record" })
        .click();
      await page.getByRole("button", { name: /I reviewed/ }).waitFor();
      assert.equal(
        await page.locator('[name="expectedRevision"]').inputValue(),
        "5",
      );
      assert.equal(
        await page.locator('[data-quantity="onHand"]').textContent(),
        "22",
      );
      assert.match(
        (await page.locator("[data-admin-current-text]").textContent()) ?? "",
        /Concurrent server edit/,
      );
      await page.getByRole("button", { name: /I reviewed/ }).click();
      await waitPhase(page, "idle");
      await page
        .getByRole("button", { name: "Confirm count correction" })
        .click();
      await waitPhase(page, "conflict");
      assert.equal(requests.length, 2);
      assert.notEqual(requests[0]!.operationId, requests[1]!.operationId);
      assert.equal(requests[0]!.expectedRevision, 5);
      assert.equal(requests[1]!.expectedRevision, 6);
      assert.equal(requests[1]!.delta, 2);
      assert.equal(requests[1]!.reason, "Fixture recount");
    } finally {
      await page.close();
    }
  },
);

domTest(
  "product authoring explains identifiers with keyboard-operable field help",
  async () => {
    const page = await fixturePage(
      "src/components/admin/ProductForm.astro",
      {},
    );
    try {
      const help = page.getByLabel("Help: Product key", { exact: true });
      await help.focus();
      await page.keyboard.press("Enter");
      assert.equal(
        await page.getByText(/permanent internal identifier/i).isVisible(),
        true,
      );
      await page.keyboard.press("Enter");
      const slugHelp = page.getByLabel("Help: Store URL name", { exact: true });
      await slugHelp.focus();
      await page.keyboard.press("Enter");
      assert.equal(
        await page
          .getByText("/goods/lavender-soap-4oz", { exact: true })
          .isVisible(),
        true,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await page.keyboard.press("Enter");
      await page.getByLabel("Help: Price", { exact: true }).click();
      assert.equal(
        await page.getByText(/1500 means \$15\.00/).isVisible(),
        true,
      );
      assert.deepEqual(
        (await new AxeBuilder({ page }).analyze()).violations,
        [],
      );
      await page.keyboard.press("Escape");
      assert.equal(
        await page.getByText(/1500 means \$15\.00/).isVisible(),
        false,
      );
      await page.getByLabel("Help: Price", { exact: true }).click();
      await page.getByLabel("Variant name", { exact: true }).click();
      assert.equal(
        await page.getByText(/1500 means \$15\.00/).isVisible(),
        false,
      );
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "product examples guide blank fields without becoming saved draft values",
  async () => {
    const page = await fixturePage(
      "src/components/admin/ProductForm.astro",
      {},
    );
    let submissions = 0;
    await page.route("**/api/admin/products", (route) => {
      submissions++;
      return route.abort();
    });
    try {
      for (const name of [
        "title",
        "key",
        "slug",
        "summary",
        "details",
        "variantKey",
        "sku",
        "label",
        "priceMinor",
      ]) {
        const field = page.locator(`[name="${name}"]`);
        assert.equal(await field.inputValue(), "", name);
        assert.ok((await field.getAttribute("placeholder"))?.trim(), name);
      }
      await page
        .getByRole("button", { name: "Create unpublished product" })
        .click();
      assert.equal(submissions, 0);
      assert.match(
        await page.locator("[data-product-preview] h3").innerText(),
        /Your product name/,
      );
      await page.getByRole("button", { name: "Add another variant" }).click();
      for (const name of ["variantKey", "sku", "label", "priceMinor"]) {
        const field = page
          .locator(`[data-admin-variant] [name="${name}"]`)
          .last();
        assert.equal(await field.inputValue(), "");
        assert.ok((await field.getAttribute("placeholder"))?.trim());
      }
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "new-product identifiers follow the name until edited without renaming existing products",
  async () => {
    const page = await fixturePage(
      "src/components/admin/ProductForm.astro",
      {},
    );
    try {
      const name = page.getByLabel("Product name", { exact: true });
      const key = page.getByLabel("Product key", { exact: true });
      const slug = page.getByLabel("Store URL name (slug)", { exact: true });
      await name.fill("Caf\u00e9 & Honey Soap");
      assert.equal(await key.inputValue(), "cafe-honey-soap");
      assert.equal(await slug.inputValue(), "cafe-honey-soap");
      await key.fill("soap-spring-batch");
      await name.fill("Lavender Soap");
      assert.equal(await key.inputValue(), "soap-spring-batch");
      assert.equal(await slug.inputValue(), "lavender-soap");
      await slug.fill("spring-soap");
      await name.fill("Revised product name");
      assert.equal(await key.inputValue(), "soap-spring-batch");
      assert.equal(await slug.inputValue(), "spring-soap");
    } finally {
      await page.context().close();
    }
    const editing = await fixturePage(
      "src/components/admin/ProductForm.astro",
      {
        product,
      },
    );
    try {
      await editing
        .getByLabel("Product name", { exact: true })
        .fill("Changed name");
      assert.equal(
        await editing.getByLabel("Product key", { exact: true }).inputValue(),
        product.key,
      );
      assert.equal(
        await editing
          .getByLabel("Store URL name (slug)", { exact: true })
          .inputValue(),
        product.slug,
      );
    } finally {
      await editing.context().close();
    }
  },
);

domTest(
  "confirmed duplicate product identifiers leave the draft editable instead of trapping creation",
  async () => {
    const page = await fixturePage(
      "src/components/admin/ProductForm.astro",
      {},
    );
    const requests: Record<string, unknown>[] = [];
    await page.route("**/api/admin/products", (route) => {
      requests.push(route.request().postDataJSON());
      return route.fulfill({
        status: requests.length === 1 ? 409 : 422,
        json: {
          error: {
            code:
              requests.length === 1 ? "DUPLICATE_RECORD" : "INVALID_PRODUCT",
            message: "Review this fixture.",
            fields: { key: "Choose a unique key or URL name." },
          },
        },
      });
    });
    try {
      await page
        .getByLabel("Product name", { exact: true })
        .fill("Lavender soap");
      await page
        .getByLabel("Summary", { exact: true })
        .fill("Component-only draft, not merchandise.");
      await page
        .getByRole("combobox", { name: "Category", exact: true })
        .selectOption("soap");
      await page
        .getByRole("combobox", {
          name: "Placeholder illustration",
          exact: true,
        })
        .selectOption("soap");
      await page
        .getByLabel("Variant key", { exact: true })
        .fill("lavender-standard");
      await page
        .getByLabel("SKU (stock code)", { exact: true })
        .fill("FIXTURE-LAVENDER");
      await page
        .getByLabel("Variant name", { exact: true })
        .fill("Fixture format");
      await page
        .getByRole("button", { name: "Create unpublished product" })
        .click();
      await waitPhase(page, "idle");
      assert.equal(requests.length, 1);
      assert.equal(
        await page.getByLabel("Product name", { exact: true }).inputValue(),
        "Lavender soap",
      );
      await page
        .getByLabel("Product key", { exact: true })
        .fill("lavender-soap-second");
      await page
        .getByLabel("Store URL name (slug)", { exact: true })
        .fill("lavender-soap-second");
      await page
        .getByRole("button", { name: "Create unpublished product" })
        .click();
      await waitPhase(page, "idle");
      assert.equal(requests.length, 2);
      assert.notEqual(requests[0]!.operationId, requests[1]!.operationId);
      assert.equal(
        (requests[1]!.product as Record<string, unknown>).slug,
        "lavender-soap-second",
      );
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "product drafts serialize stable variants, preserve field values/errors, and require valid publication",
  async () => {
    const page = await fixturePage("src/components/admin/ProductForm.astro", {
      product,
    });
    const requests: Record<string, unknown>[] = [];
    await page.route("**/api/admin/products/fixture-product", (route) => {
      requests.push(route.request().postDataJSON());
      return route.fulfill({
        status: 422,
        json: {
          error: {
            code: "INVALID_PRODUCT",
            message: "Review the entered summary.",
            fields: { summary: "<script>bad()</script> remains text" },
          },
        },
      });
    });
    try {
      assert.equal(
        await page
          .getByLabel("Product key", { exact: true })
          .getAttribute("readonly"),
        "",
      );
      assert.equal(
        await page
          .getByLabel("Variant key", { exact: true })
          .getAttribute("readonly"),
        "",
      );
      await page.getByRole("button", { name: "Publish product" }).click();
      assert.equal(requests.length, 0);
      assert.match(
        (await page.locator("[data-admin-status]").textContent()) ?? "",
        /active positive-price/,
      );
      assert.equal(
        await page.getByLabel("Summary", { exact: true }).count(),
        1,
        JSON.stringify(await page.locator("label").allTextContents()),
      );
      await page
        .getByLabel("Summary", { exact: true })
        .fill("Keep my corrected draft summary.");
      await page
        .getByLabel("Ingredients (one per line)")
        .fill(" First \n\n <b>Second</b> ");
      await page.getByRole("button", { name: "Save changes" }).click();
      await waitPhase(page, "idle");
      assert.equal(requests.length, 1);
      assert.equal(requests[0]!.action, "save");
      assert.equal(requests[0]!.expectedRevision, 7);
      assert.deepEqual(
        (requests[0]!.product as { ingredients: string[] }).ingredients,
        ["First", "<b>Second</b>"],
      );
      assert.deepEqual(requests[0]!.variants, [
        {
          key: level.variantKey,
          sku: "COMPONENT-ONLY",
          label: "Fixture format",
          priceMinor: null,
          currency: "USD",
          active: false,
        },
      ]);
      assert.equal(
        await page.getByLabel("Summary", { exact: true }).inputValue(),
        "Keep my corrected draft summary.",
      );
      assert.match(
        (await page.locator("[data-admin-errors]").textContent()) ?? "",
        /<script>bad\(\)<\/script>/,
      );
      assert.equal(await page.locator("[data-admin-errors] script").count(), 0);
      await page.getByLabel("Price (USD cents)").fill("725");
      await page.getByLabel("Active variant", { exact: true }).check();
      await page.getByRole("button", { name: "Publish product" }).click();
      await waitPhase(page, "idle");
      assert.equal(requests.length, 2);
      assert.equal(requests[1]!.action, "publish");
      assert.notEqual(requests[0]!.operationId, requests[1]!.operationId);
      assert.equal(
        (requests[1]!.variants as { priceMinor: number }[])[0]!.priceMinor,
        725,
      );
    } finally {
      await page.close();
    }
  },
);

domTest(
  "ingredient editing preserves a full valid Unicode list without cutting pasted text",
  async () => {
    const page = await fixturePage("src/components/admin/ProductForm.astro", {
      product,
    });
    const ingredients = Array.from({ length: 40 }, () => "🐝".repeat(200));
    let payload: Record<string, unknown> | undefined;
    await page.route("**/api/admin/products/fixture-product", (route) => {
      payload = route.request().postDataJSON();
      return route.fulfill({
        status: 422,
        json: { error: { message: "Test-only rejection" } },
      });
    });
    try {
      const field = page.getByLabel("Ingredients (one per line)");
      await field.fill(ingredients.join("\n"));
      assert.equal(await field.inputValue(), ingredients.join("\n"));
      await page.getByRole("button", { name: "Save changes" }).click();
      await waitPhase(page, "idle");
      assert(payload);
      assert.deepEqual(
        (payload.product as { ingredients: string[] }).ingredients,
        ingredients,
      );
    } finally {
      await page.close();
    }
  },
);

domTest(
  "legacy product forms omit ingredients instead of submitting an unintended clear",
  async () => {
    const page = await fixturePage("src/components/admin/ProductForm.astro", {
      product,
    });
    let payload: Record<string, unknown> | undefined;
    await page.route("**/api/admin/products/fixture-product", (route) => {
      payload = route.request().postDataJSON();
      return route.fulfill({
        status: 422,
        json: { error: { message: "Test-only rejection" } },
      });
    });
    try {
      await page
        .locator('[name="ingredients"]')
        .evaluate((field) => field.remove());
      await page.getByRole("button", { name: "Save changes" }).click();
      await waitPhase(page, "idle");
      assert(payload);
      assert.equal("ingredients" in (payload.product as object), false);
    } finally {
      await page.close();
    }
  },
);

domTest(
  "new locations start inactive/non-pickup and do not assume addresses or stock",
  async () => {
    const page = await fixturePage(
      "src/components/admin/LocationForm.astro",
      {},
    );

    let payload: Record<string, unknown> | null = null;
    await page.route("**/api/admin/locations", (route) => {
      payload = route.request().postDataJSON();
      return route.fulfill({
        status: 422,
        json: { error: { code: "INVALID", message: "Fixture rejection" } },
      });
    });
    try {
      assert.equal(await page.getByLabel("Active location").isChecked(), false);
      assert.equal(
        await page.getByLabel("Eligible for pickup").isChecked(),
        false,
      );
      await page.getByLabel("Stable location key").fill("fixture-place");
      await page.getByLabel("Internal name").fill("Component-only place");
      await page.getByRole("button", { name: "Create location" }).click();
      await waitPhase(page, "idle");
      assert.deepEqual(payload!.location, {
        key: "fixture-place",
        name: "Component-only place",
        publicLabel: null,
        active: false,
        pickupEnabled: false,
      });
      assert.equal("expectedRevision" in payload!, false);
      assert.equal(
        await page.getByLabel("Internal name").inputValue(),
        "Component-only place",
      );
    } finally {
      await page.close();
    }
  },
);

domTest(
  "operational forms reflow at 320px and expose labels, keyboard focus and error announcements",
  async () => {
    const page = await fixturePage("src/components/admin/ProductForm.astro", {
      product,
    });
    try {
      for (const width of [320, 375, 768]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
      }
      await page.getByRole("button", { name: "Add another variant" }).focus();
      await page.keyboard.press("Enter");
      assert.equal(
        await page.getByLabel("SKU (stock code)", { exact: true }).count(),
        2,
      );
      assert.equal(
        await page
          .getByLabel("Variant key", { exact: true })
          .nth(1)
          .evaluate((node) => node === document.activeElement),
        true,
      );
      const results = await new AxeBuilder({ page }).analyze();
      assert.deepEqual(results.violations, []);
    } finally {
      await page.close();
    }
  },
);

domTest(
  "public test checkout includes only priced real variants and coarse verified availability",
  async () => {
    const publicProduct = {
      ...product,
      variants: [
        {
          key: "fixture-offered",
          label: "Offered fixture",
          priceMinor: 725,
          currency: "USD",
        },
        {
          key: "fixture-unknown",
          label: "Unknown fixture",
          priceMinor: 900,
          currency: "USD",
        },
        {
          key: "fixture-no-price",
          label: "Unpriced fixture",
          priceMinor: null,
          currency: "USD",
        },
      ],
    };
    const page = await fixturePage(
      "src/components/TestCheckout.astro",
      {
        product: publicProduct,
        enabled: true,
        availability: {
          "fixture-offered": "available",
          "fixture-unknown": "unverified",
        },
      },
      "test-checkout.ts",
    );
    try {
      assert.equal(await page.getByRole("option").count(), 1);
      assert.match(
        (await page.getByRole("option").textContent()) ?? "",
        /Offered fixture.*\$7.25/,
      );
      assert.equal(await page.getByText(/Unpriced fixture/).count(), 0);
      assert.match(
        (await page.locator("#test-checkout").textContent()) ?? "",
        /Availability could not be verified/,
      );
      assert.match(
        (await page.getByRole("heading", { level: 2 }).textContent()) ?? "",
        /no real purchase/,
      );
      assert.equal(
        await page.getByLabel("Quantity").getAttribute("max"),
        "100",
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      const noPrice = await render("src/components/TestCheckout.astro", {
        product: { ...publicProduct, variants: [publicProduct.variants[2]] },
        enabled: true,
        availability: {},
      });
      assert.doesNotMatch(noPrice, /<form/);
      const showcase = await render("src/components/TestCheckout.astro", {
        product: { ...publicProduct, kind: "concept" },
        enabled: true,
        availability: {},
      });
      assert.doesNotMatch(showcase, /<form/);
    } finally {
      await page.close();
    }
  },
);

domTest(
  "uncertain public checkout freezes payload, retries same UUID, and refuses non-Stripe redirects",
  async () => {
    const page = await fixturePage(
      "src/components/TestCheckout.astro",
      {
        product: {
          ...product,
          variants: [{ ...product.variants[0], priceMinor: 725 }],
        },
        enabled: true,
        availability: { [level.variantKey]: "available" },
      },
      "test-checkout.ts",
    );
    const requests: string[] = [];
    await page.route("**/api/checkout", (route) => {
      requests.push(route.request().postData()!);
      if (requests.length === 1) return route.abort("failed");
      return route.fulfill({
        json: { checkoutUrl: "https://checkout.stripe.com.evil.invalid/pay" },
      });
    });
    try {
      await page.getByLabel("Quantity").fill("101");
      await page
        .getByRole("button", { name: "Continue to test checkout" })
        .click();
      assert.equal(requests.length, 0);
      await page.getByLabel("Quantity").fill("3");
      await page
        .getByRole("button", { name: "Continue to test checkout" })
        .focus();
      await page.keyboard.press("Enter");
      await waitPhase(page, "uncertain", "[data-test-checkout]");
      assert.equal(await page.getByLabel("Quantity").isDisabled(), true);
      assert.equal(await page.getByLabel("Quantity").inputValue(), "3");
      await page
        .getByRole("button", { name: "Retry the same test checkout" })
        .click();
      await waitPhase(page, "uncertain", "[data-test-checkout]");
      assert.equal(requests.length, 2);
      assert.equal(requests[0], requests[1]);
      const payload = JSON.parse(requests[0]!);
      assert.deepEqual(Object.keys(payload).sort(), ["lines", "operationId"]);
      assert.deepEqual(payload.lines, [
        { variantKey: level.variantKey, quantity: 3 },
      ]);
      assert.equal(
        page.url(),
        "https://inventory.example.invalid/inventory/products/fixture-product",
      );
      assert.match(
        (await page.locator("[data-checkout-status]").textContent()) ?? "",
        /hold may exist.*does not release stock/,
      );
    } finally {
      await page.context().close();
    }
  },
);

const order: AdminOrder = {
  id: "00000000-0000-4000-8000-000000000001",
  state: "paid",
  locationKey: "fixture-location",
  totalMinor: 1450,
  currency: "USD",
  revision: 4,
  createdAt: "2026-01-01T00:00:00Z",
  paidAt: "2026-01-01T00:05:00Z",
  pickedUpAt: null,
  reconciliationReason: null,
  lines: [
    {
      variantKey: level.variantKey,
      title: "Snapshot <script>not HTML</script>",
      label: "Fixture format",
      quantity: 2,
      priceMinor: 725,
    },
  ],
};

domTest(
  "order snapshots remain escaped/read-only and only paid records offer pickup on mobile",
  async () => {
    const page = await fixturePage("src/components/admin/OrderView.astro", {
      order,
    });
    try {
      assert.equal(
        await page.getByRole("button", { name: "Record pickup" }).count(),
        1,
      );
      assert.equal(await page.getByRole("table").count(), 1);
      assert.match(
        (await page.getByRole("table").textContent()) ?? "",
        /Snapshot <script>not HTML<\/script>/,
      );
      assert.equal(await page.locator("table script").count(), 0);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      const results = await new AxeBuilder({ page }).analyze();
      assert.deepEqual(results.violations, []);
      for (const state of [
        "creating",
        "open",
        "expired",
        "picked_up",
        "reconciliation_required",
      ]) {
        const html = await render("src/components/admin/OrderView.astro", {
          order: { ...order, state },
        });
        await page.setContent(html);
        assert.equal(
          await page.getByRole("button", { name: "Record pickup" }).count(),
          0,
        );
        assert.equal(await page.locator("form").count(), 0);
      }
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "pickup confirmation serializes only UUID/revision and a lost-response retry records once",
  async () => {
    const page = await fixturePage("src/components/admin/OrderView.astro", {
      order,
    });
    const requests: string[] = [];
    const pickedUp = {
      ...order,
      state: "picked_up",
      revision: 5,
      pickedUpAt: "2026-01-01T01:00:00Z",
    };
    await page.route(`**/api/admin/orders/${order.id}/pickup`, (route) => {
      requests.push(route.request().postData()!);
      if (requests.length === 1) return route.abort("failed");
      return route.fulfill({ json: { order: pickedUp, replayed: true } });
    });
    await page.route(`**/api/admin/orders/${order.id}`, (route) =>
      route.fulfill({ json: { order: pickedUp } }),
    );
    try {
      await page.getByRole("button", { name: "Record pickup" }).click();
      assert.equal(requests.length, 0);
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Record pickup" }).click();
      await waitPhase(page, "uncertain");
      assert.equal(
        await page.locator("[data-order-state]").textContent(),
        "paid",
      );
      await page
        .getByRole("button", { name: "Retry the same operation" })
        .click();
      await waitPhase(page, "confirmed");
      assert.equal(requests.length, 2);
      assert.equal(requests[0], requests[1]);
      assert.deepEqual(
        { ...JSON.parse(requests[0]!), operationId: "uuid" },
        { operationId: "uuid", expectedRevision: 4 },
      );
      assert.equal(
        await page.locator("[data-order-state]").textContent(),
        "picked_up",
      );
      assert.equal(
        await page.getByRole("button", { name: "Record pickup" }).isDisabled(),
        true,
      );
      assert.equal(await page.evaluate(() => localStorage.length), 0);
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "a conflicting pickup refresh cannot authorize an already picked-up order",
  async () => {
    const page = await fixturePage("src/components/admin/OrderView.astro", {
      order,
    });
    let requests = 0;
    await page.route(`**/api/admin/orders/${order.id}/pickup`, (route) => {
      requests++;
      return route.fulfill({
        status: 409,
        json: {
          error: { code: "REVISION_CONFLICT", message: "Review the order" },
        },
      });
    });
    await page.route(`**/api/admin/orders/${order.id}`, (route) =>
      route.fulfill({
        json: {
          order: { ...order, state: "picked_up", revision: 5 },
        },
      }),
    );
    try {
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Record pickup" }).click();
      await page.getByRole("button", { name: /I reviewed/ }).waitFor();
      await page.getByRole("button", { name: /I reviewed/ }).click();
      await waitPhase(page, "confirmed");
      assert.equal(
        await page.getByRole("button", { name: "Record pickup" }).isDisabled(),
        true,
      );
      assert.equal(requests, 1);
      assert.match(
        (await page.locator("[data-admin-status]").textContent()) ?? "",
        /not paid.*No new pickup/,
      );
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "history renders private audit text safely and outage is not an empty or zero-stock state",
  async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(
        await render("src/components/admin/MovementHistory.astro", {
          movements: [
            {
              operationId: order.id,
              variantKey: level.variantKey,
              locationKey: level.locationKey,
              delta: -2,
              actorId: "component-only-actor",
              reason: '<img src=x onerror="bad()"> & private note',
              beforeOnHand: 20,
              onHand: 18,
              createdAt: order.createdAt,
            },
          ],
        }),
      );
      assert.match(
        (await page.getByRole("list").textContent()) ?? "",
        /<img src=x onerror="bad\(\)"> & private note/,
      );
      assert.equal(await page.getByRole("list").locator("img").count(), 0);
      await page.setContent(
        await render("src/components/admin/ReadState.astro", {
          unavailable: true,
        }),
      );
      assert.match(
        (await page.getByRole("status").textContent()) ?? "",
        /temporarily unavailable.*Unknown stock is not zero/s,
      );
      await page.setContent(
        await render("src/components/admin/ReadState.astro", {
          empty: "No products match.",
        }),
      );
      assert.match(
        (await page.getByRole("status").textContent()) ?? "",
        /No products match/,
      );
      assert.doesNotMatch(
        (await page.getByRole("status").textContent()) ?? "",
        /temporarily unavailable/,
      );
    } finally {
      await page.close();
    }
  },
);

domTest(
  "search pagination is bounded and preserves encoded search instead of creating arbitrary links",
  async () => {
    const query = pageQuery(
      new URL(
        "https://inventory.example.invalid/inventory/products?offset=999999999&search=%3Ctest%3E",
      ),
    );
    assert.deepEqual(query, { limit: 20, offset: 0, search: "<test>" });
    const page = await browser.newPage();
    try {
      await page.setContent(
        await render("src/components/admin/Pagination.astro", {
          path: "/inventory/products",
          offset: 20,
          total: 55,
          search: "<test> & draft",
        }),
      );
      const next = await page
        .getByRole("link", { name: "Next page" })
        .getAttribute("href");
      assert.equal(
        new URL(next!, "https://inventory.example.invalid").searchParams.get(
          "search",
        ),
        "<test> & draft",
      );
      assert.equal(
        new URL(next!, "https://inventory.example.invalid").searchParams.get(
          "offset",
        ),
        "40",
      );
      await page.setContent(
        await render("src/components/admin/Pagination.astro", {
          path: "/inventory/products",
          offset: 10000,
          total: 15000,
        }),
      );
      assert.equal(
        await page.getByRole("link", { name: "Next page" }).count(),
        0,
      );
    } finally {
      await page.close();
    }
  },
);

domTest(
  "login shell exposes only public configuration with the frozen TOTP/enrollment selectors",
  async () => {
    const config = {
      enabled: true,
      apiKey: "public</script><script>bad()</script>",
      authDomain: "fixture.firebaseapp.com",
      projectId: "component-only",
      forbidden: "must-not-be-rendered",
    };
    const page = await fixturePage("src/components/admin/LoginShell.astro", {
      config,
      csrfToken: "component-only-token",
    });
    try {
      assert.equal(
        await page
          .locator("[data-admin-login]")
          .getAttribute("data-csrf-token"),
        "component-only-token",
      );
      const body = await page.locator("[data-firebase-config]").textContent();
      assert.deepEqual(Object.keys(JSON.parse(body!)).sort(), [
        "apiKey",
        "authDomain",
        "enabled",
        "projectId",
      ]);
      assert.equal(JSON.parse(body!).apiKey, config.apiKey);
      assert.doesNotMatch(await page.content(), /must-not-be-rendered/);
      assert.equal(await page.locator("[data-admin-google]").count(), 1);
      assert.equal(
        await page.locator('[data-admin-totp-form] [name="totp"]').count(),
        1,
      );
      assert.equal(
        await page
          .locator('[data-admin-enrollment-form] [name="enrollmentCode"]')
          .count(),
        1,
      );
      assert.equal(
        await page.locator("[data-admin-enrollment]").isVisible(),
        false,
      );
      assert.equal(
        await page.locator("[data-admin-enrollment-secret]").textContent(),
        "",
      );
      assert.equal(
        await page.locator("[data-admin-login-status]").getAttribute("role"),
        "status",
      );
      const disabled = await render("src/components/admin/LoginShell.astro", {
        config: {
          enabled: false,
          apiKey: null,
          authDomain: null,
          projectId: null,
        },
      });
      assert.doesNotMatch(disabled, /data-admin-google|<form/);
      assert.match(disabled, /sign-in is unavailable/);
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "admin layout requires trusted identity, supplies noindex/no-store and server-confirmed sign-out",
  async () => {
    await assert.rejects(
      render("src/layouts/AdminLayout.astro", { title: "Private" }),
      /Verified inventory session required/,
    );
    const component = await import(
      await componentModule(new URL("src/layouts/AdminLayout.astro", root))
    );
    const container = await AstroContainer.create();
    const response = await container.renderToResponse(component.default, {
      props: { title: "Inventory" },
      partial: false,
      locals: {
        nonce: "component-only",
        admin: { uid: "component-only-uid", actorId: "component-only-actor" },
        csrfToken: "component-only-token",
      },
    });
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    const html = await response.text();
    const context = await browser.newContext({
      viewport: { width: 320, height: 1000 },
    });
    const page = await context.newPage();
    const requests: { method: string; csrf: string | undefined }[] = [];
    await page.route("**/*", (route) =>
      route.request().isNavigationRequest()
        ? route.fulfill({ contentType: "text/html", body: html })
        : route.abort(),
    );
    await page.route("**/api/admin/logout", (route) => {
      requests.push({
        method: route.request().method(),
        csrf: route.request().headers()["x-csrf-token"],
      });
      return route.fulfill({
        status: 503,
        json: { error: { code: "UNAVAILABLE", message: "Fixture failure" } },
      });
    });
    try {
      await page.goto("https://inventory.example.invalid/inventory/products");
      await page.addStyleTag({
        content: await readFile(new URL("src/styles/admin.css", root), "utf8"),
      });
      await page.addScriptTag({
        content: stripTypeScriptTypes(
          await readFile(new URL("src/client/admin.ts", root), "utf8"),
          { mode: "transform" },
        ),
      });
      await page.keyboard.press("Tab");
      assert.equal(
        await page
          .getByRole("link", { name: "Skip to inventory" })
          .evaluate((node) => node === document.activeElement),
        true,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await page.getByRole("button", { name: "Sign out" }).click();
      await page.getByText(/Sign-out is unverified/).waitFor();
      assert.deepEqual(requests, [
        { method: "POST", csrf: "component-only-token" },
      ]);
      assert.equal(
        page.url(),
        "https://inventory.example.invalid/inventory/products",
      );
      assert.equal(
        await page.getByRole("button", { name: "Sign out" }).isDisabled(),
        false,
      );
      await page.route("**/api/admin/logout", (route) =>
        route.fulfill({ json: { signedOut: true } }),
      );
      await page.getByRole("button", { name: "Sign out" }).click();
      await page.waitForURL("**/inventory/login");
    } finally {
      await context.close();
    }
  },
);

domTest(
  "a verified hosted test checkout URL navigates without sending browser prices or releasing inventory",
  async () => {
    const page = await fixturePage(
      "src/components/TestCheckout.astro",
      {
        product: {
          ...product,
          variants: [{ ...product.variants[0], priceMinor: 725 }],
        },
        enabled: true,
        availability: { [level.variantKey]: "available" },
      },
      "test-checkout.ts",
    );
    let payload: Record<string, unknown> | null = null;
    await page.route("https://checkout.stripe.com/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<h1>Isolated hosted destination</h1>",
      }),
    );
    await page.route("**/api/checkout", (route) => {
      payload = route.request().postDataJSON();
      return route.fulfill({
        json: {
          checkoutUrl: "https://checkout.stripe.com/c/pay/component-only",
        },
      });
    });
    try {
      await page.getByLabel("Quantity").fill("100");
      await page
        .getByRole("button", { name: "Continue to test checkout" })
        .click();
      await page.waitForURL("https://checkout.stripe.com/c/pay/component-only");
      assert.deepEqual(payload!.lines, [
        { variantKey: level.variantKey, quantity: 100 },
      ]);
      assert.deepEqual(Object.keys(payload!).sort(), ["lines", "operationId"]);
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "archiving is a revisioned intent, not an accidental save of unsaved merchandise",
  async () => {
    const page = await fixturePage("src/components/admin/ProductForm.astro", {
      product,
    });
    const requests: Record<string, unknown>[] = [];
    await page.route("**/api/admin/products/fixture-product", (route) => {
      requests.push(route.request().postDataJSON());
      return route.fulfill({
        status: 422,
        json: { error: { code: "FIXTURE_REJECTION", message: "Keep values" } },
      });
    });
    try {
      await page
        .getByLabel("Product name", { exact: true })
        .fill("Unsaved title must not be archived as an edit");
      await page.getByRole("button", { name: "Archive product" }).click();
      await waitPhase(page, "idle");
      assert.deepEqual(Object.keys(requests[0]!).sort(), [
        "action",
        "expectedRevision",
        "operationId",
      ]);
      assert.equal(requests[0]!.action, "archive");
      assert.equal(requests[0]!.expectedRevision, 7);
      await page.getByLabel("Product name", { exact: true }).fill("");
      await page.getByRole("button", { name: "Archive product" }).click();
      await waitPhase(page, "idle");
      assert.equal(requests.length, 2);
      assert.equal(
        await page.getByLabel("Product name", { exact: true }).inputValue(),
        "",
      );
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "rate limited checkout retries preserve an uncertain serialized intent",
  { timeout: 10000 },
  async () => {
    const page = await fixturePage(
      "src/components/TestCheckout.astro",
      {
        product: {
          ...product,
          variants: [{ ...product.variants[0], priceMinor: 725 }],
        },
        enabled: true,
        availability: { [level.variantKey]: "available" },
      },
      "test-checkout.ts",
    );
    const bodies: string[] = [];
    await page.route("**/api/checkout", (route) => {
      bodies.push(route.request().postData()!);
      return route.fulfill({
        status: bodies.length === 2 ? 429 : 503,
        json: { error: { message: "Fixture retry needed" } },
      });
    });
    try {
      await page
        .getByRole("button", { name: "Continue to test checkout" })
        .click();
      await waitPhase(page, "uncertain", "[data-test-checkout]");
      await page.locator("[data-checkout-retry]").click();
      await page
        .locator('[data-test-checkout]:not([data-phase="pending"])')
        .waitFor();
      assert.equal(
        await page.locator("[data-test-checkout]").getAttribute("data-phase"),
        "uncertain",
      );
      assert.equal(await page.getByLabel("Quantity").isDisabled(), true);
      assert.equal(await page.getByLabel("Variant").isDisabled(), true);
      assert.equal(
        await page
          .getByRole("button", { name: "Continue to test checkout" })
          .isDisabled(),
        true,
      );
      await page.locator("[data-checkout-retry]").click();
      await waitPhase(page, "uncertain", "[data-test-checkout]");
      assert.equal(bodies.length, 3);
      assert.equal(bodies[1], bodies[0]);
      assert.equal(bodies[2], bodies[0]);
    } finally {
      await page.context().close();
    }
  },
);
