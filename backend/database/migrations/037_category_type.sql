BEGIN;

-- Merchandise vs Supplies grouping (UI label: Category type).
-- Independent of category_kind (Uniform / Learning Kit / Others behavior).

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS category_type VARCHAR(20) NOT NULL DEFAULT 'MERCHANDISE';

ALTER TABLE categories
  DROP CONSTRAINT IF EXISTS categories_type_check;

ALTER TABLE categories
  ADD CONSTRAINT categories_type_check CHECK (
    category_type IN ('MERCHANDISE', 'SUPPLIES')
  );

UPDATE categories
SET category_type = 'MERCHANDISE'
WHERE LOWER(TRIM(category_name)) IN (
  'backpack',
  'id lace',
  'moving up kit',
  'pe uniform',
  'school uniform',
  'shirt'
);

UPDATE categories
SET category_type = 'SUPPLIES'
WHERE LOWER(TRIM(category_name)) IN (
  'learning kit',
  'copy one',
  'tool kit',
  'worx 200gsm',
  'worx pale',
  'workbooks'
);

CREATE INDEX IF NOT EXISTS idx_categories_type ON categories (category_type);

COMMENT ON COLUMN categories.category_type IS
  'Business grouping shown as Category type: MERCHANDISE | SUPPLIES. Independent of category_kind.';

COMMIT;
