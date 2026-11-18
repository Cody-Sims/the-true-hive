export async function requestCheckout(
  body: string,
  options: { fetch?: typeof fetch; signal?: AbortSignal } = {},
): Promise<Response> {
  const send = options.fetch ?? fetch;
  const common: RequestInit = {
    method: "POST",
    mode: "same-origin",
    credentials: "same-origin",
    redirect: "error",
    cache: "no-store",
    signal: options.signal ?? AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/json", Accept: "application/json" },
  };
  const preflight = await send("/api/checkout/access", {
    ...common,
    body: "{}",
  });
  if (!preflight.ok) return preflight;
  const result: unknown = await preflight.json();
  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    Object.keys(result).some((key) => !["ready", "csrfToken"].includes(key)) ||
    !("ready" in result) ||
    result.ready !== true ||
    !("csrfToken" in result) ||
    typeof result.csrfToken !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(result.csrfToken)
  )
    throw new Error("Checkout browser access could not be verified.");
  return send("/api/checkout", {
    ...common,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Pickup-CSRF": result.csrfToken,
    },
    body,
  });
}
