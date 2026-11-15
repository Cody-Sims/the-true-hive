CREATE FUNCTION valid_product_ingredients(value jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT CASE WHEN jsonb_typeof(value) = 'array' THEN
    jsonb_array_length(value) <= 40 AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(value) AS entry
      WHERE jsonb_typeof(entry) <> 'string'
        OR length(entry #>> '{}') NOT BETWEEN 1 AND 200
        OR length(btrim(entry #>> '{}', E' \t\n\r\f\013')) = 0
        OR entry #>> '{}' ~ E'[\n\r]'
    )
  ELSE false END
$$;

ALTER TABLE products
  ADD COLUMN ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT products_ingredients_shape CHECK (valid_product_ingredients(ingredients));
