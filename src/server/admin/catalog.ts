import { createHash } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import type {
  AdminInventoryLevel,
  AdminLocation,
  AdminMovement,
  AdminProduct,
  AdminVariant,
} from "../../domain/admin.ts";
import { adjustStock, type AdjustmentResult } from "../inventory/adjust.ts";
import { isRecordKey, validateAdjustment } from "../inventory/rules.ts";
import { AdminError, adminError } from "./errors.ts";

type ProductFields = Omit<AdminProduct, "status" | "revision" | "variants">;
type VariantFields = Omit<AdminVariant, "levels">;
type ProductReceipt = Omit<AdminProduct, "variants"> & {
  variants: VariantFields[];
};
type LocationFields = Omit<AdminLocation, "revision">;
type Database = Pool | PoolClient;
type ProductRow = AdminProduct & QueryResultRow;
type LocationRow = AdminLocation & QueryResultRow;
type LevelRow = AdminInventoryLevel & QueryResultRow;
type MovementRow = AdminMovement & QueryResultRow;

function invalid(field: string, message: string): never {
  throw new AdminError(400, "INVALID_INPUT", message, { [field]: message });
}

function object(input: unknown, field: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    invalid(field, "A JSON object is required.");
  return input as Record<string, unknown>;
}

function only(
  value: Record<string, unknown>,
  allowed: string[],
  field: string,
) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    invalid(field, "The request contains unsupported fields.");
}

function key(value: unknown, field: string): string {
  if (!isRecordKey(value))
    invalid(field, "A valid stable record key is required.");
  return value;
}

function text(value: unknown, field: string, max: number): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    [...value].length > max ||
    value.includes("\0") ||
    /[\ud800-\udfff]/u.test(value)
  )
    invalid(field, `Nonempty text of at most ${max} characters is required.`);
  return value;
}

function bool(value: unknown, field: string): boolean {
  if (typeof value !== "boolean")
    invalid(field, "An explicit boolean is required.");
  return value;
}

function integer(
  value: unknown,
  field: string,
  min = 1,
  max = 2147483647,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  )
    invalid(field, `A whole number from ${min} to ${max} is required.`);
  return value;
}

function choice<T extends string>(
  value: unknown,
  choices: readonly T[],
  field: string,
): T {
  if (typeof value !== "string" || !choices.includes(value as T))
    invalid(field, "Choose a supported value.");
  return value as T;
}

function operation(input: Record<string, unknown>, actorId: string) {
  const id = input["operationId"];
  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  )
    invalid("operationId", "A UUID operation ID is required.");
  if (typeof actorId !== "string" || !/^[a-z0-9._:-]{1,128}$/i.test(actorId))
    invalid("actorId", "A trusted operator key is required.");
  return { operationId: id.toLowerCase(), actorId };
}

function productFields(input: unknown, creating = false): ProductFields {
  const value = object(input, "product");
  only(
    value,
    [
      "key",
      "slug",
      "title",
      "summary",
      "details",
      "category",
      "imageKey",
      "kind",
    ],
    "product",
  );
  const details =
    value["details"] === undefined && creating ? [] : value["details"];
  if (!Array.isArray(details) || details.length > 12)
    invalid("product.details", "At most 12 text details are required.");
  return {
    key: key(value["key"], "product.key"),
    slug: key(value["slug"], "product.slug"),
    title: text(value["title"], "product.title", 160),
    summary: text(value["summary"], "product.summary", 1000),
    details: details.map((detail) => text(detail, "product.details", 2000)),
    category: choice(
      value["category"],
      ["soap", "honey", "candles", "gifts"],
      "product.category",
    ),
    imageKey: choice(
      value["imageKey"],
      ["soap", "honey", "candle"],
      "product.imageKey",
    ),
    kind: choice(
      value["kind"] === undefined && creating ? "draft" : value["kind"],
      ["draft", "concept", "active"],
      "product.kind",
    ),
  };
}

function variantFields(input: unknown): VariantFields[] {
  if (!Array.isArray(input) || input.length > 50)
    invalid("variants", "A complete list of at most 50 variants is required.");
  const variants = input.map((entry) => {
    const value = object(entry, "variants");
    only(
      value,
      ["key", "sku", "label", "priceMinor", "currency", "active"],
      "variants",
    );
    return {
      key: key(value["key"], "variants.key"),
      sku: text(value["sku"], "variants.sku", 128),
      label: text(value["label"], "variants.label", 160),
      priceMinor:
        value["priceMinor"] === null
          ? null
          : integer(value["priceMinor"], "variants.priceMinor"),
      currency: choice(value["currency"], ["USD"], "variants.currency"),
      active: bool(value["active"], "variants.active"),
    };
  });
  if (
    new Set(variants.map((variant) => variant.key)).size !== variants.length ||
    new Set(variants.map((variant) => variant.sku)).size !== variants.length
  )
    invalid("variants", "Variant keys and SKUs must be unique.");
  return variants;
}

function locationFields(input: unknown, creating = false): LocationFields {
  const value = object(input, "location");
  only(
    value,
    ["key", "name", "publicLabel", "active", "pickupEnabled"],
    "location",
  );
  const publicLabel =
    value["publicLabel"] === undefined && creating
      ? null
      : value["publicLabel"];
  return {
    key: key(value["key"], "location.key"),
    name: text(value["name"], "location.name", 160),
    publicLabel:
      publicLabel === null
        ? null
        : text(publicLabel, "location.publicLabel", 160),
    active: bool(
      value["active"] === undefined && creating ? false : value["active"],
      "location.active",
    ),
    pickupEnabled: bool(
      value["pickupEnabled"] === undefined && creating
        ? false
        : value["pickupEnabled"],
      "location.pickupEnabled",
    ),
  };
}

function publishable(product: ProductFields, variants: VariantFields[]) {
  if (
    product.kind !== "active" ||
    !variants.some(
      (variant) =>
        variant.active &&
        variant.currency === "USD" &&
        variant.priceMinor !== null &&
        variant.priceMinor > 0,
    )
  )
    invalid(
      "product",
      "Publication requires an active product and an active positive-price USD variant.",
    );
}

function page(input: unknown, extra: string[]) {
  const value = input === undefined ? {} : object(input, "query");
  only(value, ["limit", "offset", ...extra], "query");
  return {
    value,
    limit: integer(
      value["limit"] === undefined ? 25 : value["limit"],
      "limit",
      1,
      100,
    ),
    offset: integer(
      value["offset"] === undefined ? 0 : value["offset"],
      "offset",
      0,
      1000000,
    ),
  };
}

async function safe<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw adminError(error);
  }
}

async function transaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
  readOnly = false,
): Promise<T> {
  return safe(async () => {
    const client = await pool.connect();
    let discard = false;
    try {
      await client.query(
        readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN",
      );
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        discard = true;
      }
      throw error;
    } finally {
      client.release(discard);
    }
  });
}

const levelFields = `
  s.variant_key AS "variantKey", s.location_key AS "locationKey",
  s.on_hand AS "onHand", s.held, s.committed, s.unavailable,
  s.on_hand - s.held - s.committed - s.unavailable AS sellable, s.revision
`;
const locationQuery = `
  SELECT location_key AS key, name, public_label AS "publicLabel",
    active, pickup_enabled AS "pickupEnabled", revision
  FROM inventory_locations ORDER BY location_key
`;
const productQuery = `
  SELECT p.product_key AS key, p.slug, p.title, p.summary, p.details,
    p.category, p.image_key AS "imageKey", p.kind, p.revision,
    CASE WHEN p.archived THEN 'archived' WHEN p.published THEN 'published' ELSE 'draft' END AS status,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'key', v.variant_key, 'sku', v.sku, 'label', v.label,
        'priceMinor', v.price_minor, 'currency', v.currency, 'active', v.active,
        'levels', COALESCE((
          SELECT jsonb_agg(to_jsonb(level) ORDER BY level."locationKey")
          FROM (SELECT ${levelFields} FROM inventory_levels s WHERE s.variant_key=v.variant_key) level
        ), '[]'::jsonb)
      ) ORDER BY v.display_order, v.variant_key)
      FROM product_variants v WHERE v.product_key=p.product_key
    ), '[]'::jsonb) AS variants
  FROM products p
`;

async function readProduct(
  database: Database,
  productKey: string,
): Promise<AdminProduct | null> {
  const result = await database.query<ProductRow>(
    `${productQuery} WHERE p.product_key=$1`,
    [productKey],
  );
  const product = result.rows[0] ?? null;
  if (
    product &&
    (!Array.isArray(product.details) ||
      !product.details.every((detail) => typeof detail === "string"))
  )
    throw new AdminError(
      503,
      "ADMIN_UNAVAILABLE",
      "The catalog record requires maintenance.",
    );
  return product;
}

export async function getAdminProduct(
  pool: Pool,
  productKey: unknown,
): Promise<AdminProduct | null> {
  const recordKey = key(productKey, "key");
  return safe(() => readProduct(pool, recordKey));
}

export async function listAdminProducts(
  pool: Pool,
  query?: unknown,
): Promise<{
  products: AdminProduct[];
  total: number;
  locations: AdminLocation[];
}> {
  const { value, limit, offset } = page(query, ["search"]);
  const search =
    value["search"] === undefined || value["search"] === ""
      ? null
      : text(value["search"], "search", 160);
  const pattern =
    search === null ? null : `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const filter = `WHERE ($1::text IS NULL OR p.title ILIKE $1 OR p.slug ILIKE $1 OR EXISTS (
    SELECT 1 FROM product_variants v WHERE v.product_key=p.product_key AND v.sku ILIKE $1
  ))`;
  return transaction(
    pool,
    async (client) => {
      const products = await client.query<ProductRow>(
        `${productQuery} ${filter} ORDER BY p.display_order,p.product_key LIMIT $2 OFFSET $3`,
        [pattern, limit, offset],
      );
      const count = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM products p ${filter}`,
        [pattern],
      );
      const locations = await client.query<LocationRow>(locationQuery);
      return {
        products: products.rows,
        total: count.rows[0]!.total,
        locations: locations.rows,
      };
    },
    true,
  );
}

export async function listAdminLocations(pool: Pool): Promise<AdminLocation[]> {
  return safe(async () => (await pool.query<LocationRow>(locationQuery)).rows);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => compareKeys(a, b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

interface OperationResult extends QueryResultRow {
  actor_key: string;
  action: string;
  resource_key: string;
  request_hash: string;
  result: { product?: ProductReceipt; location?: AdminLocation };
}

async function beginOperation(
  client: PoolClient,
  identity: { operationId: string; actorId: string },
  action: string,
  resourceKey: string,
  intent: unknown,
) {
  const hash = createHash("sha256")
    .update(
      canonical({ actorId: identity.actorId, action, resourceKey, intent }),
    )
    .digest("hex");
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))",
    [identity.operationId],
  );
  const recorded = (
    await client.query<OperationResult>(
      "SELECT actor_key,action,resource_key,request_hash,result FROM admin_operations WHERE operation_id=$1",
      [identity.operationId],
    )
  ).rows[0];
  if (recorded) {
    if (
      recorded.actor_key !== identity.actorId ||
      recorded.action !== action ||
      recorded.resource_key !== resourceKey ||
      recorded.request_hash !== hash
    )
      throw new AdminError(
        409,
        "OPERATION_CONFLICT",
        "This operation ID was already used for another intent.",
      );
    return { hash, result: recorded.result };
  }
  // Product/variant and location creation share this lock so neither can miss a new zero pair.
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('admin-catalog-structure',0))",
  );
  return { hash, result: null };
}

async function recordOperation(
  client: PoolClient,
  identity: { operationId: string; actorId: string },
  action: string,
  resourceKey: string,
  hash: string,
  before: ProductReceipt | AdminLocation | null,
  after: ProductReceipt | AdminLocation,
  result: { product: ProductReceipt } | { location: AdminLocation },
) {
  // PostgreSQL measures the actual JSONB text budget; any failure rolls back the mutation.
  await client.query(
    "INSERT INTO admin_operations (operation_id,actor_key,action,resource_key,request_hash,before_data,after_data,result) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)",
    [
      identity.operationId,
      identity.actorId,
      action,
      resourceKey,
      hash,
      before === null ? null : JSON.stringify(before),
      JSON.stringify(after),
      JSON.stringify(result),
    ],
  );
}

function receipt(product: AdminProduct): ProductReceipt {
  return {
    ...product,
    variants: product.variants.map(
      ({ levels: _levels, ...variant }) => variant,
    ),
  };
}

async function replayProduct(
  client: PoolClient,
  original: ProductReceipt,
): Promise<AdminProduct> {
  const levels = await client.query<LevelRow>(
    `SELECT ${levelFields} FROM inventory_levels s WHERE s.variant_key=ANY($1::text[]) ORDER BY s.variant_key,s.location_key`,
    [original.variants.map((variant) => variant.key)],
  );
  // Content/revision are the original operation receipt; precise stock is always refreshed.
  return {
    ...original,
    variants: original.variants.map((variant) => ({
      ...variant,
      levels: levels.rows.filter((level) => level.variantKey === variant.key),
    })),
  };
}

async function writeVariants(
  client: PoolClient,
  productKey: string,
  variants: VariantFields[],
  existing: AdminVariant[] = [],
) {
  const known = new Map(existing.map((variant) => [variant.key, variant]));
  if (
    existing.some(
      (variant) => !variants.some((next) => next.key === variant.key),
    )
  )
    throw new AdminError(
      409,
      "STABLE_VARIANT_REQUIRED",
      "Existing variants must be retained. Deactivate them instead of removing them.",
    );
  for (const [index, variant] of variants
    .map((variant, index) => [index, variant] as const)
    .sort(([, a], [, b]) => compareKeys(a.key, b.key))) {
    const previous = known.get(variant.key);
    if (previous) {
      if (previous.sku !== variant.sku)
        throw new AdminError(
          409,
          "STABLE_SKU_REQUIRED",
          "An existing variant's SKU cannot be replaced.",
        );
      await client.query(
        "UPDATE product_variants SET label=$2,price_minor=$3,currency=$4,active=$5,display_order=$6 WHERE variant_key=$1",
        [
          variant.key,
          variant.label,
          variant.priceMinor,
          variant.currency,
          variant.active,
          index,
        ],
      );
    } else {
      await client.query(
        "INSERT INTO product_variants (variant_key,product_key,sku,label,price_minor,currency,active,display_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          variant.key,
          productKey,
          variant.sku,
          variant.label,
          variant.priceMinor,
          variant.currency,
          variant.active,
          index,
        ],
      );
      await client.query(
        'INSERT INTO inventory_levels (variant_key,location_key) SELECT $1,location_key FROM inventory_locations ORDER BY location_key COLLATE "C"',
        [variant.key],
      );
    }
  }
}

export async function createAdminProduct(
  pool: Pool,
  input: unknown,
  actorId: string,
): Promise<{ product: AdminProduct; replayed: boolean }> {
  const value = object(input, "request");
  only(value, ["operationId", "product", "variants", "actorId"], "request");
  const identity = operation(value, actorId);
  const product = productFields(value["product"], true);
  const variants = variantFields(value["variants"]);
  return transaction(pool, async (client) => {
    const op = await beginOperation(
      client,
      identity,
      "create_product",
      product.key,
      { product, variants },
    );
    if (op.result?.product)
      return {
        product: await replayProduct(client, op.result.product),
        replayed: true,
      };
    await client.query(
      "INSERT INTO products (product_key,slug,title,summary,details,category,image_key,kind) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)",
      [
        product.key,
        product.slug,
        product.title,
        product.summary,
        JSON.stringify(product.details),
        product.category,
        product.imageKey,
        product.kind,
      ],
    );
    await writeVariants(client, product.key, variants);
    const created = (await readProduct(client, product.key))!;
    const after = receipt(created);
    await recordOperation(
      client,
      identity,
      "create_product",
      product.key,
      op.hash,
      null,
      after,
      { product: after },
    );
    return { product: created, replayed: false };
  });
}

export async function updateAdminProduct(
  pool: Pool,
  productKey: unknown,
  input: unknown,
  actorId: string,
): Promise<{ product: AdminProduct; replayed: boolean }> {
  const resourceKey = key(productKey, "key");
  const value = object(input, "request");
  only(
    value,
    [
      "operationId",
      "expectedRevision",
      "action",
      "product",
      "variants",
      "actorId",
    ],
    "request",
  );
  const identity = operation(value, actorId);
  const revision = integer(value["expectedRevision"], "expectedRevision");
  const action = choice(
    value["action"],
    ["save", "publish", "archive"],
    "action",
  );
  const hasContent =
    action !== "archive" ||
    value["product"] !== undefined ||
    value["variants"] !== undefined;
  const product = hasContent ? productFields(value["product"]) : null;
  const variants = hasContent ? variantFields(value["variants"]) : null;
  if (product && product.key !== resourceKey)
    invalid("product.key", "The product key cannot be replaced.");
  if (action === "publish") publishable(product!, variants!);
  const auditAction =
    action === "publish"
      ? "publish_product"
      : action === "archive"
        ? "archive_product"
        : "update_product";
  return transaction(pool, async (client) => {
    const op = await beginOperation(
      client,
      identity,
      auditAction,
      resourceKey,
      { expectedRevision: revision, action, product, variants },
    );
    if (op.result?.product)
      return {
        product: await replayProduct(client, op.result.product),
        replayed: true,
      };
    const locked = (
      await client.query<{
        revision: number;
        published: boolean;
        archived: boolean;
      }>(
        "SELECT revision,published,archived FROM products WHERE product_key=$1 FOR UPDATE",
        [resourceKey],
      )
    ).rows[0];
    if (!locked)
      throw new AdminError(404, "NOT_FOUND", "The product does not exist.");
    if (locked.revision !== revision || revision >= 2147483647)
      throw new AdminError(
        409,
        "REVISION_CONFLICT",
        "The product revision changed. Review the current record.",
      );
    await client.query(
      'SELECT variant_key FROM product_variants WHERE product_key=$1 ORDER BY variant_key COLLATE "C" FOR UPDATE',
      [resourceKey],
    );
    const before = (await readProduct(client, resourceKey))!;
    const published =
      action === "publish" || (action === "save" && locked.published);
    const archived =
      action === "archive" || (action === "save" && locked.archived);
    if (product && variants) {
      if (published) publishable(product, variants);
      await client.query(
        "UPDATE products SET slug=$2,title=$3,summary=$4,details=$5::jsonb,category=$6,image_key=$7,kind=$8 WHERE product_key=$1",
        [
          resourceKey,
          product.slug,
          product.title,
          product.summary,
          JSON.stringify(product.details),
          product.category,
          product.imageKey,
          product.kind,
        ],
      );
      await writeVariants(client, resourceKey, variants, before.variants);
    }
    await client.query(
      "UPDATE products SET published=$2,archived=$3,revision=revision+1 WHERE product_key=$1",
      [resourceKey, published, archived],
    );
    const updated = (await readProduct(client, resourceKey))!;
    const after = receipt(updated);
    await recordOperation(
      client,
      identity,
      auditAction,
      resourceKey,
      op.hash,
      receipt(before),
      after,
      { product: after },
    );
    return { product: updated, replayed: false };
  });
}

export async function createAdminLocation(
  pool: Pool,
  input: unknown,
  actorId: string,
): Promise<{ location: AdminLocation; replayed: boolean }> {
  const value = object(input, "request");
  only(value, ["operationId", "location", "actorId"], "request");
  const identity = operation(value, actorId);
  const location = locationFields(value["location"], true);
  return transaction(pool, async (client) => {
    const op = await beginOperation(
      client,
      identity,
      "create_location",
      location.key,
      { location },
    );
    if (op.result?.location)
      return { location: op.result.location, replayed: true };
    const created = (
      await client.query<LocationRow>(
        'INSERT INTO inventory_locations (location_key,name,public_label,active,pickup_enabled) VALUES ($1,$2,$3,$4,$5) RETURNING location_key AS key,name,public_label AS "publicLabel",active,pickup_enabled AS "pickupEnabled",revision',
        [
          location.key,
          location.name,
          location.publicLabel,
          location.active,
          location.pickupEnabled,
        ],
      )
    ).rows[0]!;
    await client.query(
      'INSERT INTO inventory_levels (variant_key,location_key) SELECT variant_key,$1 FROM product_variants ORDER BY variant_key COLLATE "C"',
      [location.key],
    );
    await recordOperation(
      client,
      identity,
      "create_location",
      location.key,
      op.hash,
      null,
      created,
      { location: created },
    );
    return { location: created, replayed: false };
  });
}

export async function updateAdminLocation(
  pool: Pool,
  locationKey: unknown,
  input: unknown,
  actorId: string,
): Promise<{ location: AdminLocation; replayed: boolean }> {
  const resourceKey = key(locationKey, "key");
  const value = object(input, "request");
  only(
    value,
    ["operationId", "expectedRevision", "location", "actorId"],
    "request",
  );
  const identity = operation(value, actorId);
  const revision = integer(value["expectedRevision"], "expectedRevision");
  const location = locationFields(value["location"]);
  if (location.key !== resourceKey)
    invalid("location.key", "The location key cannot be replaced.");
  return transaction(pool, async (client) => {
    const op = await beginOperation(
      client,
      identity,
      "update_location",
      resourceKey,
      { expectedRevision: revision, location },
    );
    if (op.result?.location)
      return { location: op.result.location, replayed: true };
    const before = (
      await client.query<LocationRow>(
        'SELECT location_key AS key,name,public_label AS "publicLabel",active,pickup_enabled AS "pickupEnabled",revision FROM inventory_locations WHERE location_key=$1 FOR UPDATE',
        [resourceKey],
      )
    ).rows[0];
    if (!before)
      throw new AdminError(404, "NOT_FOUND", "The location does not exist.");
    if (before.revision !== revision || revision >= 2147483647)
      throw new AdminError(
        409,
        "REVISION_CONFLICT",
        "The location revision changed. Review the current record.",
      );
    const updated = (
      await client.query<LocationRow>(
        'UPDATE inventory_locations SET name=$2,public_label=$3,active=$4,pickup_enabled=$5,revision=revision+1 WHERE location_key=$1 RETURNING location_key AS key,name,public_label AS "publicLabel",active,pickup_enabled AS "pickupEnabled",revision',
        [
          resourceKey,
          location.name,
          location.publicLabel,
          location.active,
          location.pickupEnabled,
        ],
      )
    ).rows[0]!;
    await recordOperation(
      client,
      identity,
      "update_location",
      resourceKey,
      op.hash,
      before,
      updated,
      { location: updated },
    );
    return { location: updated, replayed: false };
  });
}

export async function adjustAdminStock(
  pool: Pool,
  input: unknown,
  actorId: string,
): Promise<{ adjustment: AdjustmentResult; level: AdminInventoryLevel }> {
  const value = object(input, "request");
  only(
    value,
    [
      "operationId",
      "variantKey",
      "locationKey",
      "delta",
      "reason",
      "expectedRevision",
      "actorId",
    ],
    "request",
  );
  const identity = operation(value, actorId);
  integer(value["expectedRevision"], "expectedRevision");
  const reason = text(
    typeof value["reason"] === "string"
      ? value["reason"].trim()
      : value["reason"],
    "reason",
    500,
  );
  return safe(async () => {
    const change = validateAdjustment({ ...value, ...identity, reason });
    const adjustment = await adjustStock(pool, change);
    const level = (
      await pool.query<LevelRow>(
        `SELECT ${levelFields} FROM inventory_levels s WHERE s.variant_key=$1 AND s.location_key=$2`,
        [change.variantKey, change.locationKey],
      )
    ).rows[0];
    if (!level)
      throw new AdminError(
        503,
        "ADMIN_UNAVAILABLE",
        "The authoritative stock record is unavailable.",
      );
    return { adjustment, level };
  });
}

export async function listAdminHistory(
  pool: Pool,
  query?: unknown,
): Promise<AdminMovement[]> {
  const { value, limit, offset } = page(query, ["variantKey", "locationKey"]);
  const variantKey =
    value["variantKey"] === undefined
      ? null
      : key(value["variantKey"], "variantKey");
  const locationKey =
    value["locationKey"] === undefined
      ? null
      : key(value["locationKey"], "locationKey");
  return safe(async () => {
    const result = await pool.query<MovementRow>(
      `
      SELECT operation_id AS "operationId",variant_key AS "variantKey",location_key AS "locationKey",
        delta,actor_id AS "actorId",reason,before_on_hand AS "beforeOnHand",after_on_hand AS "onHand",created_at AS "createdAt"
      FROM inventory_movements
      WHERE ($1::text IS NULL OR variant_key=$1) AND ($2::text IS NULL OR location_key=$2)
      ORDER BY created_at DESC,operation_id DESC LIMIT $3 OFFSET $4
    `,
      [variantKey, locationKey, limit, offset],
    );
    return result.rows.map((row) => ({
      ...row,
      createdAt: new Date(row.createdAt).toISOString(),
    }));
  });
}
