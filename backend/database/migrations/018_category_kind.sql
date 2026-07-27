BEGIN;

-- Category type (behavior) can be reused; category_name stays unique.
-- kind drives uniform / learning-kit UI and matching without requiring the
-- display name to equal the canonical preset label.

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS category_kind VARCHAR(32) NOT NULL DEFAULT 'OTHER';

ALTER TABLE categories
  DROP CONSTRAINT IF EXISTS categories_kind_check;

ALTER TABLE categories
  ADD CONSTRAINT categories_kind_check CHECK (
    category_kind IN (
      'SCHOOL_UNIFORM',
      'PE_UNIFORM',
      'LCA_SHIRT',
      'LEARNING_KIT',
      'OTHER'
    )
  );

-- Backfill from existing names (heuristics; admins can keep custom display names).
UPDATE categories SET category_kind = 'SCHOOL_UNIFORM'
WHERE LOWER(TRIM(category_name)) = 'school uniform'
   OR LOWER(TRIM(category_name)) LIKE '%school%uniform%';

UPDATE categories SET category_kind = 'PE_UNIFORM'
WHERE LOWER(TRIM(category_name)) = 'pe uniform'
   OR LOWER(TRIM(category_name)) LIKE 'pe %uniform%'
   OR LOWER(TRIM(category_name)) LIKE '% pe uniform%';

UPDATE categories SET category_kind = 'LCA_SHIRT'
WHERE LOWER(TRIM(category_name)) IN ('lca t-shirt', 'lca tshirt', 'lca shirt')
   OR (LOWER(TRIM(category_name)) LIKE '%lca%' AND LOWER(TRIM(category_name)) LIKE '%shirt%');

UPDATE categories SET category_kind = 'LEARNING_KIT'
WHERE LOWER(TRIM(category_name)) = 'learning kit'
   OR LOWER(TRIM(category_name)) LIKE '%learning kit%';

-- Anything ending with " uniform" that is still OTHER → treat as PE-style uniform family.
UPDATE categories SET category_kind = 'PE_UNIFORM'
WHERE category_kind = 'OTHER'
  AND LOWER(TRIM(category_name)) LIKE '% uniform';

CREATE INDEX IF NOT EXISTS idx_categories_kind ON categories (category_kind);

COMMENT ON COLUMN categories.category_kind IS
  'Behavior template: SCHOOL_UNIFORM | PE_UNIFORM | LCA_SHIRT | LEARNING_KIT | OTHER. Display name (category_name) remains unique.';

COMMIT;
