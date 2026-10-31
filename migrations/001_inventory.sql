CREATE TABLE products (
  product_key text PRIMARY KEY CHECK (product_key ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  summary text NOT NULL CHECK (length(summary) BETWEEN 1 AND 1000),
  details jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(details) = 'array' AND jsonb_array_length(details) <= 12),
  category text NOT NULL CHECK (category IN ('soap', 'honey', 'candles', 'gifts')),
  image_key text NOT NULL CHECK (image_key IN ('soap', 'honey', 'candle')),
  kind text NOT NULL DEFAULT 'draft' CHECK (kind IN ('draft', 'concept', 'active')),
  published boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE product_variants (
  variant_key text PRIMARY KEY CHECK (variant_key ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  product_key text NOT NULL REFERENCES products(product_key),
  sku text NOT NULL UNIQUE CHECK (length(sku) BETWEEN 1 AND 128),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 160),
  price_minor integer CHECK (price_minor > 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0
);

CREATE TABLE inventory_locations (
  location_key text PRIMARY KEY CHECK (location_key ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  public_label text,
  active boolean NOT NULL DEFAULT false,
  pickup_enabled boolean NOT NULL DEFAULT false
);

CREATE TABLE inventory_levels (
  variant_key text NOT NULL REFERENCES product_variants(variant_key),
  location_key text NOT NULL REFERENCES inventory_locations(location_key),
  on_hand integer NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
  committed integer NOT NULL DEFAULT 0 CHECK (committed >= 0),
  unavailable integer NOT NULL DEFAULT 0 CHECK (unavailable >= 0),
  PRIMARY KEY (variant_key, location_key),
  CHECK (committed::bigint + unavailable::bigint <= on_hand)
);

CREATE TABLE inventory_movements (
  operation_id uuid PRIMARY KEY,
  variant_key text NOT NULL,
  location_key text NOT NULL,
  delta integer NOT NULL CHECK (delta <> 0),
  actor_id text NOT NULL CHECK (actor_id ~ '^[a-zA-Z0-9._:-]{1,128}$'),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  before_on_hand integer NOT NULL CHECK (before_on_hand >= 0),
  after_on_hand integer NOT NULL CHECK (after_on_hand >= 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (variant_key, location_key) REFERENCES inventory_levels(variant_key, location_key),
  CHECK (after_on_hand - before_on_hand = delta)
);

CREATE INDEX inventory_movements_stock_history ON inventory_movements(variant_key, location_key, created_at);

CREATE FUNCTION prevent_inventory_history_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Inventory movement history is append-only';
END;
$$;

CREATE TRIGGER inventory_history_append_only
BEFORE UPDATE OR DELETE ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_history_changes();

CREATE TRIGGER inventory_history_no_truncate
BEFORE TRUNCATE ON inventory_movements
FOR EACH STATEMENT EXECUTE FUNCTION prevent_inventory_history_changes();
