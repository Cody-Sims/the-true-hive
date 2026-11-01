import type { APIContext, APIRoute } from "astro";
import type { Pool } from "pg";
import type { AdminActor } from "../../domain/admin.ts";
import { AdminError, adminError } from "./errors.ts";

type AdminHandler = (
  pool: Pool,
  input: unknown,
  context: APIContext,
  actor: AdminActor,
) => Promise<unknown>;

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

export function adminRoute(
  handler: AdminHandler,
  body = false,
  created = false,
): APIRoute {
  return async (context) => {
    const admin = (context.locals as { admin?: AdminActor }).admin;
    if (!admin)
      return json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Administrator authentication is required.",
          },
        },
        401,
      );
    try {
      let input: unknown;
      if (body) {
        const { HttpInputError, readJsonBody } =
          await import("../http-input.ts");
        try {
          input = await readJsonBody(context.request, 65536);
        } catch (error) {
          if (error instanceof HttpInputError)
            return json(
              { error: { code: error.code, message: error.message } },
              error.status,
            );
          throw error;
        }
      }
      // Middleware owns host/session/CSRF enforcement. No runtime pool is acquired before this guard.
      const { getAdminPool } = await import("./pool.ts");
      const result = await handler(getAdminPool(), input, context, admin);
      const replayed =
        result &&
        typeof result === "object" &&
        "replayed" in result &&
        result.replayed === true;
      return json(result, created && !replayed ? 201 : 200);
    } catch (error) {
      const safe = adminError(error);
      return json(
        {
          error: {
            code: safe.code,
            message: safe.message,
            ...(safe.fields ? { fields: safe.fields } : {}),
          },
        },
        safe.status,
      );
    }
  };
}

export function readAdminQuery(
  url: URL,
  allowed: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [name, value] of url.searchParams) {
    if (!allowed.includes(name) || Object.hasOwn(result, name))
      throw new AdminError(
        400,
        "INVALID_INPUT",
        "Use supported query parameters only once.",
      );
    if (name === "limit" || name === "offset") {
      const number = Number(value);
      const min = name === "limit" ? 1 : 0;
      const max = name === "limit" ? 100 : 1000000;
      if (
        !/^\d+$/.test(value) ||
        !Number.isInteger(number) ||
        number < min ||
        number > max
      )
        throw new AdminError(
          400,
          "INVALID_INPUT",
          "Use bounded whole-number pagination.",
        );
      result[name] = number;
    } else {
      result[name] = value;
    }
  }
  return result;
}
