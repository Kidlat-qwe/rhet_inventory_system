BEGIN;

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS internal_selling_price NUMERIC(12, 2) NOT NULL DEFAULT 0
  CHECK (internal_selling_price >= 0);

COMMENT ON COLUMN inventory.price IS
  'Selling price (external / catalog).';

COMMENT ON COLUMN inventory.internal_selling_price IS
  'Internal selling price. Required on create/update from the Inventory UI.';

COMMIT;
