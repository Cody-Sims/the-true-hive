import type { APIRoute } from "astro";
import { studioResponse } from "../server/studio-runtime.ts";
import { isStudioPath } from "../../scripts/private-studio.mjs";

export const ALL: APIRoute = ({ request, locals, rewrite }) =>
  !isStudioPath(new URL(request.url).pathname)
    ? rewrite("/404")
    : studioResponse(request, locals);
