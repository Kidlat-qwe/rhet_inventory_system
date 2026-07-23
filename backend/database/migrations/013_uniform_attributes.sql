BEGIN;

-- Structured uniform attributes. Uniform-like categories (School Uniform, PE
-- Uniform, LCA Shirt) identify a variant by gender + type + size. These columns
-- replace parsing the free-text `variation` string for matching/reporting; the
-- `variation` column is kept for display and for non-uniform free-text values.
-- All three are NULL for non-uniform items.
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS uniform_gender varchar(10),
  ADD COLUMN IF NOT EXISTS uniform_type   varchar(20),
  ADD COLUMN IF NOT EXISTS uniform_size   varchar(10);

COMMENT ON COLUMN inventory.uniform_gender IS 'Uniform variant gender (Male/Female/Unisex). NULL for non-uniform items.';
COMMENT ON COLUMN inventory.uniform_type IS 'Uniform variant type (Polo/Short/Shirt/Pants). NULL for non-uniform items.';
COMMENT ON COLUMN inventory.uniform_size IS 'Uniform variant size (XS..5XL). NULL for non-uniform items.';

-- Guarantee a single row per uniform variant within a category (also guards the
-- auto-created Polo/Short and Shirt/Pants pairs against duplicates).
CREATE UNIQUE INDEX IF NOT EXISTS inventory_uniform_variant_unique
  ON inventory (category_id, uniform_gender, uniform_type, uniform_size)
  WHERE uniform_gender IS NOT NULL;

COMMIT;
