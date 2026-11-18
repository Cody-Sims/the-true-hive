import type { AdminLocals } from "./http.ts";
import { normalizedPath } from "./paths.ts";
import {
  isPrivateStudioFile,
  isStudioPath,
} from "../../../scripts/private-studio.mjs";

const types: Record<string, string> = {
  html: "text/html",
  css: "text/css",
  mjs: "text/javascript",
  svg: "image/svg+xml",
  md: "text/plain",
  webp: "image/webp",
};

export function serveStudio(
  request: Request,
  locals: AdminLocals,
  sources: Record<string, string | Uint8Array>,
): Response {
  const headers = {
    "cache-control": "private, no-store",
    vary: "Cookie",
    "x-robots-tag": "noindex, nofollow",
    "x-content-type-options": "nosniff",
  };
  function error(status: number) {
    return new Response("Private studio content is unavailable.", {
      status,
      headers,
    });
  }
  if (!locals.admin) return error(401);
  if (!["GET", "HEAD"].includes(request.method)) return error(405);
  const path = new URL(request.url).pathname;
  try {
    if (normalizedPath(path) !== path) return error(400);
  } catch {
    return error(400);
  }
  if (!path.endsWith("/") && isStudioPath(`${path}/`)) {
    return new Response(null, {
      status: 308,
      headers: {
        ...headers,
        location: `${path}/${new URL(request.url).search}`,
      },
    });
  }
  const key = path.slice(1) + (path.endsWith("/") ? "index.html" : "");
  const vendor =
    key === "prototypes/vendor/markdown-it.esm.min.mjs" ||
    /^prototypes\/vendor\/licenses\/[a-zA-Z0-9._-]+$/.test(key);
  if ((!isPrivateStudioFile(key) && !vendor) || !Object.hasOwn(sources, key))
    return error(404);
  let content = sources[key]!;
  if (
    typeof content === "string" &&
    key === "prototypes/scripts/plan-renderer.mjs"
  ) {
    content = content.replace(
      "../../node_modules/markdown-it/dist/browser/markdown-it.esm.min.mjs",
      "../vendor/markdown-it.esm.min.mjs",
    );
  }
  if (
    typeof content === "string" &&
    key.startsWith("prototypes/inventory-products/")
  ) {
    content = content
      .replaceAll('"/assets/', '"/prototypes/assets/')
      .replaceAll(
        'href="/admin.css"',
        'href="/prototypes/inventory-products/admin.css"',
      )
      .replaceAll(
        'href="/styles.css"',
        'href="/prototypes/inventory-products/styles.css"',
      )
      .replaceAll(
        'src="/app.mjs"',
        'src="/prototypes/inventory-products/app.mjs"',
      );
  }
  return new Response(
    request.method === "HEAD"
      ? null
      : typeof content === "string"
        ? content
        : new Uint8Array(content),
    {
      headers: {
        ...headers,
        "content-type": `${types[key.split(".").at(-1)!] ?? "text/plain"}${typeof content === "string" ? "; charset=utf-8" : ""}`,
      },
    },
  );
}
