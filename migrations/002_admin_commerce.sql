ALTER TABLE products
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  ADD COLUMN archived boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT products_archived_unpublished CHECK (NOT archived OR NOT published);

ALTER TABLE inventory_locations
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0);

ALTER TABLE inventory_levels
  ADD COLUMN held integer NOT NULL DEFAULT 0 CHECK (held >= 0),
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  ADD CONSTRAINT inventory_levels_allocation_within_on_hand
    CHECK (held::bigint + committed::bigint + unavailable::bigint <= on_hand::bigint);

ALTER TABLE inventory_movements
  ADD COLUMN before_revision integer CHECK (before_revision > 0),
  ADD COLUMN after_revision integer CHECK (after_revision > 0);

CREATE TABLE admin_memberships (
  uid text PRIMARY KEY CHECK (length(uid) BETWEEN 1 AND 128),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admin_sessions (
  session_hash text PRIMARY KEY CHECK (session_hash ~ '^[0-9a-f]{64}$'),
  uid text NOT NULL REFERENCES admin_memberships(uid),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admin_operations (
  operation_id uuid PRIMARY KEY,
  actor_key text NOT NULL CHECK (actor_key ~ '^[a-zA-Z0-9._:-]{1,128}$'),
  action text NOT NULL CHECK (action IN (
    'create_product', 'update_product', 'publish_product', 'archive_product',
    'create_location', 'update_location', 'pickup'
  )),
  resource_key text NOT NULL CHECK (length(resource_key) BETWEEN 1 AND 80),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  before_data jsonb CHECK (octet_length(before_data::text) <= 65536),
  after_data jsonb CHECK (octet_length(after_data::text) <= 65536),
  result jsonb NOT NULL CHECK (octet_length(result::text) <= 65536),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
  order_key uuid PRIMARY KEY,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  location_key text NOT NULL REFERENCES inventory_locations(location_key),
  state text NOT NULL DEFAULT 'creating' CHECK (state IN (
    'creating', 'open', 'paid', 'expired', 'picked_up', 'reconciliation_required'
  )),
  total_minor integer NOT NULL CHECK (total_minor > 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  checkout_session_id text UNIQUE CHECK (length(checkout_session_id) BETWEEN 1 AND 255),
  payment_intent_id text CHECK (length(payment_intent_id) BETWEEN 1 AND 255),
  checkout_expires_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at timestamptz,
  picked_up_at timestamptz,
  reconciliation_reason text CHECK (length(btrim(reconciliation_reason)) BETWEEN 1 AND 500)
);

CREATE TABLE order_lines (
  order_key uuid NOT NULL REFERENCES orders(order_key),
  variant_key text NOT NULL REFERENCES product_variants(variant_key),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  price_minor integer NOT NULL CHECK (price_minor > 0),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 160),
  PRIMARY KEY (order_key, variant_key)
);

CREATE TABLE payment_events (
  event_key text PRIMARY KEY CHECK (length(event_key) BETWEEN 1 AND 255),
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 255),
  order_key uuid NOT NULL REFERENCES orders(order_key),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  result text NOT NULL CHECK (length(result) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE FUNCTION prevent_admin_commerce_history_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Admin and commerce history is append-only';
END;
$$;

CREATE TRIGGER admin_operations_append_only
BEFORE UPDATE OR DELETE ON admin_operations
FOR EACH ROW EXECUTE FUNCTION prevent_admin_commerce_history_changes();

CREATE TRIGGER admin_operations_no_truncate
BEFORE TRUNCATE ON admin_operations
FOR EACH STATEMENT EXECUTE FUNCTION prevent_admin_commerce_history_changes();

CREATE TRIGGER order_lines_append_only
BEFORE UPDATE OR DELETE ON order_lines
FOR EACH ROW EXECUTE FUNCTION prevent_admin_commerce_history_changes();

CREATE TRIGGER order_lines_no_truncate
BEFORE TRUNCATE ON order_lines
FOR EACH STATEMENT EXECUTE FUNCTION prevent_admin_commerce_history_changes();

CREATE TRIGGER payment_events_append_only
BEFORE UPDATE OR DELETE ON payment_events
FOR EACH ROW EXECUTE FUNCTION prevent_admin_commerce_history_changes();

CREATE TRIGGER payment_events_no_truncate
BEFORE TRUNCATE ON payment_events
FOR EACH STATEMENT EXECUTE FUNCTION prevent_admin_commerce_history_changes();

CREATE INDEX inventory_levels_location_stock ON inventory_levels(location_key, variant_key);
CREATE INDEX orders_state_created ON orders(state, created_at, order_key);
CREATE INDEX orders_location_state_created ON orders(location_key, state, created_at);
CREATE INDEX order_lines_variant_orders ON order_lines(variant_key, order_key);
