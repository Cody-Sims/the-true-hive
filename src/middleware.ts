import { randomBytes } from "node:crypto";
import { defineMiddleware } from "astro:middleware";
import { readAdminConfig } from "./server/admin/config.ts";
import { getAdminBoundary } from "./server/auth/runtime.ts";
import { isAdminPath, isInventoryRequest } from "./server/auth/http.ts";
import { isStudioPath } from "../scripts/private-studio.mjs";

export const onRequest = defineMiddleware(async (context, next) => {
  const nonce = randomBytes(18).toString("base64");
  context.locals.nonce = nonce;
  let inventory = false;
  let firebaseProject: string | null = null;
  let cookies: string[] = [];
  let response: Response;
  try {
    const config = readAdminConfig();
    inventory = isInventoryRequest(context.request, config);
    if (inventory) firebaseProject = config.projectId;
    // Missing fallback URLs contain no private resource; retain the public 404.
    // Actual new routes still pass through the default-private boundary.
    const missing =
      inventory &&
      context.routePattern === "/[...studio]" &&
      !isStudioPath(new URL(context.request.url).pathname);
    const result = missing
      ? { cookies: [], response: null }
      : await getAdminBoundary().gate(context.request, context.locals);
    cookies = result.cookies;
    response = result.response ?? (await next());
  } catch {
    response = new Response("Inventory administration is unavailable.", {
      status: 503,
    });
  }
  for (const cookie of cookies) response.headers.append("Set-Cookie", cookie);
  const sensitivePickup =
    /^\/(?:checkout\/return|api\/pickup|api\/checkout\/access|api\/admin\/pickup|inventory\/pickups)(?:\/|$)/.test(
      context.url.pathname,
    );
  if (
    context.locals.admin ||
    isAdminPath(context.url.pathname) ||
    sensitivePickup
  ) {
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.append("Vary", "Cookie");
  }
  if (isAdminPath(context.url.pathname) || sensitivePickup) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set(
    "Referrer-Policy",
    sensitivePickup
      ? "no-referrer"
      : (response.headers.get("Referrer-Policy") ??
          "strict-origin-when-cross-origin"),
  );
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  if (response.headers.get("Content-Type")?.includes("text/html")) {
    response.headers.set("Cache-Control", "private, no-store");
    if (!response.headers.get("Vary")?.includes("Cookie"))
      response.headers.append("Vary", "Cookie");
  }
  if (import.meta.env.PROD) {
    const authDomain =
      inventory &&
      firebaseProject &&
      context.url.pathname === "/inventory/login"
        ? `https://${firebaseProject}.firebaseapp.com`
        : null;
    const authConnections = authDomain
      ? ` https://identitytoolkit.googleapis.com https://securetoken.googleapis.com ${authDomain}`
      : "";
    const photoPreview =
      inventory &&
      (/^\/inventory\/products\/[a-z0-9][a-z0-9-]{0,79}\/photo\/?$/.test(
        context.url.pathname,
      ) ||
        (isStudioPath(context.url.pathname) &&
          (context.url.pathname.endsWith("/") ||
            context.url.pathname.endsWith(".html"))));
    response.headers.set(
      "Content-Security-Policy",
      `default-src 'self'; script-src 'self' 'nonce-${nonce}'${authDomain ? " https://apis.google.com" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data:${photoPreview ? " blob:" : ""}; connect-src 'self'${authConnections}; ${authDomain ? `frame-src ${authDomain}; ` : ""}object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
    );
  }
  if (
    inventory &&
    firebaseProject &&
    context.url.pathname === "/inventory/login"
  )
    response.headers.set(
      "Cross-Origin-Opener-Policy",
      "same-origin-allow-popups",
    );
  return response;
});
