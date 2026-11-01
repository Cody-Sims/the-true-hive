export function pageQuery(url: URL) {
  const raw = url.searchParams.get("offset") ?? "0";
  const offset = /^\d{1,5}$/.test(raw)
    ? Math.min(10000, Math.floor(Number(raw) / 20) * 20)
    : 0;
  return {
    limit: 20,
    offset,
    search: (url.searchParams.get("search") ?? "").trim().slice(0, 120),
  };
}

export function money(minor: number | null) {
  return minor === null
    ? "No price"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(minor / 100);
}

export function pageHref(path: string, offset: number, search = "") {
  const query = new URLSearchParams({ offset: String(offset) });
  if (search) query.set("search", search);
  return `${path}?${query}`;
}
