-- Parent/child SKU support as a category flag (Others + toggle),
-- instead of a dedicated TOOL_KIT category type.

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS has_child_skus boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN categories.has_child_skus IS
  'When true, inventory items in this category can be parent kits with raw child SKUs (computed parent stock). Used with category_kind OTHER after Tool Kit type was removed from the UI.';

-- Existing Tool Kit categories keep their display name but become Others + child SKUs.
UPDATE categories
SET category_kind = 'OTHER',
    has_child_skus = true,
    updated_at = NOW()
WHERE category_kind = 'TOOL_KIT'
   OR LOWER(TRIM(category_name)) = 'tool kit'
   OR LOWER(TRIM(category_name)) LIKE '%tool kit%';

-- Any remaining TOOL_KIT kind rows (safety).
UPDATE categories
SET has_child_skus = true
WHERE category_kind = 'TOOL_KIT' AND has_child_skus = false;
