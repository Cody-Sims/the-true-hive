import { randomBytes } from "node:crypto";
import { defineMiddleware } from "astro:middleware";
import { readAdminConfig } from "./server/admin/config.ts";
import { getAdminBoundary } from "./server/auth/runtime.ts";
import { isAdminPath, isInventoryRequest } from "./server/auth/http.ts";

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
    const result = await getAdminBoundary().gate(
      context.request,
      context.locals,
    );
    cookies = result.cookies;
    response = result.response ?? (await next());
  } catch {
    response = new Response("Inventory administration is unavailable.", {
      status: 503,
    });
  }
  for (const cookie of cookies) response.headers.append("Set-Cookie", cookie);
  if (inventory || isAdminPath(context.url.pathname)) {
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  if (response.headers.get("Content-Type")?.includes("text/html")) {
    response.headers.set("Cache-Control", "no-store");
  }
  if (import.meta.env.PROD) {
    const authDomain =
      inventory && firebaseProject
        ? `https://${firebaseProject}.firebaseapp.com`
        : null;
    const authConnections = authDomain
      ? ` https://identitytoolkit.googleapis.com https://securetoken.googleapis.com ${authDomain}`
      : "";
    response.headers.set(
      "Content-Security-Policy",
      `default-src 'self'; script-src 'self' 'nonce-${nonce}'${authDomain ? " https://apis.google.com" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'${authConnections}; ${authDomain ? `frame-src ${authDomain}; ` : ""}object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
    );
  }
  if (inventory && firebaseProject)
    response.headers.set(
      "Cross-Origin-Opener-Policy",
      "same-origin-allow-popups",
    );
  return response;
});
