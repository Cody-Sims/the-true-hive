export function normalizedPath(path: string) {
  let decoded = path;
  for (let iteration = 0; iteration <= 10; iteration++) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      if (iteration === 0) throw new Error("INVALID_PATH");
      break;
    }
    if (next === decoded) break;
    if (iteration === 10) throw new Error("INVALID_PATH");
    decoded = next;
  }
  return new URL(
    decoded.replaceAll("\\", "/").replace(/\/+/g, "/"),
    "https://route.invalid",
  ).pathname;
}

// New application routes are private unless deliberately added here.
export function isPublicPath(path: string) {
  return (
    [
      "/",
      "/about",
      "/services",
      "/cart",
      "/contact",
      "/privacy",
      "/accessibility",
      "/404",
      "/robots.txt",
      "/sitemap.xml",
      "/favicon.svg",
      "/_image",
      "/checkout/return",
      "/checkout/cancel",
      "/api/catalog",
      "/api/availability",
      "/api/checkout",
      "/api/webhooks/stripe",
      "/api/health/live",
    ].includes(path.replace(/\/$/, "") || "/") ||
    /^\/goods(?:\/[a-z0-9][a-z0-9-]{0,79})?\/?$/.test(path) ||
    /^\/api\/products\/[a-z0-9][a-z0-9-]{0,79}\/?$/.test(path) ||
    /^\/media\/products\/[a-zA-Z0-9-]+\/?$/.test(path) ||
    path.startsWith("/_astro/")
  );
}

export function adminReturnTo(value: unknown): string {
  const fallback = "/inventory/products";
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020\u007f]/.test(value)
  )
    return fallback;
  try {
    const url = new URL(value, "https://route.invalid");
    if (
      url.origin !== "https://route.invalid" ||
      url.pathname.includes("%") ||
      normalizedPath(url.pathname) !== url.pathname ||
      value.split(/[?#]/, 1)[0] !== url.pathname ||
      isPublicPath(url.pathname) ||
      /^\/api(?:\/|$)/.test(url.pathname) ||
      /^\/inventory\/login\/?$/.test(url.pathname)
    )
      return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
