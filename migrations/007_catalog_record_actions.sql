ALTER TABLE admin_operations DROP CONSTRAINT admin_operations_action_check;
ALTER TABLE admin_operations ADD CONSTRAINT admin_operations_action_check CHECK (action IN (
  'create_product', 'update_product', 'publish_product', 'archive_product',
  'restore_product', 'delete_product', 'delete_variant',
  'create_location', 'update_location', 'pickup', 'update_store_settings',
  'attach_product_photo', 'remove_product_photo'
));
