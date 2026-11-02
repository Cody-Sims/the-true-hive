import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hashSession, AdminAuthError } from "./service.ts";

function signature(secret: string, payload: string, session: string) {
  return createHmac("sha256", secret)
    .update(`${payload}.${session ? hashSession(session) : "preauth"}`)
    .digest("base64url");
}

export function issueCsrf(
  secret: string,
  session: string,
  now = Date.now(),
  existingNonce?: string,
) {
  const nonce =
    existingNonce && /^[A-Za-z0-9_-]{43}$/.test(existingNonce)
      ? existingNonce
      : randomBytes(32).toString("base64url");
  const payload = `v1.${Math.floor(now / 1000) + 3600}.${nonce}`;
  return { nonce, token: `${payload}.${signature(secret, payload, session)}` };
}

export function verifyCsrf(
  request: Request,
  origin: string,
  secret: string,
  session: string,
  cookieNonce: string,
  now = Date.now(),
) {
  const token = request.headers.get("x-csrf-token") ?? "";
  const parts = token.split(".");
  const [version, expires, nonce, mac] = parts;
  if (
    request.headers.get("origin") !== origin ||
    token.length > 256 ||
    parts.length !== 4 ||
    version !== "v1" ||
    !expires ||
    !/^\d{10}$/.test(expires) ||
    Number(expires) <= now / 1000 ||
    Number(expires) > now / 1000 + 3601 ||
    !nonce ||
    !/^[A-Za-z0-9_-]{43}$/.test(nonce) ||
    nonce !== cookieNonce ||
    !mac ||
    !/^[A-Za-z0-9_-]{43}$/.test(mac)
  )
    throw new AdminAuthError();
  const expected = signature(secret, `${version}.${expires}.${nonce}`, session);
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected)))
    throw new AdminAuthError();
}
