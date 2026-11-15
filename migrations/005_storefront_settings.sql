CREATE TABLE storefront_settings (
  id smallint PRIMARY KEY CHECK (id = 1),
  purchases_enabled boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO storefront_settings (id) VALUES (1);

ALTER TABLE admin_operations DROP CONSTRAINT admin_operations_action_check;
ALTER TABLE admin_operations ADD CONSTRAINT admin_operations_action_check CHECK (action IN (
  'create_product', 'update_product', 'publish_product', 'archive_product',
  'create_location', 'update_location', 'pickup', 'update_store_settings'
));
