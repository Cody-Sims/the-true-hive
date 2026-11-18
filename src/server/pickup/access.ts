import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { PickupError } from "./rules.ts";

export interface BuyerAccess {
  hash: string;
  csrfToken: string;
}

function originConfig(siteOrigin: string) {
  const url = new URL(siteOrigin);
  const secure = url.protocol === "https:";
  if (
    url.origin !== siteOrigin ||
    (!secure &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  )
    throw new PickupError(
      503,
      "PICKUP_UNAVAILABLE",
      "The storefront origin is unavailable.",
    );
  return {
    origin: url.origin,
    host: url.host,
    secure,
    cookieName: `${secure ? "__Host-" : "dev-"}hive-buyer`,
  };
}

function checkOrigin(request: Request, siteOrigin: string, mutation: boolean) {
  const config = originConfig(siteOrigin);
  if (
    new URL(request.url).origin !== config.origin ||
    (request.headers.has("Host") &&
      request.headers.get("Host")?.toLowerCase() !== config.host) ||
    (mutation && request.headers.get("Origin") !== config.origin) ||
    (request.headers.has("Origin") &&
      request.headers.get("Origin") !== config.origin) ||
    (mutation &&
      request.headers.has("Sec-Fetch-Site") &&
      request.headers.get("Sec-Fetch-Site") !== "same-origin")
  )
    throw new PickupError(
      403,
      "INVALID_ORIGIN",
      "Use the configured storefront origin.",
    );
  if (mutation && request.method !== "POST")
    throw new PickupError(405, "INVALID_METHOD", "Use a pickup POST request.");
  if (
    mutation &&
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
      request.headers.get("Content-Type") ?? "",
    )
  )
    throw new PickupError(
      415,
      "INVALID_BODY",
      "Use an application/json request.",
    );
  return config;
}

function readNonce(request: Request, name: string) {
  const header = request.headers.get("Cookie") ?? "";
  if (header.length > 8192)
    throw new PickupError(
      401,
      "PICKUP_ACCESS_REQUIRED",
      "Buyer access is unavailable.",
    );
  const matches = header
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  if (matches.length > 1)
    throw new PickupError(
      401,
      "PICKUP_ACCESS_REQUIRED",
      "Buyer access is ambiguous.",
    );
  if (!matches.length) return null;
  const value = matches[0]!.slice(name.length + 1);
  if (!/^[A-Za-z0-9_-]{43}$/.test(value))
    throw new PickupError(
      401,
      "PICKUP_ACCESS_REQUIRED",
      "Buyer access is unavailable.",
    );
  return value;
}

function access(nonce: string): BuyerAccess {
  return {
    hash: createHash("sha256")
      .update(`true-hive:buyer:v1:${nonce}`)
      .digest("hex"),
    csrfToken: createHmac("sha256", nonce)
      .update("true-hive:pickup-csrf:v1")
      .digest("base64url"),
  };
}

export function prepareBuyerAccess(
  request: Request,
  siteOrigin: string,
  mint: () => string = () => randomBytes(32).toString("base64url"),
): BuyerAccess & { cookie: string } {
  const config = checkOrigin(request, siteOrigin, true);
  const nonce = readNonce(request, config.cookieName) ?? mint();
  if (!/^[A-Za-z0-9_-]{43}$/.test(nonce))
    throw new PickupError(
      503,
      "PICKUP_UNAVAILABLE",
      "Buyer access could not be established.",
    );
  return {
    ...access(nonce),
    cookie: `${config.cookieName}=${nonce}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${config.secure ? "; Secure" : ""}`,
  };
}

export function readBuyerAccess(
  request: Request,
  siteOrigin: string,
): BuyerAccess | null {
  const config = checkOrigin(request, siteOrigin, false);
  const nonce = readNonce(request, config.cookieName);
  return nonce ? access(nonce) : null;
}

export function requireBuyerMutation(
  request: Request,
  siteOrigin: string,
): BuyerAccess {
  checkOrigin(request, siteOrigin, true);
  const buyer = readBuyerAccess(request, siteOrigin);
  if (!buyer)
    throw new PickupError(
      428,
      "PICKUP_ACCESS_REQUIRED",
      "Establish same-browser checkout access first.",
    );
  const token = request.headers.get("X-Pickup-CSRF") ?? "";
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(token) ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(buyer.csrfToken))
  )
    throw new PickupError(
      403,
      "INVALID_PICKUP_CSRF",
      "Refresh the authorized pickup page before retrying.",
    );
  return buyer;
}
