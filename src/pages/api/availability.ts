import type { APIRoute } from "astro";
import { getAvailability } from "../../server/catalog.ts";
import { readConfig } from "../../server/config.ts";
import { isRecordKey } from "../../server/inventory/rules.ts";
import { errorResponse, jsonResponse } from "../../server/http.ts";

export const GET: APIRoute = async ({ url }) => {
  const variant = url.searchParams.get("variant");
  const location = url.searchParams.get("location");
  if (!isRecordKey(variant) || !isRecordKey(location)) {
    return jsonResponse(
      {
        error: {
          code: "INVALID_AVAILABILITY",
          message: "Provide a valid variant and pickup location.",
        },
      },
      400,
    );
  }
  try {
    const availability = await getAvailability(readConfig(), variant, location);
    return availability
      ? jsonResponse({ availability })
      : jsonResponse(
          {
            error: { code: "NOT_FOUND", message: "Product variant not found." },
          },
          404,
        );
  } catch (error) {
    return errorResponse(error);
  }
};
