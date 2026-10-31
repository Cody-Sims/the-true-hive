import type { APIRoute } from "astro";
import { getProduct } from "../../../server/catalog.ts";
import { readConfig } from "../../../server/config.ts";
import { isRecordKey } from "../../../server/inventory/rules.ts";
import { errorResponse, jsonResponse } from "../../../server/http.ts";

export const GET: APIRoute = async ({ params }) => {
  if (!isRecordKey(params["slug"]))
    return jsonResponse(
      {
        error: {
          code: "INVALID_PRODUCT",
          message: "Use a valid product slug.",
        },
      },
      400,
    );
  try {
    const product = await getProduct(readConfig(), params["slug"]);
    return product
      ? jsonResponse({ product })
      : jsonResponse(
          { error: { code: "NOT_FOUND", message: "Product not found." } },
          404,
        );
  } catch (error) {
    return errorResponse(error);
  }
};
