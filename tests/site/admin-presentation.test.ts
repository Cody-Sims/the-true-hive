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
  BrowserContext,
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
      "../scripts/private-studio.mjs": new URL(
        "scripts/private-studio.mjs",
        root,
      ).href,
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

test("the cart publishes the confirmed pickup address without promising walk-in hours", async () => {
  const html = await render(
    "src/pages/cart.astro",
    {},
    { request: new Request("https://thetruehive.com/cart") },
  );
  assert.match(html, /7031 New Highway 68/);
  assert.match(html, /Madisonville, TN 37354/);
  assert.match(html, /Arrange a pickup time/);
  assert.doesNotMatch(html, /Open daily|Walk-ins welcome/i);
});

test("verified inventory navigation includes store purchase controls", async () => {
  const html = await render(
    "src/layouts/AdminLayout.astro",
    { title: "Store settings" },
    {
      request: new Request("https://inventory.thetruehive.com/inventory/store"),
      locals: {
        admin: { uid: "component-only-uid", actorId: "component-only-actor" },
        csrfToken: "component-only-token",
      },
    },
  );
  assert.match(html, /href="\/inventory\/store"/);
  assert.match(html, /Store settings/);
  assert.match(html, /href="\/inventory\/pickups"/);
});

test("Workbench drafts require a verified actor and use an opaque account and record namespace", async () => {
  const anonymous = await render("src/components/admin/ProductForm.astro", {
    product,
  });
  assert.doesNotMatch(anonymous, /data-workbench-storage="[^"]+"/);
  const options = (actorId: string) => ({
    locals: {
      admin: { uid: "private-fixture-uid", actorId },
      csrfToken: "private-fixture-token",
    },
  });
  const html = await render(
    "src/components/admin/ProductForm.astro",
    { product },
    options("private-fixture-actor"),
  );
  const key = html.match(/data-workbench-storage="([^"]+)"/)?.[1];
  assert.match(key ?? "", /^hive-workbench:v1:[a-f0-9]{64}:[a-f0-9]{64}$/);
  assert.doesNotMatch(key ?? "", /private-fixture|fixture-product/);
  const other = await render(
    "src/components/admin/ProductForm.astro",
    { product },
    options("other-actor"),
  );
  assert.notEqual(other.match(/data-workbench-storage="([^"]+)"/)?.[1], key);
  assert.match(html, /data-workbench-base-revision="7"/);
  assert.match(html, /id="workbench-essentials"/);
  assert.match(html, /id="workbench-story"/);
  assert.match(html, /id="workbench-variants"/);
  assert.match(html, /id="workbench-record"/);
  assert.match(html, /<dialog[^>]+data-workbench-dialog/);
});

domTest(
  "Workbench bounds device recovery to twelve records per account without evicting unresolved operations",
  async () => {
    const page = await fixturePage(
      "src/components/admin/ProductForm.astro",
      { product },
      "admin.ts",
      { locals: workbenchLocals },
    );
    try {
      await page
        .getByLabel("Product name", { exact: true })
        .fill("Seed editable recovery");
      await page.waitForFunction(() => localStorage.length === 1);
      await page.evaluate(() => {
        const key =
          document.querySelector<HTMLElement>("[data-workbench]")!.dataset
            .workbenchStorage!;
        const prefix = key.slice(0, key.lastIndexOf(":") + 1);
        const draft = JSON.parse(localStorage.getItem(key)!);
        for (let index = 0; index < 12; index++)
          localStorage.setItem(
            `${prefix}${String(index).padStart(64, "0")}`,
            JSON.stringify({
              ...draft,
              updatedAt: Date.now() - 1000 * (index + 1),
              ...(index === 11
                ? { kind: "safety", fields: undefined, variants: undefined }
                : {}),
            }),
          );
      });
      await page
        .getByLabel("Product name", { exact: true })
        .fill("Trigger bounded recovery");
      await page.waitForFunction(() => localStorage.length <= 12);
      assert.equal(
        await page.evaluate(() =>
          Object.values(localStorage).some(
            (raw) => JSON.parse(raw).kind === "safety",
          ),
        ),
        true,
      );
    } finally {
      await page.context().close();
    }
  },
);

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

test("inventory home supports the full bounded SKU search", () => {
  const search = "S".repeat(160);
  assert.equal(
    pageQuery(
      new URL(
        `https://inventory.example.invalid/inventory/products?search=${search}EXCESS&offset=49`,
      ),
    ).search,
    search,
  );
  assert.equal(
    pageQuery(
      new URL("https://inventory.example.invalid/inventory/products?offset=49"),
    ).offset,
    40,
  );
});

test("inventory workspace keeps product and location entry points available during a read outage", async () => {
  const previous = process.env["ADMIN_DATABASE_URL"];
  process.env["ADMIN_DATABASE_URL"] = "";
  try {
    const html = await render(
      "src/pages/inventory/products/index.astro",
      {},
      {
        request: new Request(
          "https://inventory.example.invalid/inventory/products?search=SOAP",
        ),
        locals: {
          admin: { uid: "component-only-uid", actorId: "component-only-actor" },
          csrfToken: "component-only-token",
        },
      },
    );
    assert.match(html, /href="\/inventory\/products\/new"/);
    assert.match(html, /href="\/inventory\/locations#new-location"/);
    assert.match(html, /href="\/inventory\/locations"/);
    assert.match(html, /value="SOAP"/);
    assert.match(html, /temporarily unavailable/i);
    assert.doesNotMatch(html, /data-admin-form="adjustment"/);
  } finally {
    if (previous === undefined) delete process.env["ADMIN_DATABASE_URL"];
    else process.env["ADMIN_DATABASE_URL"] = previous;
  }
});

async function loadBrowserClients(client: string | string[]) {
  const clientModules = new Map<string, string>();
  const clientPaths = new Map<string, string>();
  async function loadClient(file: URL): Promise<string> {
    const existing = clientPaths.get(file.href);
    if (existing) return existing;
    const path = `/__fixture_client/${clientPaths.size}.js`;
    clientPaths.set(file.href, path);
    let code = stripTypeScriptTypes(await readFile(file, "utf8"), {
      mode: "transform",
    });
    const [imports] = parse(code);
    for (const item of [...imports].reverse()) {
      if (!item.specifier) continue;
      if (!item.specifier.startsWith("."))
        throw new Error("Component fixtures require local browser modules.");
      const resolved = await loadClient(new URL(item.specifier, file));
      code = code.slice(0, item.start) + resolved + code.slice(item.end);
    }
    clientModules.set(path, code);
    return path;
  }
  const entrypoints = await Promise.all(
    (Array.isArray(client) ? client : [client]).map((file) =>
      loadClient(new URL(`src/client/${file}`, root)),
    ),
  );
  return { clientModules, entrypoints };
}

async function fixturePage(
  component: string,
  props: Record<string, unknown>,
  client: string | string[] = "admin.ts",
  options: {
    headers?: Record<string, string>;
    path?: string;
    csrf?: string;
    locals?: Record<string, unknown>;
    context?: BrowserContext;
  } = {},
) {
  const context =
    options.context ??
    (await browser.newContext({
      viewport: { width: 320, height: 1000 },
    }));
  const page = await context.newPage();
  page.setDefaultTimeout(3000);
  page.setDefaultNavigationTimeout(3000);
  const html = await render(
    component,
    props,
    options.locals
      ? {
          request: new Request(
            `${inventoryOrigin}${options.path ?? "/inventory/products"}`,
          ),
          locals: options.locals,
        }
      : {},
  );
  const { clientModules, entrypoints } = await loadBrowserClients(client);
  const nonce =
    options.headers?.["content-security-policy"]?.match(/'nonce-([^']+)'/)?.[1];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const module = clientModules.get(url.pathname);
    if (url.origin === inventoryOrigin && module !== undefined)
      return route.fulfill({
        contentType: "text/javascript",
        body: module,
      });
    const illustration = ["soap.svg", "honey-jar.svg", "candle.svg"].find(
      (name) =>
        url.pathname === new URL(`prototypes/assets/${name}`, root).pathname,
    );
    if (url.origin === inventoryOrigin && illustration)
      return route.fulfill({
        contentType: "image/svg+xml",
        body: await readFile(
          new URL(`prototypes/assets/${illustration}`, root),
        ),
      });
    if (route.request().isNavigationRequest()) {
      return route.fulfill({
        contentType: "text/html",
        ...(options.headers ? { headers: options.headers } : {}),
        body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Isolated component test</title><meta name="csrf-token" content="${options.csrf ?? "component-only-signed-token"}"></head><body><main><h1>Isolated component test</h1>${html}</main>${entrypoints.map((src) => `<script type="module" src="${src}"${nonce ? ` nonce="${nonce}"` : ""}></script>`).join("")}</body></html>`,
      });
    }
    return route.abort();
  });
  if (
    (Array.isArray(client) ? client : [client]).includes("test-checkout.ts")
  ) {
    await page.route("**/api/checkout/access", async (route) => {
      assert.equal(route.request().postData(), "{}");
      await route.fulfill({ json: { ready: true, csrfToken: "A".repeat(43) } });
    });
  }
  await page.goto(
    `${inventoryOrigin}${options.path ?? "/inventory/products/fixture-product"}`,
  );
  await page.addStyleTag({
    content: await readFile(new URL("src/styles/admin.css", root), "utf8"),
  });
  const styles = [...componentStyles.values()].flat().join("\n");
  if (styles) await page.addStyleTag({ content: styles });
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

const workbenchLocals = {
  admin: { uid: "workbench-fixture-uid", actorId: "workbench-fixture-actor" },
  csrfToken: "workbench-fixture-token",
};

domTest(
  "Workbench recovers bounded editable text without persisting immutable variant identifiers or operational data",
  async () => {
    const page = await fixturePage(
      "src/components/admin/ProductForm.astro",
      { product },
      "admin.ts",
      { locals: workbenchLocals },
    );
    try {
      await page
        .getByLabel("Product name", { exact: true })
        .fill("Changed only on this device");
      // Text input is deliberate: incomplete cents must not be coerced to zero.
      await page.locator('[name="priceMinor"]').fill("45");
      await page.waitForFunction(() => localStorage.length === 1);
      const stored = await page.evaluate(() =>
        localStorage.getItem(localStorage.key(0)!)!,
      );
      assert.match(stored, /Changed only on this device/);
      assert.doesNotMatch(
        stored,
        /COMPONENT-ONLY|fixture-variant|onHand|sellable|levels|csrf|workbench-fixture|photo/i,
      );
      await page.reload();
      await page
        .getByRole("button", { name: "Restore local draft", exact: true })
        .click();
      assert.equal(
        await page.getByLabel("Product name", { exact: true }).inputValue(),
        "Changed only on this device",
      );
      assert.equal(
        await page.locator('[name="sku"]').inputValue(),
        "COMPONENT-ONLY",
      );
      assert.equal(
        await page.locator('[name="variantKey"]').inputValue(),
        "fixture-variant",
      );
      assert.equal(
        await page.locator('[name="priceMinor"]').inputValue(),
        "45",
      );
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "Workbench refuses stale, corrupt, future and oversized drafts without replacing server fields",
  async () => {
    const page = await fixturePage(
      "src/components/admin/ProductForm.astro",
      { product },
      "admin.ts",
      { locals: workbenchLocals },
    );
    try {
      await page.getByLabel("Product name", { exact: true }).fill("Stale text");
      await page.waitForFunction(() => localStorage.length === 1);
      const saved = await page.evaluate(() =>
        localStorage.getItem(localStorage.key(0)!)!,
      );
      const key = await page
        .locator("[data-workbench]")
        .getAttribute("data-workbench-storage");
      for (const [raw, message] of [
        [
          JSON.stringify({ ...JSON.parse(saved), baseRevision: 6 }),
          /newer|revision|stale/i,
        ],
        ["{not json", /corrupt|unreadable/i],
        [
          JSON.stringify({ ...JSON.parse(saved), version: 99 }),
          /newer|version/i,
        ],
        [" ".repeat(100000), /large|bounded/i],
      ] as const) {
        await page.evaluate(
          ([key, raw]) => localStorage.setItem(key!, raw!),
          [key, raw],
        );
        await page.reload();
        assert.equal(
          await page.getByLabel("Product name", { exact: true }).inputValue(),
          product.title,
        );
        assert.equal(
          await page
            .getByRole("button", { name: "Restore local draft", exact: true })
            .isVisible(),
          false,
        );
        assert.match(
          await page.locator("[data-workbench-draft-status]").innerText(),
          message,
        );
      }
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "Workbench safety markers survive reload and never persist a frozen request or silently permit a new operation",
  async () => {
    const page = await fixturePage(
      "src/components/admin/ProductForm.astro",
      { product },
      "admin.ts",
      { locals: workbenchLocals },
    );
    let requests = 0;
    await page.route("**/api/admin/products/fixture-product", (route) => {
      requests++;
      return route.abort();
    });
    try {
      await page
        .getByLabel("Product name", { exact: true })
        .fill("Uncertain edit");
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await waitPhase(page, "uncertain");
      const raw = await page.evaluate(() =>
        localStorage.getItem(localStorage.key(0)!)!,
      );
      assert.match(raw, /"kind":"safety"/);
      assert.doesNotMatch(
        raw,
        /Uncertain edit|COMPONENT-ONLY|fixture-variant|operationId|payload/,
      );
      await page.reload();
      assert.match(
        await page.locator("[data-workbench-draft-status]").innerText(),
        /unverified|unresolved/i,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Save changes", exact: true })
          .isDisabled(),
        true,
      );
      assert.equal(requests, 1);
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "Workbench has one document scroll, a current-data detail preview and a native mobile preview dialog",
  async () => {
    const page = await fixturePage(
      "src/components/admin/ProductForm.astro",
      { product },
      "admin.ts",
    );
    try {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page
        .getByLabel("Details (one paragraph per line)", { exact: true })
        .fill("Confirmed detail\n<script>no execution</script>");
      await page.locator('[name="priceMinor"]').fill("725");
      await page
        .getByRole("button", { name: "Open full product preview", exact: true })
        .click();
      const detail = page.locator("[data-preview-detail]");
      await detail.waitFor();
      assert.match(await detail.innerText(), /Confirmed detail/);
      assert.match(
        await page.locator("[data-preview-variants]").innerText(),
        /Fixture format/,
      );
      assert.match(
        await page.locator("[data-preview-variants]").innerText(),
        /\$7\.25/,
      );
      assert.match(await detail.innerText(), /Fixture first/);
      assert.equal(
        await detail.locator("script, [data-add-to-cart]").count(),
        0,
      );
      await page
        .getByRole("button", { name: "Collection card", exact: true })
        .click();
      await page.evaluate(() => window.scrollTo(0, 0));
      const screenshots = process.env["INVENTORY_UI_SCREENSHOT_DIR"];
      if (screenshots)
        await page.screenshot({
          path: `${screenshots}/workbench-native-desktop.png`,
        });
      const before = await page.locator("[data-product-preview]").boundingBox();
      await page.evaluate(() => window.scrollBy(0, 300));
      const after = await page.locator("[data-product-preview]").boundingBox();
      assert.equal(Math.round(before!.y - after!.y), 300);
      assert.deepEqual(
        await page
          .locator("[data-intent-fields], [data-product-preview]")
          .evaluateAll((nodes) =>
            nodes.map((node) => getComputedStyle(node).overflowY),
          ),
        ["visible", "visible"],
      );
      await page.setViewportSize({ width: 320, height: 900 });
      await page
        .getByRole("button", { name: "Preview product", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Customer preview",
        exact: true,
      });
      assert.equal(
        await dialog.evaluate((node) => (node as HTMLDialogElement).open),
        true,
      );
      assert.equal(await dialog.locator("[data-product-preview]").count(), 1);
      const scrollBeforePreviewWheel = await page.evaluate(() => scrollY);
      await page.mouse.move(2, 2);
      await page.mouse.wheel(0, 400);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      assert.equal(
        await page.evaluate(() => scrollY),
        scrollBeforePreviewWheel,
        "the mobile preview must not scroll the background form",
      );
      if (screenshots)
        await page.screenshot({
          path: `${screenshots}/workbench-native-mobile-preview.png`,
        });
      await page.keyboard.press("Escape");
      assert.equal(await dialog.isVisible(), false);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "Workbench cross-tab drafts require an explicit choice and safety markers cannot be overwritten by another editor",
  async () => {
    const page = await fixturePage(
      "src/components/admin/ProductForm.astro",
      { product },
      "admin.ts",
      { locals: workbenchLocals },
    );
    const second = await fixturePage(
      "src/components/admin/ProductForm.astro",
      { product },
      "admin.ts",
      { locals: workbenchLocals, context: page.context() },
    );
    try {
      await page
        .getByLabel("Product name", { exact: true })
        .fill("First tab only");
      await second.locator("[data-workbench-keep]").waitFor();
      assert.equal(
        await second
          .getByRole("button", { name: "Save changes", exact: true })
          .isDisabled(),
        true,
      );
      await second
        .getByLabel("Product name", { exact: true })
        .fill("Explicit second-tab choice");
      page.once("dialog", (dialog) => dialog.accept());
      await page
        .getByRole("button", { name: "Clear local draft", exact: true })
        .click();
      await second
        .getByRole("button", { name: "Keep this tab's edits", exact: true })
        .waitFor();
      second.once("dialog", (dialog) => dialog.accept());
      await second
        .getByRole("button", { name: "Keep this tab's edits", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Restore local draft", exact: true })
        .waitFor();
      page.once("dialog", (dialog) => dialog.accept());
      await page
        .getByRole("button", { name: "Restore local draft", exact: true })
        .click();
      assert.equal(
        await page.getByLabel("Product name", { exact: true }).inputValue(),
        "Explicit second-tab choice",
      );
      await second.route("**/api/admin/products/fixture-product", (route) =>
        route.abort(),
      );
      await second
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await waitPhase(second, "uncertain");
      await page.locator("[data-workbench-safety]").waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Save changes", exact: true })
          .isDisabled(),
        true,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Clear local draft", exact: true })
          .isDisabled(),
        true,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Keep this tab's edits", exact: true })
          .isVisible(),
        false,
      );
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "Workbench recovers incomplete price text and new variant labels but requires re-entry of unsaved identities",
  async () => {
    const page = await fixturePage(
      "src/components/admin/ProductForm.astro",
      { product },
      "admin.ts",
      { locals: workbenchLocals },
    );
    try {
      await page
        .getByRole("button", { name: "Add another variant", exact: true })
        .click();
      const row = page
        .locator("[data-admin-variants] > [data-admin-variant]")
        .last();
      await row
        .locator('[name="variantKey"]')
        .fill("never-persist-this-variant");
      await row.locator('[name="sku"]').fill("NEVER-PERSIST-THIS-SKU");
      await row.locator('[name="label"]').fill("New reviewed format");
      await row.locator('[name="priceMinor"]').fill("12.");
      await page.waitForFunction(() =>
        Object.values(localStorage).some((raw) => raw.includes("12.")),
      );
      await page.reload();
      await page
        .getByRole("button", { name: "Restore local draft", exact: true })
        .click();
      const restored = page
        .locator("[data-admin-variants] > [data-admin-variant]")
        .last();
      assert.equal(
        await restored.locator('[name="priceMinor"]').inputValue(),
        "12.",
      );
      assert.equal(
        await restored.locator('[name="label"]').inputValue(),
        "New reviewed format",
      );
      assert.equal(
        await restored.locator('[name="variantKey"]').inputValue(),
        "",
      );
      assert.equal(await restored.locator('[name="sku"]').inputValue(), "");
      assert.match(
        await page.locator("[data-workbench-draft-status]").innerText(),
        /re-enter/i,
      );
      assert.doesNotMatch(
        await page.evaluate(() => JSON.stringify(localStorage)),
        /NEVER-PERSIST|never-persist/,
      );
    } finally {
      await page.context().close();
    }
  },
);
domTest(
  "Workbench archives variants locally and guarded deletion requires clean edits and a matching tombstone receipt",
  async () => {
    const page = await fixturePage(
      "src/components/admin/ProductForm.astro",
      { product },
      "admin.ts",
      { locals: workbenchLocals },
    );
    const requests: { method: string; body: Record<string, unknown> }[] = [];
    await page.route(
      "**/api/admin/products/fixture-product/variants/fixture-variant",
      async (route) => {
        requests.push({
          method: route.request().method(),
          body: route.request().postDataJSON(),
        });
        assert.equal(
          route.request().headers()["x-csrf-token"],
          "component-only-signed-token",
        );
        await route.fulfill({
          json: {
            deleted: {
              type: "variant",
              key: "fixture-variant",
              productKey: "fixture-product",
              revision: 8,
            },
            product: { ...product, revision: 8, variants: [] },
          },
        });
      },
    );
    try {
      await page
        .getByRole("button", { name: "Restore variant", exact: true })
        .click();
      assert.equal(
        await page.locator('[name="variantActive"]').isChecked(),
        true,
      );
      assert.equal(requests.length, 0);
      await page
        .getByRole("button", { name: "Delete saved variant", exact: true })
        .click();
      assert.match(
        await page.locator("[data-admin-status]").innerText(),
        /unsaved|save|reset/i,
      );
      assert.equal(requests.length, 0);
      page.once("dialog", (dialog) => dialog.accept());
      await page
        .getByRole("button", { name: "Reset to server values", exact: true })
        .click();
      page.once("dialog", (dialog) => dialog.accept());
      await page
        .getByRole("button", { name: "Delete saved variant", exact: true })
        .click();
      await waitPhase(page, "confirmed");
      assert.equal(requests.length, 1);
      assert.equal(requests[0]!.method, "DELETE");
      assert.equal(requests[0]!.body.expectedRevision, 7);
      assert.match(String(requests[0]!.body.operationId), /^[a-f0-9-]{36}$/);
      assert.deepEqual(Object.keys(requests[0]!.body).sort(), [
        "expectedRevision",
        "operationId",
      ]);
      assert.match(
        await page.locator("[data-admin-receipt-text]").innerText(),
        /deleted|deletion/i,
      );
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "Workbench does not send a new operation when the verified account cannot persist an unresolved-outcome safety marker",
  async () => {
    const page = await fixturePage(
      "src/components/admin/ProductForm.astro",
      { product },
      "admin.ts",
      { locals: workbenchLocals },
    );
    let requests = 0;
    await page.route("**/api/admin/products/fixture-product", (route) => {
      requests++;
      return route.abort();
    });
    try {
      await page.evaluate(() => {
        Storage.prototype.setItem = () => {
          throw new DOMException("Storage full", "QuotaExceededError");
        };
      });
      await page
        .getByLabel("Product name", { exact: true })
        .fill("Only this tab");
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await waitPhase(page, "idle");
      assert.equal(requests, 0);
      assert.match(
        await page.locator("[data-admin-status]").innerText(),
        /safety|storage/i,
      );
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "Workbench product deletion freezes the same UUID through a mismatched receipt and clears recovery only after a matching tombstone",
  async () => {
    const page = await fixturePage(
      "src/components/admin/ProductForm.astro",
      { product },
      "admin.ts",
      { locals: workbenchLocals },
    );
    const attempts: string[] = [];
    await page.route("**/api/admin/products/fixture-product", async (route) => {
      assert.equal(route.request().method(), "DELETE");
      attempts.push(route.request().postData()!);
      return route.fulfill({
        json: {
          deleted: {
            type: "product",
            key: attempts.length === 1 ? "wrong-product" : product.key,
            productKey: product.key,
            revision: 8,
          },
        },
      });
    });
    try {
      await page.locator(".workbench-record-tools > summary").click();
      page.once("dialog", (dialog) => dialog.accept());
      await page
        .getByRole("button", {
          name: "Delete product permanently",
          exact: true,
        })
        .click();
      await waitPhase(page, "uncertain");
      assert.match(
        await page.evaluate(() => localStorage.getItem(localStorage.key(0)!)!),
        /"kind":"safety"/,
      );
      await page
        .getByRole("button", { name: "Retry the same operation", exact: true })
        .click();
      await waitPhase(page, "confirmed");
      assert.equal(attempts.length, 2);
      assert.equal(attempts[0], attempts[1]);
      assert.equal(await page.evaluate(() => localStorage.length), 0);
      assert.equal(
        await page.locator("[data-admin-receipt] a").getAttribute("href"),
        "/inventory/products",
      );
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "Workbench saves archived products without publishing and restores through a separate minimal operation",
  async () => {
    const archived = { ...product, status: "archived" };
    const page = await fixturePage(
      "src/components/admin/ProductForm.astro",
      { product: archived },
      "admin.ts",
    );
    const requests: Record<string, unknown>[] = [];
    await page.route("**/api/admin/products/fixture-product", async (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({
          json: { product: { ...archived, revision: 8 } },
        });
      const body = route.request().postDataJSON();
      requests.push(body);
      return route.fulfill({
        json: {
          product: {
            ...archived,
            status: body.action === "restore" ? "draft" : "archived",
            revision: body.action === "restore" ? 9 : 8,
          },
        },
      });
    });
    try {
      assert.equal(
        await page
          .getByRole("button", { name: "Publish product", exact: true })
          .count(),
        0,
      );
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await waitPhase(page, "idle");
      assert.equal(requests[0]!.action, "save");
      assert.equal(
        await page.locator("[data-workbench-record-status]").innerText(),
        "archived",
      );
      await page
        .getByRole("button", { name: "Restore to draft", exact: true })
        .click();
      await waitPhase(page, "confirmed");
      assert.equal(requests[1]!.action, "restore");
      assert.equal(requests[1]!.expectedRevision, 8);
      assert.deepEqual(Object.keys(requests[1]!).sort(), [
        "action",
        "expectedRevision",
        "operationId",
      ]);
    } finally {
      await page.context().close();
    }
  },
);

for (const manualRefresh of [false, true]) {
  domTest(
    `Workbench requires review of an intervening product revision after ${manualRefresh ? "manual" : "automatic"} receipt refresh`,
    async () => {
      const page = await fixturePage(
        "src/components/admin/ProductForm.astro",
        { product },
        "admin.ts",
        { locals: workbenchLocals },
      );
      let writes = 0;
      let reads = 0;
      await page.route(
        "**/api/admin/products/fixture-product",
        async (route) => {
          if (route.request().method() === "GET") {
            reads++;
            if (manualRefresh && reads === 1) return route.abort();
            return route.fulfill({
              json: {
                product: {
                  ...product,
                  title: "Another administrator's intervening edit",
                  revision: 9,
                },
              },
            });
          }
          writes++;
          return route.fulfill({
            json: {
              product: {
                ...product,
                title: "My confirmed revision eight",
                revision: 8,
              },
            },
          });
        },
      );
      try {
        await page
          .getByLabel("Product name", { exact: true })
          .fill("My confirmed revision eight");
        await page
          .getByRole("button", { name: "Save changes", exact: true })
          .click();
        if (manualRefresh) {
          await page.waitForFunction(() =>
            document
              .querySelector("[data-admin-status]")
              ?.textContent?.includes(
                "refreshed current records are unavailable",
              ),
          );
          await page
            .getByRole("button", {
              name: "Refresh authoritative record",
              exact: true,
            })
            .click();
        }
        await page
          .locator("[data-admin-current-text]")
          .filter({
            hasText: "Another administrator's intervening edit",
          })
          .waitFor();
        assert.equal(
          await page.locator("[data-admin-form]").getAttribute("data-phase"),
          "conflict",
        );
        assert.notEqual(
          await page.locator('[name="expectedRevision"]').inputValue(),
          "9",
        );
        assert.equal(
          await page.getByLabel("Product name", { exact: true }).inputValue(),
          "My confirmed revision eight",
        );
        assert.match(
          await page.locator("[data-admin-receipt-text]").innerText(),
          /revision 8/,
        );
        assert.match(
          await page.locator("[data-admin-current-text]").innerText(),
          /"revision": 9/,
        );
        assert.equal(
          await page
            .getByRole("button", { name: "Save changes", exact: true })
            .isDisabled(),
          true,
        );
        await page
          .locator("[data-admin-form]")
          .evaluate((form) =>
            form.dispatchEvent(
              new SubmitEvent("submit", { bubbles: true, cancelable: true }),
            ),
          );
        assert.equal(writes, 1);
        assert.equal(await page.evaluate(() => localStorage.length), 0);
        await page
          .getByRole("button", {
            name: "I reviewed the current record; allow a new intent",
            exact: true,
          })
          .click();
        await waitPhase(page, "idle");
        assert.equal(
          await page.locator('[name="expectedRevision"]').inputValue(),
          "9",
        );
        assert.equal(
          await page
            .getByRole("button", { name: "Save changes", exact: true })
            .isEnabled(),
          true,
        );
        assert.equal(writes, 1);
      } finally {
        await page.context().close();
      }
    },
  );
}

test("active product cards show canonical prices and cart options without enabling checkout", async () => {
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
  const browseOnly = await render("src/components/ProductCard.astro", {
    product,
  });
  assert.match(
    browseOnly,
    /href="\/goods\/test-product\?variant=test-variant#add-to-cart"/,
  );
  assert.match(browseOnly, /\$4\.50/);
  assert.match(browseOnly, /Test format/);
  assert.doesNotMatch(
    browseOnly,
    /Test checkout|data-add-to-cart|\/api\/checkout/,
  );
  assert.doesNotMatch(
    await render("src/components/ProductCard.astro", {
      product: { ...product, kind: "concept" },
    }),
    /#add-to-cart|\$4\.50/,
  );
  assert.doesNotMatch(
    await render("src/components/ProductCard.astro", {
      product: {
        ...product,
        variants: [{ ...product.variants[0], priceMinor: null }],
      },
    }),
    /#add-to-cart/,
  );
});

test("unknown or unavailable preferred formats fall back to an offered variant without changing identity", async () => {
  const record = {
    ...product,
    kind: "active",
    variants: [
      {
        ...product.variants[0],
        priceMinor: 1000,
        stock: { state: "out_of_stock" },
      },
      {
        ...product.variants[0],
        key: "available-wolf",
        label: "Wolf",
        priceMinor: 1250,
        stock: { state: "available" },
      },
    ],
  };
  for (const preferredVariantKey of [
    record.variants[0]!.key,
    "not-a-variant",
  ]) {
    const html = await render("src/components/AddToCart.astro", {
      product: record,
      preferredVariantKey,
    });
    assert.match(html, /value="fixture-variant"[^>]*disabled/);
    assert.match(html, /value="available-wolf"[^>]*checked/);
    assert.match(html, /Sold out/);
    assert.doesNotMatch(html, /value="not-a-variant"/);
  }
});

test("each known soap variant renders its own individual reference without crossing product identities", async () => {
  const sources = new Set<string>();
  for (const [key, variantKey, filename] of [
    [
      "coconut-milk-delight",
      "coconut-milk-delight-4oz-single",
      "soap-delight-bar",
    ],
    [
      "coconut-milk-delight",
      "coconut-milk-delight-4oz-wolf",
      "soap-delight-wolf",
    ],
    ["the-true-soap", "the-true-soap-4oz-single", "soap-true-bar"],
    ["the-true-soap", "the-true-soap-4oz-wolf", "soap-true-wolf"],
  ] as const) {
    const html = await render("src/components/ProductArt.astro", {
      image: "soap",
      referenceKey: key,
      referenceVariantKey: variantKey,
    });
    assert.ok(html.includes(filename), filename);
    assert.match(html, /AI styling reference/);
    const src = html.match(/\bsrc="([^"]+)"/)?.[1];
    assert.ok(src);
    sources.add(src);
  }
  assert.equal(sources.size, 4);
  const wrongProduct = await render("src/components/ProductArt.astro", {
    image: "soap",
    referenceKey: "coconut-milk-delight",
    referenceVariantKey: "the-true-soap-4oz-wolf",
  });
  assert.match(wrongProduct, /soap-delight-bar/);
  assert.doesNotMatch(wrongProduct, /soap-true-wolf/);
});

domTest(
  "variant gallery buttons and format radios stay synchronized without mutations",
  async () => {
    const record = {
      ...product,
      key: "coconut-milk-delight",
      kind: "active",
      variants: [
        {
          ...product.variants[0],
          key: "coconut-milk-delight-4oz-single",
          label: "Single 4oz bar",
          priceMinor: 1000,
          stock: { state: "available" },
        },
        {
          ...product.variants[0],
          key: "coconut-milk-delight-4oz-wolf",
          label: "Single 1oz Wolf Mold",
          priceMinor: 1250,
          stock: { state: "available" },
        },
      ],
    };
    const page = await fixturePage(
      "src/components/ProductGallery.astro",
      { product: record },
      "product-gallery.ts",
    );
    try {
      const form = await render("src/components/AddToCart.astro", {
        product: record,
      });
      await page
        .locator("main")
        .evaluate(
          (node, html) => node.insertAdjacentHTML("beforeend", html),
          form,
        );
      let mutations = 0;
      page.on("request", (request) => {
        if (request.method() !== "GET") mutations++;
      });
      const hero = page.locator("[data-gallery-art] img");
      assert.match((await hero.getAttribute("src"))!, /soap-delight-bar/);
      await page
        .getByRole("button", { name: "View Single 1oz Wolf Mold", exact: true })
        .click();
      assert.match((await hero.getAttribute("src"))!, /soap-delight-wolf/);
      assert.equal(
        await page
          .getByRole("radio", { name: /Single 1oz Wolf Mold/ })
          .isChecked(),
        true,
      );
      const bar = page.getByRole("radio", { name: /Single 4oz bar/ });
      await bar.focus();
      await page.keyboard.press("Space");
      assert.match((await hero.getAttribute("src"))!, /soap-delight-bar/);
      assert.equal(
        await page
          .getByRole("button", { name: "View Single 4oz bar", exact: true })
          .getAttribute("aria-pressed"),
        "true",
      );
      assert.equal(mutations, 0);
    } finally {
      await page.context().close();
    }
  },
);

test("soap reference cards disclose generated imagery, show format prices and preserve real uploaded photos", async () => {
  const record = {
    ...product,
    key: "coconut-milk-delight",
    slug: "coconut-milk-delight",
    kind: "active",
    summary: "Long product description belongs on the product page.",
    variants: [
      {
        ...product.variants[0],
        priceMinor: 1000,
        label: "Single 4oz bar",
        stock: { state: "available" },
      },
      {
        ...product.variants[0],
        key: "fixture-wolf",
        priceMinor: 1250,
        label: "Single 1oz Wolf Mold",
        stock: { state: "low_stock", remaining: 3 },
      },
    ],
  };
  const html = (
    await render("src/components/ProductCard.astro", { product: record })
  ).replace(/\s+/g, " ");
  assert.match(html, /AI styling reference/);
  assert.match(html, /soap-delight-bar/);
  assert.match(html, /variant=fixture-variant#add-to-cart/);
  assert.match(html, /variant=fixture-wolf#add-to-cart/);
  assert.match(html, /Single 4oz bar/);
  assert.match(html, /Single 1oz Wolf Mold/);
  assert.match(html, /\$10\.00/);
  assert.match(html, /\$12\.50/);
  assert.match(html, /Only 3 left/);
  assert.doesNotMatch(html, /Long product description belongs/);
  const real = await render("src/components/ProductCard.astro", {
    product: {
      ...record,
      photo: {
        id: "real-photo",
        alt: "Owner's actual soap",
        width: 800,
        height: 1000,
      },
    },
  });
  assert.match(real, /\/media\/products\/real-photo/);
  assert.doesNotMatch(real, /AI styling reference|soap-delight-bar/);
  const missing = await render("src/components/ProductArt.astro", {
    image: "soap",
    referenceKey: "unknown-product",
  });
  assert.doesNotMatch(missing, /soap-delight|soap-true/);
  const soldOut = await render("src/components/ProductCard.astro", {
    product: {
      ...record,
      variants: record.variants.map((variant) => ({
        ...variant,
        stock: { state: "out_of_stock" },
      })),
    },
  });
  assert.match(soldOut, /Sold out/);
  assert.doesNotMatch(soldOut, /\?variant=/);
});

domTest(
  "visible format choices preselect a valid format and add only its canonical identity to the cart",
  async () => {
    const record = {
      ...product,
      kind: "active",
      variants: [
        {
          ...product.variants[0],
          label: "Single 4oz bar",
          priceMinor: 1000,
          stock: { state: "available" },
        },
        {
          ...product.variants[0],
          key: "fixture-wolf",
          label: "Single 1oz Wolf Mold",
          priceMinor: 1250,
          stock: { state: "available" },
        },
      ],
    };
    const page = await fixturePage(
      "src/components/AddToCart.astro",
      {
        product: record,
        preferredVariantKey: "fixture-wolf",
      },
      "cart.ts",
    );
    let mutations = 0;
    await page.route("**/api/catalog", (route) =>
      route.fulfill({ json: { source: "database", products: [record] } }),
    );
    page.on("request", (request) => {
      if (request.method() !== "GET") mutations++;
    });
    try {
      const wolf = page.getByRole("radio", { name: /Single 1oz Wolf Mold/ });
      assert.equal(await wolf.isChecked(), true);
      await page.getByRole("radio", { name: /Single 4oz bar/ }).check();
      await wolf.check();
      await page
        .getByRole("button", { name: "Add to cart", exact: true })
        .click();
      await page
        .locator("[data-add-status]")
        .getByText(/Added to your cart/)
        .waitFor();
      assert.deepEqual(
        await page.evaluate(
          () => JSON.parse(localStorage.getItem("true-hive-cart")!).lines,
        ),
        [{ variantKey: "fixture-wolf", quantity: 1 }],
      );
      assert.equal(mutations, 0);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      assert.deepEqual(
        (await new AxeBuilder({ page }).analyze()).violations,
        [],
      );
    } finally {
      await page.context().close();
    }
  },
);

test("compact shopping cards show a canonical starting price and preserve stock warnings", async () => {
  const pricedProduct = {
    ...product,
    variants: [
      {
        ...product.variants[0],
        priceMinor: 725,
        stock: { state: "low_stock", remaining: 3 },
      },
      {
        ...product.variants[0],
        key: "fixture-pair",
        label: "Pair",
        priceMinor: 1400,
        stock: { state: "available" },
      },
    ],
  };
  const html = await render("src/components/ProductPrices.astro", {
    product: pricedProduct,
    compact: true,
  });
  assert.match(html.replace(/\s+/g, " "), /From \$7\.25/);
  assert.match(html, /Only 3 left/);
  assert.doesNotMatch(html, /\$14\.00/);
  const empty = await render("src/components/ProductPrices.astro", {
    product: {
      ...product,
      variants: [{ ...product.variants[0], priceMinor: null }],
    },
    compact: true,
  });
  assert.doesNotMatch(empty, /\$0\.00|From \$/);
});

test("product buying controls stay concise without hiding actual sold-out states", async () => {
  const active = {
    ...product,
    variants: [{ ...product.variants[0], priceMinor: 725 }],
  };
  const html = await render("src/components/AddToCart.astro", {
    product: active,
  });
  assert.match(html, /data-add-to-cart/);
  assert.match(html, /Add to cart/);
  assert.doesNotMatch(
    html.replace(/\s+/g, " "),
    /does not reserve stock or place an order/,
  );
  const soldOut = await render("src/components/AddToCart.astro", {
    product: {
      ...active,
      variants: [{ ...active.variants[0], stock: { state: "out_of_stock" } }],
    },
  });
  assert.match(soldOut, /Sold out/);
  assert.doesNotMatch(soldOut, /data-add-to-cart/);
});

test("public layout exposes workspace navigation only for verified administrator locals and never caches it publicly", async () => {
  const component = await import(
    await componentModule(new URL("src/layouts/SiteLayout.astro", root))
  );
  const container = await AstroContainer.create();
  for (const admin of [
    undefined,
    { uid: "fixture-admin", actorId: "fixture-actor" },
  ]) {
    const response = await container.renderToResponse(component.default, {
      props: { title: "Storefront fixture", description: "Storefront fixture" },
      locals: { nonce: "component-fixture", ...(admin ? { admin } : {}) },
    });
    const html = await response.text();
    if (admin) {
      assert.match(html, /aria-label="Administrator navigation"/);
      assert.match(html, /href="\/inventory\/products"/);
      assert.match(html, /href="\/prototypes\/"/);
      assert.match(html, /href="\/prototypes\/plan\.html"/);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.match(response.headers.get("vary")!, /Cookie/);
    } else
      assert.doesNotMatch(html, /Administrator navigation|href="\/inventory/);
  }
});

test("configured test checkout labels shopping pages as a test store without paused-store prose", async () => {
  const environment = {
    SITE_URL: "https://sandbox.example.test",
    SITE_INDEXABLE: "false",
    CATALOG_SOURCE: "database",
    DATABASE_TLS: "verify-full",
    DATABASE_URL: "postgresql://public:fixture@database.example.test/inventory",
    ADMIN_DATABASE_URL:
      "postgresql://writer:fixture@database.example.test/inventory",
    MIGRATION_DATABASE_URL: "",
    INVENTORY_ENABLED: "true",
    CHECKOUT_MODE: "stripe-test",
    CHECKOUT_LOCATION_KEY: "sandbox-pickup",
    STOREFRONT_LOCATION_KEY: "sandbox-pickup",
    STRIPE_SECRET_KEY: "sk_test_fixtureabcdefgh",
    STRIPE_WEBHOOK_SECRET: "whsec_fixtureabcdefgh",
  };
  const previous = Object.fromEntries(
    Object.keys(environment).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, environment);
  try {
    const html = (
      await render("src/layouts/SiteLayout.astro", {
        title: "Test fixture",
        description: "Test fixture",
        path: "/goods",
      })
    ).replace(/\s+/g, " ");
    assert.match(html, /Test store/);
    assert.match(html, /no real payments or pickups/);
    assert.doesNotMatch(html, /paused|isn't open yet|database\.example/);
  } finally {
    for (const [key, value] of Object.entries(previous))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
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
  assert.match(main, /href="\/contact#inquiry"/);
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
    await page.setViewportSize({ width: 1280, height: 1000 });
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
    await page.setViewportSize({ width: 1280, height: 1000 });
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

test("authenticated private preview CSP supports device-local photos without opening storefront blob execution", async () => {
  for (const path of [
    "/prototypes/editor/",
    "/prototypes/guided-next/index.html",
    "/prototypes/workbench-next/",
  ]) {
    const policy = (await productionHeaders(path))["content-security-policy"]!;
    assert.match(policy, /img-src 'self' data: blob:;/, path);
    assert.doesNotMatch(
      policy,
      /script-src[^;]*(?:blob:|'unsafe-inline')/,
      path,
    );
  }
  for (const path of [
    "/goods",
    "/contact",
    "/prototypes/not-a-real-page.html",
  ]) {
    assert.doesNotMatch(
      (await productionHeaders(path))["content-security-policy"]!,
      /blob:/,
      path,
    );
  }
});

test("photo preview CSP permits blob images only on the exact inventory-host saved-product editor", async () => {
  const headers = await productionHeaders(
    "/inventory/products/fixture-product/photo",
  );
  assert.match(
    headers["content-security-policy"]!,
    /(?:^|; )img-src 'self' data: blob:;/,
  );
  const login = await productionHeaders("/inventory/products");
  const loginShell = await productionHeaders("/inventory/login");
  assert.match(
    loginShell["content-security-policy"]!,
    /identitytoolkit\.googleapis\.com/,
  );
  assert.equal(
    loginShell["cross-origin-opener-policy"],
    "same-origin-allow-popups",
  );
  assert.doesNotMatch(
    headers["content-security-policy"]!,
    /firebaseapp\.com|identitytoolkit|apis\.google\.com/,
  );
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
    const confirm = "Confirm count correction";
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
          error: {
            code: "REVISION_CONFLICT",
            message: "Review current stock",
          },
        },
      });
    });
    try {
      await page.getByLabel("Positive whole units").fill("2");
      await page.getByLabel("Reason", { exact: true }).fill("Fixture recount");
      await page.getByRole("button", { name: confirm }).click();
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
      assert.equal(
        await page.getByRole("button", { name: confirm }).isDisabled(),
        true,
      );
      await page.getByRole("button", { name: /I reviewed/ }).click();
      await waitPhase(page, "idle");
      await page.getByRole("button", { name: confirm }).click();
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
  "ingredient tools move only explicit entries and copy label text without saving or changing SKUs",
  async () => {
    const page = await fixturePage(
      "src/components/admin/ProductForm.astro",
      {
        product: {
          ...product,
          ingredients: [],
          details: [
            "Size: fixture size",
            "Ingredients:",
            "-Fixture oil",
            "- Fixture blend (A, B)",
            "Care: Keep fixture dry.",
          ],
        },
      },
      ["admin.ts", "ingredients.ts"],
    );
    let mutations = 0;
    await page.route("**/api/**", (route) => {
      if (route.request().method() !== "GET") mutations++;
      return route.abort();
    });
    try {
      const sku = await page
        .getByLabel("SKU (stock code)", { exact: true })
        .inputValue();
      await page
        .getByRole("button", {
          name: "Move ingredients from Details",
          exact: true,
        })
        .click();
      assert.equal(
        await page.getByLabel("Ingredients (one per line)").inputValue(),
        "Fixture oil\nFixture blend (A, B)",
      );
      assert.equal(
        await page.getByLabel("Details (one paragraph per line)").inputValue(),
        "Size: fixture size\nCare: Keep fixture dry.",
      );
      assert.equal(
        await page.getByLabel("Generated ingredient text").inputValue(),
        "Ingredients: Fixture oil, Fixture blend (A, B)",
      );
      assert.match(
        await page.locator("[data-ingredient-status]").innerText(),
        /not saved/i,
      );
      assert.equal(
        await page.getByLabel("SKU (stock code)", { exact: true }).inputValue(),
        sku,
      );
      assert.equal(mutations, 0);
      await page.evaluate(() => {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            async writeText(value: string) {
              document.documentElement.dataset.copiedIngredients = value;
            },
          },
        });
      });
      await page
        .getByRole("button", { name: "Copy ingredient text", exact: true })
        .click();
      await page.waitForFunction(() =>
        document
          .querySelector("[data-ingredient-status]")
          ?.textContent?.includes("copied"),
      );
      assert.equal(
        await page.locator("html").getAttribute("data-copied-ingredients"),
        "Ingredients: Fixture oil, Fixture blend (A, B)",
      );
      assert.equal(mutations, 0);
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "ingredient tools preserve existing text, reject overlong labels and provide manual-copy fallback",
  async () => {
    const page = await fixturePage(
      "src/components/admin/ProductForm.astro",
      {
        product: {
          ...product,
          ingredients: ["Owner entered oil"],
          details: ["Ingredients:", "- Imported fixture"],
        },
      },
      ["admin.ts", "ingredients.ts"],
    );
    try {
      const ingredients = page.getByLabel("Ingredients (one per line)");
      const move = page.getByRole("button", {
        name: "Move ingredients from Details",
        exact: true,
      });
      assert.equal(await move.isDisabled(), true);
      await move.evaluate((button: HTMLButtonElement) => {
        button.disabled = false;
        button.click();
      });
      assert.equal(await ingredients.inputValue(), "Owner entered oil");
      assert.equal(
        await page.getByLabel("Details (one paragraph per line)").inputValue(),
        "Ingredients:\n- Imported fixture",
      );
      await ingredients.fill("");
      await move.click();
      assert.equal(await ingredients.inputValue(), "Imported fixture");
      const oversized = "x".repeat(201);
      await ingredients.fill(oversized);
      assert.equal(await ingredients.inputValue(), oversized);
      assert.equal(
        await page
          .getByRole("button", { name: "Copy ingredient text", exact: true })
          .isDisabled(),
        true,
      );
      assert.match(
        await page.locator("[data-ingredient-help]").innerText(),
        /200/,
      );
      await ingredients.fill("Reviewed fixture");
      await page.evaluate(() => {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            async writeText() {
              throw new Error("Permission denied");
            },
          },
        });
      });
      await page
        .getByRole("button", { name: "Copy ingredient text", exact: true })
        .click();
      await page.waitForFunction(() =>
        document
          .querySelector("[data-ingredient-status]")
          ?.textContent?.includes("manually"),
      );
      assert.equal(
        await page.getByLabel("Generated ingredient text").inputValue(),
        "Ingredients: Reviewed fixture",
      );
      assert.equal(await ingredients.inputValue(), "Reviewed fixture");
    } finally {
      await page.context().close();
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
  "store controls freeze uncertain changes, retry the same intent and show verified current settings",
  async () => {
    const page = await fixturePage(
      "src/components/admin/StoreSettingsForm.astro",
      { settings: { purchasesEnabled: false, revision: 7 } },
    );
    const requests: Record<string, unknown>[] = [];
    let settings = { purchasesEnabled: false, revision: 7 };
    await page.route("**/api/admin/store", (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({ json: { settings } });
      requests.push(route.request().postDataJSON());
      if (requests.length === 1) {
        settings = { purchasesEnabled: true, revision: 8 };
        return route.abort("connectionreset");
      }
      if (requests.length > 2)
        settings = { purchasesEnabled: false, revision: 9 };
      return route.fulfill({
        json: { settings, replayed: requests.length === 2 },
      });
    });
    try {
      await page.getByLabel("Allow new checkouts").check();
      await page.getByRole("button", { name: "Save store setting" }).click();
      await page.waitForFunction(() => {
        const form = document.querySelector<HTMLElement>("[data-admin-form]");
        return (
          form?.dataset.phase === "uncertain" ||
          form
            ?.querySelector("[data-admin-status]")
            ?.textContent?.includes("not configured")
        );
      });
      assert.equal(requests.length, 1);
      await waitPhase(page, "uncertain");
      assert.equal(
        await page.getByLabel("Allow new checkouts").isDisabled(),
        true,
      );
      assert.equal(requests[0]!.purchasesEnabled, true);
      assert.equal(requests[0]!.expectedRevision, 7);
      assert.deepEqual(Object.keys(requests[0]!).sort(), [
        "expectedRevision",
        "operationId",
        "purchasesEnabled",
      ]);
      await page
        .getByRole("button", { name: "Retry the same operation" })
        .click();
      await waitPhase(page, "idle");
      assert.deepEqual(requests[1], requests[0]);
      assert.match(
        await page.locator("[data-admin-receipt-text]").innerText(),
        /New checkouts allowed/,
      );
      assert.equal(
        await page.locator("[data-store-status]").innerText(),
        "New checkouts allowed",
      );
      await page.getByLabel("Allow new checkouts").uncheck();
      await page.getByRole("button", { name: "Save store setting" }).click();
      await waitPhase(page, "idle");
      assert.equal(requests[2]!.purchasesEnabled, false);
      assert.equal(requests[2]!.expectedRevision, 8);
      assert.notEqual(requests[2]!.operationId, requests[0]!.operationId);
      assert.equal(
        await page.locator("[data-store-status]").innerText(),
        "New checkouts paused",
      );
    } finally {
      await page.close();
    }
  },
);

domTest(
  "stale store settings require an explicit review before a new operation",
  async () => {
    const page = await fixturePage(
      "src/components/admin/StoreSettingsForm.astro",
      { settings: { purchasesEnabled: true, revision: 7 } },
    );
    const requests: Record<string, unknown>[] = [];
    let settings = { purchasesEnabled: true, revision: 8 };
    await page.route("**/api/admin/store", (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({ json: { settings } });
      requests.push(route.request().postDataJSON());
      if (requests.length === 1)
        return route.fulfill({
          status: 409,
          json: {
            error: { code: "CONFLICT", message: "Review current settings." },
          },
        });
      settings = { purchasesEnabled: false, revision: 9 };
      return route.fulfill({ json: { settings, replayed: false } });
    });
    try {
      await page.getByLabel("Allow new checkouts").uncheck();
      await page.getByRole("button", { name: "Save store setting" }).click();
      await waitPhase(page, "conflict");
      await page
        .getByRole("button", {
          name: "I reviewed the current record; allow a new intent",
        })
        .click();
      await waitPhase(page, "idle");
      await page.getByRole("button", { name: "Save store setting" }).click();
      await waitPhase(page, "idle");
      assert.equal(requests.length, 2);
      assert.equal(requests[1]!.expectedRevision, 8);
      assert.equal(requests[1]!.purchasesEnabled, false);
      assert.notEqual(requests[1]!.operationId, requests[0]!.operationId);
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
    const { clientModules, entrypoints } = await loadBrowserClients([
      "admin.ts",
      "inventory-nav.ts",
    ]);
    const requests: { method: string; csrf: string | undefined }[] = [];
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      const module = clientModules.get(url.pathname);
      if (url.origin === inventoryOrigin && module !== undefined)
        return route.fulfill({
          contentType: "text/javascript",
          body: module,
        });
      return route.request().isNavigationRequest()
        ? route.fulfill({
            contentType: "text/html",
            body: html.replace(
              "</body>",
              `${entrypoints.map((src) => `<script type="module" src="${src}"></script>`).join("")}</body>`,
            ),
          })
        : route.abort();
    });
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
      await page.getByLabel("Administrator menu").click();
      await page.getByRole("button", { name: "Sign out" }).click();
      await page.getByText(/Sign-out is unverified/).waitFor();
      assert.deepEqual(requests, [
        { method: "POST", csrf: "component-only-token" },
      ]);
      assert.equal(
        page.url(),
        "https://inventory.example.invalid/inventory/products",
      );
      await page.getByLabel("Administrator menu").click();
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

domTest(
  "compact receiving keeps the existing audited stock contract",
  async () => {
    const page = await fixturePage("src/components/admin/CountForm.astro", {
      variant: product.variants[0],
      level,
      productKey: product.key,
      compact: true,
    });
    try {
      await page.locator("[data-stock-editor] > summary").click();
      assert.equal(await page.getByLabel("Units", { exact: true }).count(), 1);
      assert.equal(await page.getByLabel("Reason / reference").count(), 1);
      assert.equal(
        await page
          .getByRole("button", { name: "Confirm stock update" })
          .count(),
        1,
      );
      assert.equal(await page.getByLabel("Direction").inputValue(), "increase");
      assert.equal(
        await page.locator('[name="expectedRevision"]').inputValue(),
        "5",
      );
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "hybrid stock details remain accessible and protect unsent reductions",
  async () => {
    const page = await fixturePage(
      "src/components/admin/InventoryWorkspace.astro",
      workspaceProps(),
    );
    try {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        if (width === 390)
          await page
            .getByRole("link", {
              name: "View stock for Component-only record, Fixture format",
            })
            .click();
        const result = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        assert.deepEqual(
          result.violations.map(({ id, nodes }) => ({
            id,
            targets: nodes.map((node) => node.target),
          })),
          [],
        );
        if (width === 390) await page.keyboard.press("Escape");
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.locator("[data-stock-editor] > summary").click();
      await page.getByLabel("Direction").selectOption("reduce");
      await page.getByLabel("Units", { exact: true }).fill("15");
      assert.equal(
        await page
          .getByRole("button", { name: "Confirm stock update" })
          .isDisabled(),
        true,
      );
      await page.getByLabel("Units", { exact: true }).fill("3");
      assert.match(
        (await page.locator("[data-stock-preview]").textContent())!,
        /20.*17.*14.*11/,
      );
      const rejectDiscard = (dialog: import("@playwright/test").Dialog) =>
        dialog.dismiss();
      page.on("dialog", rejectDiscard);
      await page
        .getByRole("link", {
          name: "View stock for Test-only honey, Fixture format",
        })
        .click();
      assert.equal(
        await page.getByLabel("Units", { exact: true }).inputValue(),
        "3",
      );
      assert.equal(
        await page.locator('[name="variantKey"]').inputValue(),
        level.variantKey,
      );
      page.off("dialog", rejectDiscard);
      page.once("dialog", (dialog) => dialog.accept());
      await page
        .getByRole("link", {
          name: "View stock for Test-only honey, Fixture format",
        })
        .click();
      assert.equal(
        await page.getByLabel("Units", { exact: true }).inputValue(),
        "",
      );
      assert.equal(
        await page.locator('[name="variantKey"]').inputValue(),
        "honey-variant",
      );
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "product names and stock cells select the inspector like the workbench prototype",
  async () => {
    const page = await fixturePage(
      "src/components/admin/InventoryWorkspace.astro",
      workspaceProps(),
      "admin.ts",
      {
        path: "/inventory/products",
        headers: await productionHeaders("/inventory/products"),
      },
    );
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.setViewportSize({ width: 1440, height: 1000 });
      const honey = page.locator('[data-stock-row="honey-variant"]');
      await honey.getByText("Test-only honey", { exact: true }).click();
      assert.equal(
        await page.locator('[name="variantKey"]').inputValue(),
        "honey-variant",
      );
      assert.equal(
        await page.locator("[data-stock-title]").innerText(),
        "Test-only honey",
      );
      assert.equal(
        await honey
          .locator("[data-stock-select]")
          .first()
          .getAttribute("aria-pressed"),
        "true",
      );
      await page
        .locator('[data-stock-row="fixture-variant"] [data-stock-on-hand]')
        .click();
      assert.equal(
        await page.locator('[name="variantKey"]').inputValue(),
        "fixture-variant",
      );
      await honey
        .getByRole("button", {
          name: "Select stock for Test-only honey, Fixture format",
        })
        .focus();
      await page.keyboard.press("Space");
      assert.equal(
        await page.locator('[name="variantKey"]').inputValue(),
        "honey-variant",
      );
      await page.setViewportSize({ width: 390, height: 844 });
      await page
        .locator('[data-stock-row="fixture-variant"]')
        .getByText("Component-only record", { exact: true })
        .click();
      assert.deepEqual(errors, []);
      const dialog = page.getByRole("dialog");
      await dialog.waitFor({ state: "visible" });
      assert.equal(
        await dialog.locator('[name="variantKey"]').inputValue(),
        "fixture-variant",
      );
      await page.keyboard.press("Escape");
      assert.equal(
        await page
          .locator(
            '[data-stock-row="fixture-variant"] button[data-stock-select]',
          )
          .evaluate((node) => node === document.activeElement),
        true,
      );
      assert.deepEqual(errors, []);
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "receiving after mobile item selection updates only the selected variant",
  async () => {
    const props = workspaceProps();
    const honey = props.products[1]!;
    const before = honey.variants[0]!.levels[0]!;
    const current = { ...before, onHand: 6, sellable: 6, revision: 6 };
    const page = await fixturePage(
      "src/components/admin/InventoryWorkspace.astro",
      props,
    );
    const requests: Record<string, unknown>[] = [];
    await page.route("**/api/admin/products/honey-product", (route) =>
      route.fulfill({
        json: {
          product: {
            ...honey,
            variants: [{ ...honey.variants[0], levels: [current] }],
          },
        },
      }),
    );
    await page.route("**/api/admin/adjustments", (route) => {
      const body = route.request().postDataJSON();
      requests.push(body);
      return route.fulfill({
        json: {
          adjustment: {
            operationId: body.operationId,
            beforeOnHand: 0,
            onHand: 6,
            replayed: false,
          },
          level: current,
        },
      });
    });
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      const row = page.locator('[data-stock-row="honey-variant"]');
      await row.getByText("Test-only honey", { exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.locator("[data-stock-editor] > summary").click();
      await dialog.getByLabel("Units", { exact: true }).fill("6");
      await dialog
        .getByLabel("Reason / reference")
        .fill("Received sample delivery");
      await dialog
        .getByRole("button", { name: "Confirm stock update" })
        .click();
      await waitPhase(page, "idle");
      assert.equal(requests.length, 1);
      assert.deepEqual(
        { ...requests[0], operationId: "uuid" },
        {
          expectedRevision: 5,
          variantKey: "honey-variant",
          locationKey: level.locationKey,
          delta: 6,
          reason: "Received sample delivery",
          operationId: "uuid",
        },
      );
      assert.equal(
        await dialog.locator('[data-quantity="onHand"]').innerText(),
        "6",
      );
      await page.keyboard.press("Escape");
      assert.equal(await row.locator("[data-stock-on-hand]").innerText(), "6");
      assert.equal(
        await page
          .locator('[data-stock-row="fixture-variant"] [data-stock-on-hand]')
          .innerText(),
        "20",
      );
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "inventory navigation keeps one layout and active section across all inventory routes",
  async () => {
    const paths = [
      ["/inventory/products", "Products", true],
      ["/inventory/products/new", "Products", false],
      ["/inventory/products/fixture-product", "Products", false],
      ["/inventory/products/fixture-product/photo", "Products", false],
      ["/inventory/products/fixture-product/labels", "Products", false],
      ["/team-sprint", "Team board", false],
      ["/inventory/locations", "Locations", false],
      ["/inventory/locations/fixture-location", "Locations", false],
      ["/inventory/orders", "Orders", false],
      ["/inventory/pickups", "Pickup scheduling", false],
      ["/inventory/orders/fixture-order", "Orders", false],
      ["/inventory/history", "History", false],
      ["/inventory/store/", "Store settings", false],
    ] as const;
    for (const width of [1440, 390]) {
      let expected: { x: number; width: number; height: number } | undefined;
      for (const [path, active, compact] of paths) {
        const page = await fixturePage(
          "src/layouts/AdminLayout.astro",
          { title: "Inventory", compact },
          "admin.ts",
          {
            path,
            locals: {
              admin: {
                uid: "component-only-uid",
                actorId: "component-only-actor",
              },
              csrfToken: "component-only-token",
            },
          },
        );
        try {
          await page.setViewportSize({ width, height: 1000 });
          const nav = page.getByRole("navigation", {
            name: "Inventory navigation",
          });
          assert.deepEqual(
            await nav
              .getByRole("link")
              .allTextContents()
              .then((text) => text.map((value) => value.trim())),
            [
              "Products",
              "Team board",
              "Locations",
              "Store settings",
              "Orders",
              "Pickup scheduling",
              "History",
            ],
          );
          assert.equal(
            await nav.locator('[aria-current="page"]').innerText(),
            active,
            path,
          );
          const bounds = await page
            .locator("header.admin-header")
            .boundingBox();
          assert(bounds);
          const geometry = {
            x: bounds.x,
            width: bounds.width,
            height: bounds.height,
          };
          if (expected)
            assert.deepEqual(geometry, expected, `${width}px shell at ${path}`);
          else expected = geometry;
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
            `${width}px ${path}`,
          );
        } finally {
          await page.context().close();
        }
      }
    }
  },
);

domTest(
  "shared account dropdown is keyboard accessible and never exposes private controls on sign-in",
  async () => {
    const page = await fixturePage(
      "src/components/admin/InventoryNavbar.astro",
      {
        path: "/inventory/products",
        admin: { uid: "component-only-uid", actorId: "component-only-actor" },
      },
      ["admin.ts", "inventory-nav.ts"],
    );
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      const account = page.locator("[data-inventory-account]");
      const toggle = account.locator("summary");
      await toggle.focus();
      await page.keyboard.press("Enter");
      assert.equal(
        await account
          .getByRole("button", { name: "Sign out", exact: true })
          .isVisible(),
        true,
      );
      await page.keyboard.press("Escape");
      assert.equal(
        await account
          .getByRole("button", { name: "Sign out", exact: true })
          .isVisible(),
        false,
      );
      assert.equal(
        await toggle.evaluate((node) => node === document.activeElement),
        true,
      );
      await toggle.click();
      await page
        .getByRole("heading", { name: "Isolated component test" })
        .click();
      assert.equal(await account.getAttribute("open"), null);
      await toggle.click();
      const accessibility = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      assert.deepEqual(
        accessibility.violations.map(({ id }) => id),
        [],
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      const publicHtml = await render(
        "src/components/admin/InventoryNavbar.astro",
        {
          path: "/inventory/login",
          publicShell: true,
          admin: { uid: "must-not-render", actorId: "must-not-render" },
        },
      );
      assert.doesNotMatch(
        publicHtml,
        /must-not-render|data-admin-logout|Inventory navigation|data-inventory-account/,
      );
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "shared dropdowns preserve native keyboard selection, form values and disabled locations",
  async () => {
    const page = await fixturePage(
      "src/components/admin/ProductForm.astro",
      {},
    );
    try {
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        const category = page.getByLabel("Category", { exact: true });
        await category.selectOption("honey");
        await category.focus();
        await page.keyboard.press("s");
        await page.keyboard.press("Enter");
        assert.equal(await category.inputValue(), "soap");
        assert.equal(
          await category.evaluate((node) =>
            new FormData(node.closest("form")!).get("category"),
          ),
          "soap",
        );
        assert.ok((await category.boundingBox())!.height >= 44);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
      }
      const props = workspaceProps();
      const emptyHtml = await render(
        "src/components/admin/InventoryWorkspace.astro",
        { ...props, locations: [], locationKey: null },
      );
      await page.setContent(`<main><h1>Inventory</h1>${emptyHtml}</main>`);
      assert.equal(
        await page
          .getByLabel("Inventory location", { exact: true })
          .isDisabled(),
        true,
      );
    } finally {
      await page.context().close();
    }
  },
);

function workspaceProps(stock = "all") {
  const outLevel = {
    ...level,
    variantKey: "honey-variant",
    onHand: 0,
    held: 0,
    committed: 0,
    unavailable: 0,
    sellable: 0,
  };
  const products: AdminProduct[] = [
    product,
    {
      ...product,
      key: "honey-product",
      title: "Test-only honey",
      category: "honey",
      variants: [
        {
          ...product.variants[0]!,
          key: outLevel.variantKey,
          sku: "HONEY-ONLY",
          levels: [outLevel],
        },
      ],
    },
    {
      ...product,
      key: "missing-product",
      title: "Missing balance record",
      variants: [
        {
          ...product.variants[0]!,
          key: "missing-variant",
          sku: "MISSING-ONLY",
          levels: [],
        },
      ],
    },
  ];
  return {
    products,
    total: products.length,
    locationKey: level.locationKey,
    locations: [
      {
        key: level.locationKey,
        name: "Test room",
        publicLabel: null,
        active: true,
        pickupEnabled: false,
        revision: 1,
      },
    ],
    query: {
      search: "",
      offset: 0,
      limit: 20,
      category: "all",
      stock,
      locationKey: level.locationKey,
    },
  };
}

domTest(
  "stock workspace combines category shelves, explicit stock states, and a mobile inspector",
  async () => {
    const page = await fixturePage(
      "src/components/admin/InventoryWorkspace.astro",
      workspaceProps(),
    );
    try {
      await page.setViewportSize({ width: 1440, height: 1000 });
      assert.equal(
        await page.getByRole("group", { name: "Honey shelf" }).count(),
        1,
      );
      assert.equal(
        await page.getByRole("group", { name: "Soap shelf" }).count(),
        1,
      );
      assert.equal(
        await page
          .getByText("Not tracked", { exact: true })
          .first()
          .isVisible(),
        true,
      );
      const outLink = new URL(
        (await page
          .getByRole("link", { name: "Out of stock", exact: true })
          .getAttribute("href"))!,
        inventoryOrigin,
      );
      assert.equal(outLink.searchParams.get("stock"), "out");
      assert.equal(outLink.searchParams.get("locationKey"), level.locationKey);
      await page.setViewportSize({ width: 390, height: 844 });
      await page
        .getByRole("link", {
          name: "View stock for Test-only honey, Fixture format",
        })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor({ state: "visible" });
      assert.equal(
        await dialog
          .getByRole("heading", { name: "Test-only honey", exact: true })
          .isVisible(),
        true,
      );
      assert.equal(
        await dialog.locator('[name="variantKey"]').inputValue(),
        "honey-variant",
      );
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      await page
        .getByRole("link", {
          name: "View stock for Missing balance record, Fixture format",
        })
        .click();
      await dialog.waitFor({ state: "visible" });
      assert.match(
        await dialog.locator("[data-stock-untracked]").innerText(),
        /not proof of zero stock/i,
      );
      assert.equal(
        await dialog.locator("[data-stock-balances]").isVisible(),
        false,
      );
      assert.equal(
        await dialog
          .getByRole("button", { name: "Confirm stock update" })
          .isVisible(),
        false,
      );
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
          `${width}px`,
        );
      }
    } finally {
      await page.context().close();
    }
  },
);

domTest(
  "workspace receiving preserves uncertain intent and updates shelf balances only from verified records",
  async () => {
    const page = await fixturePage(
      "src/components/admin/InventoryWorkspace.astro",
      workspaceProps(),
    );
    const bodies: string[] = [];
    const current = { ...level, onHand: 26, sellable: 20, revision: 6 };
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
    await page.route("**/api/admin/adjustments", (route) => {
      bodies.push(route.request().postData()!);
      if (bodies.length === 1) return route.abort("failed");
      return route.fulfill({
        json: {
          adjustment: {
            operationId: JSON.parse(bodies[0]!).operationId,
            beforeOnHand: 20,
            onHand: 26,
            replayed: true,
          },
          level: current,
        },
      });
    });
    try {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.locator("[data-stock-editor] > summary").click();
      await page.getByLabel("Units", { exact: true }).fill("6");
      await page.getByLabel("Reason / reference").fill("Test stock receipt");
      assert.match(
        (await page.locator("[data-stock-preview]").textContent())!,
        /20.*26/s,
      );
      await page.getByRole("button", { name: "Confirm stock update" }).click();
      await waitPhase(page, "uncertain");
      const row = page.locator('[data-stock-row="fixture-variant"]');
      assert.equal(await row.locator("[data-stock-on-hand]").innerText(), "20");
      await page
        .getByRole("link", {
          name: "View stock for Test-only honey, Fixture format",
        })
        .click();
      assert.equal(
        await page.locator('[name="variantKey"]').inputValue(),
        level.variantKey,
      );
      assert.match(
        (await page.locator("[data-stock-workspace-status]").textContent())!,
        /resolve.*operation/i,
      );
      await page
        .getByRole("button", { name: "Retry the same operation" })
        .click();
      await waitPhase(page, "idle");
      assert.equal(bodies.length, 2);
      assert.equal(bodies[0], bodies[1]);
      assert.equal(await row.locator("[data-stock-on-hand]").innerText(), "26");
      assert.equal(
        await row.locator("[data-stock-available]").innerText(),
        "20",
      );
      assert.equal(
        await page.locator('[name="expectedRevision"]').inputValue(),
        "6",
      );
      assert.equal(await page.locator('[name="amount"]').inputValue(), "");
      await page
        .getByRole("link", {
          name: "View stock for Test-only honey, Fixture format",
        })
        .click();
      assert.equal(
        await page.locator('[name="variantKey"]').inputValue(),
        "honey-variant",
      );
      assert.equal(
        await page.locator('[name="expectedRevision"]').inputValue(),
        "5",
      );
    } finally {
      await page.context().close();
    }
  },
);
