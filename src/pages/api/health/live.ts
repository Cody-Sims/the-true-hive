import type { APIRoute } from "astro";
import { jsonResponse } from "../../../server/http.ts";

export const GET: APIRoute = () => jsonResponse({ status: "ok" });
