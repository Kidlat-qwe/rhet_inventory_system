BEGIN;

-- Bundle / Tool Kit BOM: allow configurable component quantity (default 1).
-- Available kits = min(floor(component_stock / quantity)) across BOM lines.

ALTER TABLE inventory_bundle_components
  DROP CONSTRAINT IF EXISTS inventory_bundle_components_quantity_check;

ALTER TABLE inventory_bundle_components
  ADD CONSTRAINT inventory_bundle_components_quantity_check
  CHECK (quantity > 0);

COMMENT ON COLUMN inventory_bundle_components.quantity IS
  'Units of this component required per parent kit/bundle. Default 1. Available kits use floor(stock / quantity).';

COMMIT;
