import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { transform } from "@astrojs/compiler-rs";
import { parse } from "es-module-lexer";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import type { Browser, Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type {
  AdminInventoryLevel,
  AdminOrder,
  AdminProduct,
} from "../../src/domain/admin.ts";
import { pageQuery } from "../../src/components/admin/presentation.ts";

const root = new URL("../../", import.meta.url);
const modules = new Map<string, Promise<string>>();

// Compile the actual components in memory: no site build, fixture route or port.
async function componentModule(file: URL): Promise<string> {
  let pending = modules.get(file.href);
  if (!pending) {
    pending = (async () => {
      const source = await readFile(file, "utf8");
      let code = file.pathname.endsWith(".astro")
        ? transform(source, {
            filename: file.pathname,
            internalURL: "astro/compiler-runtime",
            resolvePath: (specifier) => specifier,
          }).code
        : stripTypeScriptTypes(source, { mode: "transform" });
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

async function fixturePage(
  component: string,
  props: Record<string, unknown>,
  client = "admin.ts",
) {
  const context = await browser.newContext({
    viewport: { width: 320, height: 1000 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(3000);
  page.setDefaultNavigationTimeout(3000);
  const html = await render(component, props);
  await page.route("**/*", (route) => {
    if (route.request().isNavigationRequest()) {
      return route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html lang="en"><head><title>Isolated component test</title><meta name="csrf-token" content="component-only-signed-token"></head><body><main><h1>Isolated component test</h1>${html}</main></body></html>`,
      });
    }
    return route.abort();
  });
  await page.goto(
    "https://inventory.example.invalid/inventory/products/fixture-product",
  );
  await page.addStyleTag({
    content: await readFile(new URL("src/styles/admin.css", root), "utf8"),
  });
  const script = stripTypeScriptTypes(
    await readFile(new URL(`src/client/${client}`, root), "utf8"),
    { mode: "transform" },
  );
  await page.addScriptTag({ content: script });
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
          .getByLabel("Stable product key", { exact: true })
          .getAttribute("readonly"),
        "",
      );
      assert.equal(
        await page
          .getByLabel("Stable variant key", { exact: true })
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
      await page.getByRole("button", { name: "Save changes" }).click();
      await waitPhase(page, "idle");
      assert.equal(requests.length, 1);
      assert.equal(requests[0]!.action, "save");
      assert.equal(requests[0]!.expectedRevision, 7);
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
      await page
        .getByLabel("Price (USD cents, optional for draft)")
        .fill("725");
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
        await page.getByLabel("Real SKU", { exact: true }).count(),
        2,
      );
      assert.equal(
        await page
          .getByLabel("Stable variant key", { exact: true })
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
        .getByLabel("Title", { exact: true })
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
      await page.getByLabel("Title", { exact: true }).fill("");
      await page.getByRole("button", { name: "Archive product" }).click();
      await waitPhase(page, "idle");
      assert.equal(requests.length, 2);
      assert.equal(
        await page.getByLabel("Title", { exact: true }).inputValue(),
        "",
      );
    } finally {
      await page.context().close();
    }
  },
);
