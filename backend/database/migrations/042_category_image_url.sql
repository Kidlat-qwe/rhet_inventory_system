BEGIN;

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN categories.image_url IS
  'Optional category icon/image (HTTPS URL or data URL) shown on inventory item rows for this category.';

COMMIT;
