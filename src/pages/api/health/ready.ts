import type { APIRoute } from "astro";
import { checkDatabase } from "../../../server/catalog.ts";
import { readConfig } from "../../../server/config.ts";
import { errorResponse, jsonResponse } from "../../../server/http.ts";

export const GET: APIRoute = async () => {
  try {
    const config = readConfig();
    if (config.catalogSource === "database") await checkDatabase(config);
    return jsonResponse({
      status: "ready",
      catalogSource: config.catalogSource,
      inventoryConnected: config.catalogSource === "database",
      checkoutEnabled: false,
    });
  } catch (error) {
    return errorResponse(error);
  }
};
