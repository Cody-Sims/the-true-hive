ALTER TABLE orders
  ADD COLUMN buyer_hash text CHECK (buyer_hash ~ '^[0-9a-f]{64}$'),
  ADD COLUMN buyer_access_expires_at timestamptz,
  ADD CONSTRAINT orders_buyer_access_pair CHECK (
    (buyer_hash IS NULL AND buyer_access_expires_at IS NULL) OR
    (buyer_hash IS NOT NULL AND buyer_access_expires_at IS NOT NULL
      AND buyer_access_expires_at > created_at
      AND buyer_access_expires_at <= created_at + interval '720 hours')
  );

CREATE FUNCTION prevent_pickup_buyer_rebinding() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.buyer_hash IS DISTINCT FROM OLD.buyer_hash
    OR NEW.buyer_access_expires_at IS DISTINCT FROM OLD.buyer_access_expires_at THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Checkout buyer access cannot be rebound';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_buyer_access_immutable
BEFORE UPDATE OF buyer_hash,buyer_access_expires_at ON orders
FOR EACH ROW EXECUTE FUNCTION prevent_pickup_buyer_rebinding();

CREATE INDEX orders_buyer_created ON orders(buyer_hash,created_at DESC,order_key)
  WHERE buyer_hash IS NOT NULL;

CREATE TABLE pickup_settings (
  id smallint PRIMARY KEY CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO pickup_settings(id) VALUES (1);

CREATE TABLE pickup_sites (
  site_key text PRIMARY KEY CHECK (site_key ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 160),
  area text NOT NULL CHECK (length(area) <= 160),
  timezone text NOT NULL CHECK (length(timezone) BETWEEN 1 AND 80),
  private_instructions text NOT NULL CHECK (length(private_instructions) <= 2000),
  active boolean NOT NULL DEFAULT false,
  slot_minutes smallint NOT NULL CHECK (slot_minutes IN (15,30,60)),
  capacity integer NOT NULL CHECK (capacity BETWEEN 1 AND 20),
  notice_hours integer NOT NULL CHECK (notice_hours BETWEEN 0 AND 168),
  horizon_days integer NOT NULL CHECK (horizon_days BETWEEN 1 AND 28),
  reschedule_cutoff_hours integer NOT NULL CHECK (reschedule_cutoff_hours BETWEEN 0 AND 168),
  travel_buffer_minutes integer NOT NULL CHECK (travel_buffer_minutes BETWEEN 0 AND 240),
  weekly jsonb NOT NULL CHECK (
    jsonb_typeof(weekly) = 'object'
    AND weekly ?& ARRAY['0','1','2','3','4','5','6']
    AND octet_length(weekly::text) <= 16384
  ),
  exceptions jsonb NOT NULL CHECK (
    jsonb_typeof(exceptions) = 'object' AND octet_length(exceptions::text) <= 32768
  ),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pickup_site_stock_locations (
  site_key text NOT NULL REFERENCES pickup_sites(site_key),
  location_key text NOT NULL REFERENCES inventory_locations(location_key),
  PRIMARY KEY (site_key,location_key)
);

CREATE TABLE pickup_bookings (
  booking_id uuid PRIMARY KEY,
  order_key uuid NOT NULL UNIQUE REFERENCES orders(order_key),
  site_key text NOT NULL REFERENCES pickup_sites(site_key),
  site_label text NOT NULL CHECK (length(btrim(site_label)) BETWEEN 1 AND 160),
  timezone text NOT NULL CHECK (length(timezone) BETWEEN 1 AND 80),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  travel_buffer_minutes integer NOT NULL CHECK (travel_buffer_minutes BETWEEN 0 AND 240),
  status text NOT NULL CHECK (status IN ('scheduled','needs_review')),
  reschedule_cutoff_hours integer NOT NULL CHECK (reschedule_cutoff_hours BETWEEN 0 AND 168),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ends_at > starts_at AND ends_at - starts_at IN (
    interval '15 minutes',interval '30 minutes',interval '60 minutes'
  ))
);
CREATE INDEX pickup_bookings_interval ON pickup_bookings(starts_at,ends_at,site_key);

CREATE TABLE pickup_help_requests (
  order_key uuid PRIMARY KEY REFERENCES orders(order_key),
  requested_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at timestamptz,
  CHECK (resolved_at IS NULL OR resolved_at >= requested_at)
);

ALTER TABLE admin_operations DROP CONSTRAINT admin_operations_action_check;
ALTER TABLE admin_operations ADD CONSTRAINT admin_operations_action_check CHECK (action IN (
  'create_product', 'update_product', 'publish_product', 'archive_product',
  'restore_product', 'delete_product', 'delete_variant',
  'create_location', 'update_location', 'pickup', 'update_store_settings',
  'attach_product_photo', 'remove_product_photo',
  'create_pickup_site', 'update_pickup_site', 'update_pickup_settings',
  'book_pickup', 'request_pickup_help', 'revoke_pickup_access'
));

CREATE INDEX pickup_access_revocations ON admin_operations(resource_key)
  WHERE action='revoke_pickup_access';
