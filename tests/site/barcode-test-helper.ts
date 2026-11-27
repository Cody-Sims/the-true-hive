import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { transform } from "@astrojs/compiler-rs";
import { parse } from "es-module-lexer";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import type { Product } from "../../src/domain/catalog.ts";

export const root = new URL("../../", import.meta.url);
const modules = new Map<string, Promise<string>>();
export const styles = new Map<string, string[]>();

export async function moduleUrl(file: URL, cache = modules): Promise<string> {
  let pending = cache.get(file.href);
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
        styles.set(file.href, compiled.css);
        code = compiled.code;
      } else {
        code = stripTypeScriptTypes(source, { mode: "transform" });
      }
      const [imports] = parse(code);
      for (const item of [...imports].reverse()) {
        if (!item.specifier) continue;
        const resolved = cache.has(item.specifier)
          ? await cache.get(item.specifier)!
          : item.specifier.endsWith("?url") || item.specifier.endsWith(".webp")
            ? `data:text/javascript,${encodeURIComponent(`export default ${JSON.stringify(new URL(item.specifier.replace(/\?url$/, ""), file).pathname)};`)}`
            : item.specifier.endsWith(".css")
              ? "data:text/javascript,export default {}"
              : item.specifier.startsWith(".")
                ? await moduleUrl(new URL(item.specifier, file), cache)
                : import.meta.resolve(item.specifier);
        code = code.slice(0, item.start) + resolved + code.slice(item.end);
      }
      return `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
    })();
    cache.set(file.href, pending);
  }
  return pending;
}

export async function render(
  path: string,
  props: Record<string, unknown>,
  options = {},
) {
  const component = await import(await moduleUrl(new URL(path, root)));
  const container = await AstroContainer.create();
  return container.renderToString(component.default, { props, ...options });
}

export async function renderResponse(path: string, options = {}) {
  const component = await import(await moduleUrl(new URL(path, root)));
  const container = await AstroContainer.create();
  return container.renderToResponse(component.default, options);
}

export async function renderCatalogFixture(
  path: string,
  url: string,
  products: readonly Product[],
) {
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
    throw new Error("Catalog rendering fixtures are loopback-only.");
  const inline = (source: string) =>
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const cache = new Map<string, Promise<string>>();
  cache.set(
    new URL("src/server/catalog.ts", root).href,
    Promise.resolve(
      inline(`
    const products = ${JSON.stringify(products)};
    export class CatalogUnavailableError extends Error {}
    export async function getCatalog() { return {source:"database",products}; }
    export async function getProduct(_config, slug) { return products.find(product => product.slug === slug) ?? null; }
  `),
    ),
  );
  cache.set(
    "astro:assets",
    Promise.resolve(
      inline(`
    import { createComponent, render, spreadAttributes } from ${JSON.stringify(import.meta.resolve("astro/compiler-runtime"))};
    export const Image = createComponent((_result, props) => render\`<img\${spreadAttributes(props)}>\`);
  `),
    ),
  );
  const component = await import(await moduleUrl(new URL(path, root), cache));
  const container = await AstroContainer.create();
  return container.renderToString(component.default, {
    request: new Request(url),
    params: { slug: new URL(url).pathname.split("/").at(-1)! },
    locals: { nonce: "loopback-catalog-fixture" },
  });
}
