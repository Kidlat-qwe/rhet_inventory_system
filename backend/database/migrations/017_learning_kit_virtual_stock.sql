BEGIN;

-- Learning Kit virtual stock (computed from pinned BOM components).
-- Kit inventory.stocks is kept in sync with min(component stocks); not manually stocked.
-- All BOM lines must pin a concrete inventory item (enforced in application layer).

COMMENT ON TABLE inventory_bundle_components IS
  'Learning Kit BOM. Each row pins a concrete inventory SKU (component_inventory_id). Available kits = min(floor(component.stocks / quantity)).';

COMMENT ON COLUMN inventory_bundle_components.component_inventory_id IS
  'Pinned raw inventory item required for virtual kit stock. Category-only slots are no longer used.';

COMMENT ON COLUMN inventory_bundle_components.component_category_id IS
  'Category of the pinned component (denormalized from the inventory item for filtering/display).';

-- Zero legacy manually entered kit stocks; UI/API will recompute from BOM after re-pinning.
UPDATE inventory i
SET stocks = 0,
    updated_at = NOW()
FROM categories c
WHERE i.category_id = c.category_id
  AND LOWER(TRIM(c.category_name)) = 'learning kit'
  AND i.stocks <> 0;

COMMIT;
