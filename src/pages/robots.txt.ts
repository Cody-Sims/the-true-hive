import type { APIRoute } from "astro";
import { readConfig } from "../server/config.ts";

export const GET: APIRoute = () => {
  const config = readConfig();
  const body = `User-agent: *\nDisallow: /api/\n${config.indexable ? `Sitemap: ${config.siteOrigin}/sitemap.xml\n` : ""}`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
};
