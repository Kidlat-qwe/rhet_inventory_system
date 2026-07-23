BEGIN;

-- Learning Kit BOM redesign:
--   Uniform slots   → category only (gender/type/size chosen on the stock request)
--   Non-uniform     → category + pinned inventory item (item name / SKU)
-- Option A allocate → only pinned inventory rows are multi-deducted with the kit.

ALTER TABLE inventory_bundle_components
  ALTER COLUMN component_inventory_id DROP NOT NULL;

ALTER TABLE inventory_bundle_components
  ADD COLUMN IF NOT EXISTS component_category_id uuid
    REFERENCES categories(category_id) ON DELETE RESTRICT;

-- Backfill category from any previously SKU-bound rows.
UPDATE inventory_bundle_components bc
SET component_category_id = i.category_id
FROM inventory i
WHERE bc.component_inventory_id = i.inventory_id
  AND bc.component_category_id IS NULL;

ALTER TABLE inventory_bundle_components
  ALTER COLUMN component_category_id SET NOT NULL;

ALTER TABLE inventory_bundle_components
  DROP CONSTRAINT IF EXISTS inventory_bundle_components_unique;

ALTER TABLE inventory_bundle_components
  DROP CONSTRAINT IF EXISTS inventory_bundle_components_no_self;

ALTER TABLE inventory_bundle_components
  DROP CONSTRAINT IF EXISTS inventory_bundle_components_shape;

ALTER TABLE inventory_bundle_components
  ADD CONSTRAINT inventory_bundle_components_shape CHECK (
    component_inventory_id IS NULL
    OR component_inventory_id <> bundle_inventory_id
  );

-- One category-only slot per category per kit.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bundle_components_category_slot
  ON inventory_bundle_components (bundle_inventory_id, component_category_id)
  WHERE component_inventory_id IS NULL;

-- One pinned inventory item per kit.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bundle_components_pinned_item
  ON inventory_bundle_components (bundle_inventory_id, component_inventory_id)
  WHERE component_inventory_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bundle_components_category
  ON inventory_bundle_components (component_category_id);

COMMENT ON TABLE inventory_bundle_components IS
  'Learning Kit BOM. Uniform slots store category only; non-uniform slots pin a specific inventory item. Quantity is always 1 on the recipe.';

COMMENT ON COLUMN inventory_bundle_components.component_category_id IS
  'Category included in the kit. Required for every BOM row.';

COMMENT ON COLUMN inventory_bundle_components.component_inventory_id IS
  'Pinned inventory item for non-uniform components. NULL for uniform category slots resolved at request time.';

-- Component lines supplied by the external system when requesting a Learning Kit.
CREATE TABLE IF NOT EXISTS stock_request_components (
  request_component_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES stock_requests(request_id) ON DELETE CASCADE,
  category_name varchar(100) NOT NULL,
  gender varchar(20),
  item_type varchar(50),
  size_label varchar(20),
  item_name varchar(180),
  quantity integer NOT NULL CHECK (quantity > 0),
  inventory_id uuid REFERENCES inventory(inventory_id) ON DELETE SET NULL,
  matched_sku varchar(64),
  failure_reason varchar(500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_request_components_request
  ON stock_request_components (request_id);

COMMENT ON TABLE stock_request_components IS
  'Per-request component specs for Learning Kits (gender/type/size or item name). Resolved and deducted on approve.';

COMMIT;
