import type { Pool, QueryResultRow } from "pg";
import type {
  Catalog,
  Product,
  Availability,
  ProductVariant,
} from "../domain/catalog.ts";
import type { SiteConfig } from "./config.ts";
import { showcaseProducts } from "../content/showcase.ts";
import { DatabaseConfigurationError } from "./db/connection.mjs";
import { getPool } from "./db/pool.ts";

export class CatalogUnavailableError extends Error {
  code: string;

  constructor(code: string) {
    super("The catalog is temporarily unavailable.");
    this.code = code;
  }
}

interface ProductRow extends QueryResultRow {
  key: string;
  slug: string;
  title: string;
  summary: string;
  details: string[];
  category: Product["category"];
  imageKey: Product["imageKey"];
  kind: Product["kind"];
  variants: ProductVariant[];
}

const productQuery = `
  SELECT p.product_key AS key, p.slug, p.title, p.summary, p.details,
    p.category, p.image_key AS "imageKey", p.kind,
    COALESCE(jsonb_agg(jsonb_build_object(
      'key', v.variant_key, 'label', v.label, 'priceMinor', v.price_minor, 'currency', v.currency
    ) ORDER BY v.display_order, v.variant_key) FILTER (WHERE v.variant_key IS NOT NULL), '[]'::jsonb) AS variants
  FROM products p
  LEFT JOIN product_variants v ON v.product_key = p.product_key AND v.active
  WHERE p.published AND p.kind IN ('concept', 'active') AND ($1::text IS NULL OR p.slug = $1)
  GROUP BY p.product_key
  ORDER BY p.display_order, p.product_key
  LIMIT 101
`;

const availabilityQuery = `
  SELECT p.kind, l.active, l.pickup_enabled AS pickup,
    s.on_hand - s.committed - s.unavailable AS available
  FROM product_variants v
  JOIN products p ON p.product_key = v.product_key
  LEFT JOIN inventory_locations l ON l.location_key = $2
  LEFT JOIN inventory_levels s ON s.variant_key = v.variant_key AND s.location_key = l.location_key
  WHERE v.variant_key = $1 AND v.active AND p.published AND p.kind IN ('concept', 'active')
`;

function mapProduct(row: ProductRow): Product {
  if (
    !Array.isArray(row.details) ||
    !row.details.every((detail) => typeof detail === "string") ||
    !Array.isArray(row.variants) ||
    row.variants.some(
      (variant) =>
        variant.currency !== "USD" ||
        (variant.priceMinor !== null &&
          (!Number.isInteger(variant.priceMinor) || variant.priceMinor <= 0)),
    )
  ) {
    throw new CatalogUnavailableError("INVALID_CATALOG");
  }
  return {
    key: row.key,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    details: row.details,
    category: row.category,
    imageKey: row.imageKey,
    kind: row.kind,
    variants: row.variants.map((variant) => ({
      key: variant.key,
      label: variant.label,
      priceMinor: row.kind === "concept" ? null : variant.priceMinor,
      currency: variant.currency,
    })),
  };
}

function unavailable(error: unknown): never {
  if (error instanceof CatalogUnavailableError) throw error;
  if (error instanceof DatabaseConfigurationError)
    throw new CatalogUnavailableError("NOT_CONFIGURED");
  const code =
    error && typeof error === "object" && "code" in error ? error.code : null;
  throw new CatalogUnavailableError(
    code === "42P01" || code === "42703"
      ? "SCHEMA_NOT_READY"
      : "DATABASE_UNAVAILABLE",
  );
}

function database(config: SiteConfig, pool?: Pool) {
  if (!pool && !config.databaseUrl)
    throw new CatalogUnavailableError("NOT_CONFIGURED");
  return pool ?? getPool(config);
}

export async function getCatalog(
  config: SiteConfig,
  pool?: Pool,
): Promise<Catalog> {
  if (config.catalogSource === "showcase") {
    return {
      source: "showcase",
      products: structuredClone([...showcaseProducts]),
    };
  }
  try {
    const result = await database(config, pool).query<ProductRow>(
      productQuery,
      [null],
    );
    if (result.rows.length > 100)
      throw new CatalogUnavailableError("CATALOG_CAPACITY_REVIEW");
    return { source: "database", products: result.rows.map(mapProduct) };
  } catch (error) {
    return unavailable(error);
  }
}

export async function getProduct(
  config: SiteConfig,
  slug: string,
  pool?: Pool,
): Promise<Product | null> {
  if (config.catalogSource === "showcase") {
    return structuredClone(
      showcaseProducts.find((product) => product.slug === slug) ?? null,
    );
  }
  try {
    const result = await database(config, pool).query<ProductRow>(
      productQuery,
      [slug],
    );
    return result.rows[0] ? mapProduct(result.rows[0]) : null;
  } catch (error) {
    return unavailable(error);
  }
}

interface AvailabilityRow extends QueryResultRow {
  kind: Product["kind"];
  active: boolean | null;
  pickup: boolean | null;
  available: number | null;
}

export async function getAvailability(
  config: SiteConfig,
  variant: string,
  location: string,
  pool?: Pool,
): Promise<Availability | null> {
  if (config.catalogSource === "showcase") {
    const product = showcaseProducts.find((entry) =>
      entry.variants.some((entryVariant) => entryVariant.key === variant),
    );
    return product
      ? { variantKey: variant, locationKey: location, state: "concept" }
      : null;
  }
  try {
    const result = await database(config, pool).query<AvailabilityRow>(
      availabilityQuery,
      [variant, location],
    );
    const row = result.rows[0];
    if (!row) return null;
    let state: Availability["state"];
    if (row.kind === "concept") state = "concept";
    else if (!row.active || !row.pickup) state = "not_offered";
    else if (row.available === null)
      throw new CatalogUnavailableError("INVENTORY_UNAVAILABLE");
    else state = row.available > 0 ? "available" : "out_of_stock";
    return { variantKey: variant, locationKey: location, state };
  } catch (error) {
    return unavailable(error);
  }
}

export async function checkDatabase(
  config: SiteConfig,
  pool?: Pool,
): Promise<void> {
  try {
    const connection = database(config, pool);
    // Validate public query shapes and permissions without executing stock/catalog scans.
    await connection.query(`EXPLAIN ${productQuery}`, [null]);
    await connection.query(`EXPLAIN ${availabilityQuery}`, [null, null]);
  } catch (error) {
    unavailable(error);
  }
}
