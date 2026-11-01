import type { APIRoute } from "astro";
import { getAdminBoundary } from "../../../server/auth/runtime.ts";

export const prerender = false;
export const POST: APIRoute = ({ request }) =>
  getAdminBoundary().endpoint(request, "logout");
