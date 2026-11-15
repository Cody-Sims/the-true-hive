import type { Pool, QueryResultRow } from "pg";
import type {
  Catalog,
  Product,
  Availability,
  ProductVariant,
  ProductStock,
} from "../domain/catalog.ts";
import type { SiteConfig } from "./config.ts";
import { showcaseProducts } from "../content/showcase.ts";
import { DatabaseConfigurationError } from "./db/connection.mjs";
import { getPool } from "./db/pool.ts";
import { readStoreSettings, storeSettingsQuery } from "./storefront.ts";
import { projectProductPhoto } from "./media/photo.ts";

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
  ingredients?: string[];
  category: Product["category"];
  imageKey: Product["imageKey"];
  kind: Product["kind"];
  variants: (ProductVariant & { internalStock?: StockRow })[];
  photo?: unknown;
}

const productQuery = `
  SELECT p.product_key AS key, p.slug, p.title, p.summary, p.details, p.ingredients,
    p.category, p.image_key AS "imageKey", p.kind, p.photo,
    COALESCE(jsonb_agg(jsonb_build_object(
      'key', v.variant_key, 'label', v.label, 'priceMinor', v.price_minor, 'currency', v.currency,
      'internalStock', jsonb_build_object(
        'active', l.active, 'pickup', l.pickup_enabled,
        'available', s.on_hand - s.held - s.committed - s.unavailable
      )
    ) ORDER BY v.display_order, v.variant_key) FILTER (WHERE v.variant_key IS NOT NULL), '[]'::jsonb) AS variants
  FROM products p
  LEFT JOIN product_variants v ON v.product_key = p.product_key AND v.active
  LEFT JOIN inventory_locations l ON l.location_key = $2
  LEFT JOIN inventory_levels s ON s.variant_key = v.variant_key AND s.location_key = l.location_key
  WHERE p.published AND NOT p.archived AND p.kind IN ('concept', 'active') AND ($1::text IS NULL OR p.slug = $1)
  GROUP BY p.product_key
  ORDER BY p.display_order, p.product_key
  LIMIT 101
`;

const availabilityQuery = `
  SELECT p.kind, l.active, l.pickup_enabled AS pickup,
    s.on_hand - s.held - s.committed - s.unavailable AS available
  FROM product_variants v
  JOIN products p ON p.product_key = v.product_key
  LEFT JOIN inventory_locations l ON l.location_key = $2
  LEFT JOIN inventory_levels s ON s.variant_key = v.variant_key AND s.location_key = l.location_key
  WHERE v.variant_key = $1 AND v.active AND p.published AND NOT p.archived AND p.kind IN ('concept', 'active')
`;

interface StockRow {
  active: boolean | null;
  pickup: boolean | null;
  available: number | null;
}

function publicStock(row?: StockRow): ProductStock {
  if (!row?.active || !row.pickup) return { state: "not_offered" };
  if (row.available === null || !Number.isSafeInteger(row.available))
    return { state: "unverified" };
  if (row.available <= 0) return { state: "out_of_stock" };
  if (row.available <= 5)
    return { state: "low_stock", remaining: row.available };
  return { state: "available" };
}

function mapProduct(row: ProductRow, config: SiteConfig): Product {
  const photo = row.kind === "active" ? projectProductPhoto(row.photo) : null;
  const ingredients = row.ingredients === undefined ? [] : row.ingredients;
  if (
    !Array.isArray(row.details) ||
    !row.details.every((detail) => typeof detail === "string") ||
    !Array.isArray(ingredients) ||
    ingredients.length > 40 ||
    !ingredients.every(
      (ingredient) =>
        typeof ingredient === "string" &&
        ingredient.trim().length > 0 &&
        [...ingredient].length <= 200 &&
        !/[\r\n\0]/.test(ingredient),
    ) ||
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
    ingredients,
    category: row.category,
    imageKey: row.imageKey,
    ...(photo ? { photo } : {}),
    kind: row.kind,
    variants: row.variants.map((variant) => ({
      key: variant.key,
      label: variant.label,
      priceMinor: row.kind === "concept" ? null : variant.priceMinor,
      currency: variant.currency,
      ...(row.kind === "active" && config.storefrontLocationKey
        ? { stock: publicStock(variant.internalStock) }
        : {}),
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
      [null, config.storefrontLocationKey ?? null],
    );
    if (result.rows.length > 100)
      throw new CatalogUnavailableError("CATALOG_CAPACITY_REVIEW");
    return {
      source: "database",
      products: result.rows.map((row) => mapProduct(row, config)),
    };
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
      [slug, config.storefrontLocationKey ?? null],
    );
    return result.rows[0] ? mapProduct(result.rows[0], config) : null;
  } catch (error) {
    return unavailable(error);
  }
}

interface AvailabilityRow extends QueryResultRow, StockRow {
  kind: Product["kind"];
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
    return {
      variantKey: variant,
      locationKey: location,
      ...(row.kind === "concept"
        ? { state: "concept" as const }
        : publicStock(row)),
    };
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
    await connection.query(`EXPLAIN ${productQuery}`, [
      null,
      config.storefrontLocationKey ?? null,
    ]);
    await connection.query(`EXPLAIN ${availabilityQuery}`, [null, null]);
    await connection.query(`EXPLAIN ${storeSettingsQuery}`);
    await readStoreSettings(connection);
  } catch (error) {
    unavailable(error);
  }
}
