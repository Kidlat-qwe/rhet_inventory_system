-- Tool Kit: virtual parent SKUs with pinned child inventory BOM (item-based).
-- Differs from Learning Kit (category-slot BOM). Available kits =
-- min(floor(child.stocks / quantity)) across pinned components.

ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_kind_check;
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_category_kind_check;

ALTER TABLE categories
  ADD CONSTRAINT categories_kind_check CHECK (
    category_kind IN (
      'SCHOOL_UNIFORM',
      'PE_UNIFORM',
      'LCA_SHIRT',
      'LEARNING_KIT',
      'TOOL_KIT',
      'OTHER'
    )
  );

UPDATE categories
SET category_kind = 'TOOL_KIT'
WHERE LOWER(TRIM(category_name)) = 'tool kit'
   OR LOWER(TRIM(category_name)) LIKE '%tool kit%';

COMMENT ON COLUMN categories.category_kind IS
  'Behavior template: SCHOOL_UNIFORM | PE_UNIFORM | LCA_SHIRT | LEARNING_KIT | TOOL_KIT | OTHER. Display name (category_name) remains unique.';
