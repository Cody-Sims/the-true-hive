import type { APIRoute } from "astro";
import type { Pool } from "pg";
import bwipjs from "bwip-js";
import { isRecordKey } from "./inventory/rules.ts";
import { isInventoryRequest } from "./auth/http.ts";
import type { AdminConfig } from "./admin/config.ts";

export function renderSkuBarcode(sku: string): string {
  if (typeof sku !== "string" || !/^[\x20-\x7e]{1,128}$/.test(sku))
    throw new Error(
      "Use 1 to 128 printable ASCII characters for an internal barcode; the stored SKU was not changed.",
    );
  return bwipjs.toSVG({
    bcid: "code128",
    text: sku,
    scale: 3,
    height: 18,
    includetext: true,
    textxalign: "center",
    textsize: 10,
    backgroundcolor: "FFFFFF",
    barcolor: "000000",
    textcolor: "000000",
    paddingwidth: 12,
    paddingheight: 8,
    parse: false,
    parsefnc: false,
  });
}

function response(body: string, status: number, svg = false): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": svg
        ? "image/svg+xml; charset=utf-8"
        : "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      "x-content-type-options": "nosniff",
    },
  });
}

export function createBarcodeRoute(dependencies: {
  pool: () => Pool;
  config: () => AdminConfig;
}): APIRoute {
  return async (context) => {
    // Middleware verifies host, membership and MFA; only its trusted locals count.
    if (!context.locals.admin)
      return response("Administrator authentication is required.", 401);
    try {
      const config = dependencies.config();
      if (!isInventoryRequest(context.request, config))
        return response("Barcode not found.", 404);
      if (!config.enabled)
        return response("Internal barcodes are unavailable.", 503);
      const key = context.params["key"];
      if (!isRecordKey(key))
        return response("A valid stable variant key is required.", 400);
      const result = await dependencies
        .pool()
        .query<{ sku: string }>(
          "SELECT sku FROM product_variants WHERE variant_key=$1 LIMIT 1",
          [key],
        );
      const variant = result.rows[0];
      if (!variant) return response("Variant not found.", 404);
      if (!/^[\x20-\x7e]{1,128}$/.test(variant.sku))
        return response(
          "The stored SKU needs 1 to 128 printable ASCII characters for a barcode. Its identity was not changed.",
          422,
        );
      return response(renderSkuBarcode(variant.sku), 200, true);
    } catch {
      return response(
        "Internal barcodes are unavailable. Try again later.",
        503,
      );
    }
  };
}
