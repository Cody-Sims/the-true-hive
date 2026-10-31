import type { APIRoute } from "astro";
import { getCatalog } from "../server/catalog.ts";
import { readConfig } from "../server/config.ts";
import { errorResponse } from "../server/http.ts";

export const GET: APIRoute = async () => {
  const config = readConfig();
  if (!config.indexable) return new Response("Not available", { status: 404 });
  try {
    const catalog = await getCatalog(config);
    const paths = [
      "/",
      "/goods",
      "/about",
      "/services",
      "/privacy",
      ...catalog.products.map((product) => `/goods/${product.slug}`),
    ];
    const entries = paths
      .map(
        (path) =>
          `<url><loc>${new URL(path, config.siteOrigin).href.replaceAll("&", "&amp;")}</loc></url>`,
      )
      .join("");
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`,
      {
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
};
