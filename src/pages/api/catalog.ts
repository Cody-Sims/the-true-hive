import type { APIRoute } from "astro";
import { getCatalog } from "../../server/catalog.ts";
import { readConfig } from "../../server/config.ts";
import { errorResponse, jsonResponse } from "../../server/http.ts";

export const GET: APIRoute = async () => {
  try {
    return jsonResponse(await getCatalog(readConfig()));
  } catch (error) {
    return errorResponse(error);
  }
};
