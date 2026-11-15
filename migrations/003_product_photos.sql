ALTER TABLE products
  ADD COLUMN photo jsonb,
  ADD CONSTRAINT products_photo_shape CHECK (
    photo IS NULL OR CASE
      WHEN jsonb_typeof(photo) = 'object'
        AND photo ?& ARRAY['id','alt','width','height','bytes']
        AND photo - ARRAY['id','alt','width','height','bytes']::text[] = '{}'::jsonb
        AND jsonb_typeof(photo->'id') = 'string'
        AND jsonb_typeof(photo->'alt') = 'string'
        AND jsonb_typeof(photo->'width') = 'number'
        AND jsonb_typeof(photo->'height') = 'number'
        AND jsonb_typeof(photo->'bytes') = 'number'
      THEN
        photo->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND length(btrim(photo->>'alt')) BETWEEN 1 AND 300
        AND photo->>'alt' !~ '[[:cntrl:]]'
        AND (photo->>'width')::numeric BETWEEN 1 AND 2048
        AND (photo->>'width')::numeric = trunc((photo->>'width')::numeric)
        AND (photo->>'height')::numeric BETWEEN 1 AND 2048
        AND (photo->>'height')::numeric = trunc((photo->>'height')::numeric)
        AND (photo->>'bytes')::numeric BETWEEN 1 AND 4194304
        AND (photo->>'bytes')::numeric = trunc((photo->>'bytes')::numeric)
        AND octet_length(photo::text) <= 8192
      ELSE false
    END
  );

CREATE UNIQUE INDEX products_photo_id ON products ((photo->>'id'))
  WHERE photo IS NOT NULL;

ALTER TABLE admin_operations DROP CONSTRAINT admin_operations_action_check;
ALTER TABLE admin_operations ADD CONSTRAINT admin_operations_action_check CHECK (action IN (
  'create_product', 'update_product', 'publish_product', 'archive_product',
  'create_location', 'update_location', 'pickup',
  'attach_product_photo', 'remove_product_photo'
));
