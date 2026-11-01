import type { AdminConfig } from "../admin/config.ts";
import type { createAdminAuth, AdminIdentity } from "./service.ts";
import { AdminAuthError } from "./service.ts";
import { issueCsrf, verifyCsrf } from "./csrf.ts";
import { createAttemptLimiter } from "./limiter.ts";
import { HttpInputError, readJsonBody } from "../http-input.ts";

export interface AdminLocals {
  admin?: AdminIdentity;
  csrfToken?: string;
}
export type AdminAuth = ReturnType<typeof createAdminAuth>;

export function cookieNames(config: AdminConfig) {
  const prefix = config.secureCookies ? "__Host-" : "dev-";
  return { session: `${prefix}hive-admin`, csrf: `${prefix}hive-admin-csrf` };
}

export function isInventoryRequest(request: Request, config: AdminConfig) {
  const url = new URL(request.url);
  const host = request.headers.get("host");
  return (
    url.origin === config.origin &&
    (!host || host.toLowerCase() === new URL(config.origin).host)
  );
}

function normalizedPath(path: string) {
  let decoded = path;
  // Astro repeatedly decodes routes; conservatively include encoded separators too.
  for (let iteration = 0; iteration <= 10; iteration++) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      if (iteration === 0) throw new AdminAuthError(400, "INVALID_PATH");
      break;
    }
    if (next === decoded) break;
    if (iteration === 10) throw new AdminAuthError(400, "INVALID_PATH");
    decoded = next;
  }
  return new URL(
    decoded.replaceAll("\\", "/").replace(/\/+/g, "/"),
    "https://route.invalid",
  ).pathname;
}

function privatePrefix(path: string) {
  return (
    path === "/inventory" ||
    path.startsWith("/inventory/") ||
    path === "/api/admin" ||
    path.startsWith("/api/admin/")
  );
}

export function isAdminPath(path: string) {
  try {
    return privatePrefix(normalizedPath(path));
  } catch {
    return false;
  }
}

function errorResponse(error: unknown) {
  const status =
    error instanceof AdminAuthError || error instanceof HttpInputError
      ? error.status
      : 503;
  const code =
    error instanceof AdminAuthError || error instanceof HttpInputError
      ? error.code
      : "UNAVAILABLE";
  return Response.json(
    {
      error: {
        code,
        message: "Inventory access is unavailable or could not be authorized.",
      },
    },
    {
      status,
      headers: {
        "cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow",
      },
    },
  );
}

function readCookies(request: Request, config: AdminConfig) {
  const header = request.headers.get("cookie") ?? "";
  if (header.length > 32768) throw new AdminAuthError();
  const names = cookieNames(config);
  function get(name: string) {
    const matches = header
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part.startsWith(`${name}=`));
    if (matches.length > 1) throw new AdminAuthError();
    return matches[0]?.slice(name.length + 1) ?? "";
  }
  return { session: get(names.session), nonce: get(names.csrf) };
}

function serializeCookie(
  config: AdminConfig,
  name: string,
  value: string,
  maxAge: number,
) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config.secureCookies ? "; Secure" : ""}`;
}

export function createAdminBoundary(
  config: AdminConfig,
  auth: AdminAuth,
  attempts = createAttemptLimiter(),
  verifications = createAttemptLimiter(300),
) {
  function requireAvailable() {
    if (!config.enabled || !config.csrfSecret)
      throw new AdminAuthError(503, "UNAVAILABLE");
  }
  function csrf(request: Request) {
    const cookies = readCookies(request, config);
    verifyCsrf(
      request,
      config.origin,
      config.csrfSecret!,
      cookies.session,
      cookies.nonce,
    );
    return cookies;
  }
  function shell(session: string, locals: AdminLocals) {
    const { nonce, token } = issueCsrf(config.csrfSecret!, session);
    locals.csrfToken = token;
    return serializeCookie(config, cookieNames(config).csrf, nonce, 3600);
  }
  return {
    async gate(request: Request, locals: AdminLocals) {
      const result = {
        response: null as Response | null,
        cookies: [] as string[],
      };
      const path = new URL(request.url).pathname;
      let canonicalPath: string;
      try {
        canonicalPath = normalizedPath(path);
      } catch (error) {
        return { ...result, response: errorResponse(error) };
      }
      const privatePath = privatePrefix(canonicalPath);
      const inventory = isInventoryRequest(request, config);
      if (!inventory && !privatePath) return result;
      if (!inventory)
        return {
          ...result,
          response: errorResponse(new AdminAuthError(404, "NOT_FOUND")),
        };
      try {
        requireAvailable();
        if (privatePath && canonicalPath !== path)
          throw new AdminAuthError(400, "INVALID_PATH");
        if (path === "/" && ["GET", "HEAD"].includes(request.method))
          return {
            ...result,
            response: new Response(null, {
              status: 302,
              headers: { location: "/inventory/products" },
            }),
          };
        if (!privatePath) {
          if (
            request.method === "GET" &&
            (path.startsWith("/_astro/") || path === "/favicon.svg")
          )
            return result;
          throw new AdminAuthError(404, "NOT_FOUND");
        }
        if (path === "/inventory/login" && request.method === "GET") {
          attempts.consume();
          result.cookies.push(
            shell(readCookies(request, config).session, locals),
          );
          return result;
        }
        if (
          [
            "/api/admin/session",
            "/api/admin/enrollment",
            "/api/admin/logout",
          ].includes(path) &&
          request.method === "POST"
        ) {
          // These exact handlers enforce their own limiter, origin and signed CSRF.
          return result;
        }
        const { session } = readCookies(request, config);
        if (!session) {
          attempts.consume();
          throw new AdminAuthError(401, "UNAUTHORIZED");
        }
        verifications.consume();
        const identity = await auth.authenticate(session);
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) csrf(request);
        locals.admin = identity;
        if (request.method === "GET" && path.startsWith("/inventory/"))
          result.cookies.push(shell(session, locals));
        return result;
      } catch (error) {
        if (
          error instanceof AdminAuthError &&
          [401, 403].includes(error.status) &&
          path.startsWith("/inventory/") &&
          ["GET", "HEAD"].includes(request.method)
        )
          result.response = new Response(null, {
            status: 303,
            headers: { location: "/inventory/login" },
          });
        else result.response = errorResponse(error);
        return result;
      }
    },
    async endpoint(
      request: Request,
      action: "session" | "enrollment" | "logout",
    ) {
      try {
        if (!isInventoryRequest(request, config))
          throw new AdminAuthError(404, "NOT_FOUND");
        requireAvailable();
        if (
          request.method !== "POST" ||
          new URL(request.url).pathname !== `/api/admin/${action}`
        )
          throw new AdminAuthError(405, "METHOD_NOT_ALLOWED");
        attempts.consume();
        const { session } = csrf(request);
        if (action === "logout") {
          await auth.logout(session);
          const response = Response.json({ redirect: "/inventory/login" });
          for (const name of Object.values(cookieNames(config)))
            response.headers.append(
              "set-cookie",
              serializeCookie(config, name, "", 0),
            );
          response.headers.set("cache-control", "no-store");
          return response;
        }
        if (
          !request.headers
            .get("content-type")
            ?.split(";")[0]
            ?.trim()
            .match(/^application\/json$/i)
        )
          throw new HttpInputError("INVALID_BODY", 400);
        const body = await readJsonBody(request);
        if (
          !body ||
          typeof body !== "object" ||
          Array.isArray(body) ||
          Object.keys(body).length !== 1 ||
          !("idToken" in body) ||
          typeof body.idToken !== "string" ||
          body.idToken.length > 16384
        )
          throw new HttpInputError("INVALID_BODY", 400);
        if (action === "enrollment")
          return Response.json(await auth.enrollment(body.idToken), {
            headers: { "cache-control": "no-store" },
          });
        const login = await auth.login(body.idToken);
        const response = Response.json({ redirect: "/inventory/products" });
        const names = cookieNames(config);
        response.headers.append(
          "set-cookie",
          serializeCookie(config, names.session, login.cookie, 8 * 3600),
        );
        response.headers.append("set-cookie", shell(login.cookie, {}));
        response.headers.set("cache-control", "no-store");
        return response;
      } catch (error) {
        return errorResponse(error);
      }
    },
  };
}
