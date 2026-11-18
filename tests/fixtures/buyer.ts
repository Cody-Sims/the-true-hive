import { prepareBuyerAccess } from "../../src/server/pickup/access.ts";

export function buyerHeaders(origin: string): Record<string, string> {
  const issued = prepareBuyerAccess(
    new Request(`${origin}/api/checkout/access`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
    }),
    origin,
    () => "A".repeat(43),
  );
  return {
    Cookie: issued.cookie.split(";")[0]!,
    "X-Pickup-CSRF": issued.csrfToken,
  };
}
