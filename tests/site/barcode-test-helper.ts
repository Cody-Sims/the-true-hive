import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { transform } from "@astrojs/compiler-rs";
import { parse } from "es-module-lexer";
import { experimental_AstroContainer as AstroContainer } from "astro/container";

export const root = new URL("../../", import.meta.url);
const modules = new Map<string, Promise<string>>();
export const styles = new Map<string, string[]>();

export async function moduleUrl(file: URL): Promise<string> {
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
        styles.set(file.href, compiled.css);
        code = compiled.code;
      } else {
        code = stripTypeScriptTypes(source, { mode: "transform" });
      }
      const [imports] = parse(code);
      for (const item of [...imports].reverse()) {
        if (!item.specifier) continue;
        const resolved = item.specifier.endsWith("?url")
          ? `data:text/javascript,${encodeURIComponent(`export default ${JSON.stringify(new URL(item.specifier.slice(0, -4), file).pathname)};`)}`
          : item.specifier.endsWith(".css")
            ? "data:text/javascript,export default {}"
            : item.specifier.startsWith(".")
              ? await moduleUrl(new URL(item.specifier, file))
              : import.meta.resolve(item.specifier);
        code = code.slice(0, item.start) + resolved + code.slice(item.end);
      }
      return `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
    })();
    modules.set(file.href, pending);
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
