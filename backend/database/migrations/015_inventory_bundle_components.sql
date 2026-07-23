BEGIN;

-- Bill of materials for Learning Kit (and future bundle) inventory items.
-- Each row links a kit (bundle) to an existing component inventory item.
-- Quantity is fixed at 1 for the current Learning Kit model.
CREATE TABLE IF NOT EXISTS inventory_bundle_components (
  component_row_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_inventory_id uuid NOT NULL REFERENCES inventory(inventory_id) ON DELETE CASCADE,
  component_inventory_id uuid NOT NULL REFERENCES inventory(inventory_id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity = 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_bundle_components_unique UNIQUE (bundle_inventory_id, component_inventory_id),
  CONSTRAINT inventory_bundle_components_no_self CHECK (bundle_inventory_id <> component_inventory_id)
);

CREATE INDEX IF NOT EXISTS idx_bundle_components_bundle
  ON inventory_bundle_components(bundle_inventory_id);

CREATE INDEX IF NOT EXISTS idx_bundle_components_component
  ON inventory_bundle_components(component_inventory_id);

COMMENT ON TABLE inventory_bundle_components IS
  'Learning Kit BOM: which inventory items are included in a kit. Quantity is always 1.';

COMMIT;
