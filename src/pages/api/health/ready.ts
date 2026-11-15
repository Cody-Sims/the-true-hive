import type { APIRoute } from "astro";
import { checkDatabase } from "../../../server/catalog.ts";
import { readConfig } from "../../../server/config.ts";
import { errorResponse, jsonResponse } from "../../../server/http.ts";
import { getCheckoutPresentation } from "../../../server/commerce/config.ts";
import { getStorefrontStatus } from "../../../server/storefront.ts";

export const GET: APIRoute = async () => {
  try {
    const config = readConfig();
    if (config.catalogSource === "database") await checkDatabase(config);
    const storefront = await getStorefrontStatus(
      config,
      getCheckoutPresentation().enabled,
    );
    return jsonResponse({
      status: "ready",
      catalogSource: config.catalogSource,
      inventoryConnected: config.catalogSource === "database",
      checkoutEnabled: storefront.checkoutEnabled,
    });
  } catch (error) {
    return errorResponse(error);
  }
};
