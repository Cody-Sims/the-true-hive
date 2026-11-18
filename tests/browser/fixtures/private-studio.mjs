import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { parse } from "es-module-lexer";

// Separate loopback component fixture, never imported by the application or Pages.
if (process.env.NODE_ENV !== "test") throw new Error("Test fixture only.");
const root = new URL("../../../", import.meta.url);
// Exercise the real production header policy with only identity acquisition
// replaced inside this standalone component harness (never in a deployable build).
let middlewareCode = stripTypeScriptTypes(
  (await readFile(new URL("src/middleware.ts", root), "utf8")).replaceAll(
    "import.meta.env.PROD",
    "true",
  ),
  { mode: "transform" },
);
const inlineModule = (code) =>
  `data:text/javascript,${encodeURIComponent(code)}`;
const replacements = {
  "astro:middleware": inlineModule(
    "export const defineMiddleware = handler => handler;",
  ),
  "./server/auth/runtime.ts": inlineModule(
    "export const getAdminBoundary = () => ({gate: async () => ({cookies: [], response: null})});",
  ),
};
const [imports] = parse(middlewareCode);
for (const item of [...imports].reverse()) {
  if (!item.specifier) continue;
  const resolved =
    replacements[item.specifier] ||
    (item.specifier.startsWith(".")
      ? new URL(item.specifier, new URL("src/middleware.ts", root)).href
      : null);
  if (resolved)
    middlewareCode =
      middlewareCode.slice(0, item.start) +
      resolved +
      middlewareCode.slice(item.end);
}
const { onRequest } = await import(inlineModule(middlewareCode));
const chunks = new URL("dist-site/server/chunks/", root);
const names = await readdir(chunks);
async function builtPage(prefix) {
  const matches = names.filter(
    (name) => name.startsWith(prefix) && name.endsWith(".mjs"),
  );
  if (matches.length !== 1)
    throw new Error(`Expected one built ${prefix} page.`);
  return (await import(new URL(matches[0], chunks).href)).page();
}
const studio = await builtPage("_.._");
const assets = new URL("dist-site/client/_astro/", root);
const assetNames = new Set(await readdir(assets));

createServer(async (incoming, outgoing) => {
  try {
    const request = new Request(`http://127.0.0.1:4327${incoming.url}`, {
      method: incoming.method,
    });
    const path = new URL(request.url).pathname;
    const locals = {
      admin: { uid: "component-fixture", actorId: "component-fixture" },
    };
    const response = await onRequest(
      { request, url: new URL(request.url), locals },
      async () => {
        let response;
        if (!["GET", "HEAD"].includes(request.method))
          response = new Response(null, { status: 405 });
        else if (path.startsWith("/_astro/") && assetNames.has(path.slice(8))) {
          response = new Response(
            await readFile(new URL(path.slice(8), assets)),
            {
              headers: {
                "content-type": path.endsWith(".css")
                  ? "text/css"
                  : "text/javascript",
              },
            },
          );
        } else {
          response = await studio.ALL({
            request,
            locals,
            rewrite: () => new Response(null, { status: 404 }),
          });
        }
        return response;
      },
    );
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(
      request.method === "HEAD"
        ? undefined
        : Buffer.from(await response.arrayBuffer()),
    );
  } catch {
    outgoing.writeHead(500);
    outgoing.end("Component fixture failed.");
  }
}).listen(4327, "127.0.0.1");
