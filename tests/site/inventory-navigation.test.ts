import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { transform } from "@astrojs/compiler-rs";
import { parse } from "es-module-lexer";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import type { Browser } from "@playwright/test";

const root = new URL("../../", import.meta.url);
const source = await readFile(
  new URL("src/components/admin/InventoryNavbar.astro", root),
  "utf8",
);
const compiled = transform(source, {
  filename: new URL("src/components/admin/InventoryNavbar.astro", root)
    .pathname,
  internalURL: "astro/compiler-runtime",
  resolvePath: (specifier) => specifier,
});
let code = compiled.code;
for (const item of [...parse(code)[0]].reverse()) {
  if (!item.specifier) continue;
  const resolved = item.specifier.endsWith(".css")
    ? "data:text/javascript,export default {}"
    : import.meta.resolve(item.specifier);
  code = code.slice(0, item.start) + resolved + code.slice(item.end);
}
const component = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);
async function navigation() {
  const container = await AstroContainer.create();
  return container.renderToString(component.default, {
    props: {
      path: "/inventory/locations",
      admin: { uid: "synthetic-nav-uid", actorId: "synthetic-nav-actor" },
    },
    locals: { nonce: "nav-test" },
  });
}

test("inventory navigation separates the unified Locations workspace from the pickup appointment desk", async () => {
  const html = await navigation();
  assert.match(html, /href="\/inventory\/locations"[^>]*aria-current="page"/);
  assert.match(html, /href="\/inventory\/pickups"[^>]*>\s*Pickups\s*</);
  assert.match(html, /data-inventory-menu-toggle/);
});

let browser: Browser;
const domTest =
  process.env["INVENTORY_UI_BROWSER_TESTS"] === "1" ? test : test.skip;
test.before(async () => {
  if (process.env["INVENTORY_UI_BROWSER_TESTS"] === "1")
    browser = await (await import("@playwright/test")).chromium.launch();
});
test.after(async () => {
  await browser?.close();
});

domTest(
  "the mobile hamburger opens usable links, closes with Escape/outside input and resets after resize",
  async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    page.setDefaultTimeout(5000);
    try {
      const global = await readFile(
        new URL("src/styles/admin.css", root),
        "utf8",
      );
      const css = compiled.css.join("\n");
      const html = await navigation();
      await page.setContent(
        `<!doctype html><html lang="en"><head><title>Inventory navigation fixture</title><style>${global}\n${css}</style></head><body class="admin-app">${html}<main><button type="button" id="outside">Outside navigation</button></main></body></html>`,
      );
      const nav = page.getByRole("navigation", {
        name: "Inventory navigation",
      });
      assert.equal(
        await nav.getByRole("link").count(),
        7,
        "the no-JavaScript fallback retains all destinations",
      );
      const script = stripTypeScriptTypes(
        await readFile(new URL("src/client/inventory-nav.ts", root), "utf8"),
        { mode: "transform" },
      );
      await page.addScriptTag({ content: script });
      const menu = page.getByRole("button", { name: "Open inventory menu" });
      await menu.waitFor();
      assert.equal(await nav.isVisible(), false);
      await menu.click();
      assert.equal(await nav.isVisible(), true);
      assert.equal(
        await nav.evaluate((node) => getComputedStyle(node).flexDirection),
        "column",
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Close inventory menu" })
          .getAttribute("aria-expanded"),
        "true",
      );
      assert.equal(
        await nav.evaluate((node) => node.scrollWidth <= node.clientWidth),
        true,
      );
      await page.keyboard.press("Escape");
      assert.equal(await nav.isVisible(), false);
      assert.equal(
        await menu.evaluate((node) => node === document.activeElement),
        true,
      );
      await menu.click();
      await page.locator("#outside").click();
      assert.equal(await nav.isVisible(), false);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await nav.waitFor();
      assert.equal(await menu.isVisible(), false);
      await page.setViewportSize({ width: 390, height: 844 });
      await menu.waitFor();
      assert.equal(await nav.isVisible(), false);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
    } finally {
      await page.close();
    }
  },
);
