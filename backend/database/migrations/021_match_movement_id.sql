BEGIN;

ALTER TABLE online_order_item_matches
  ADD COLUMN IF NOT EXISTS movement_id uuid REFERENCES stock_movements(movement_id);

COMMENT ON COLUMN online_order_item_matches.movement_id IS
  'Stock movement created when this mapped qty was deducted on shipment (ONLINE_SALE).';

COMMENT ON TABLE online_order_item_matches IS
  'RHET inventory rows mapped to a Shopee order line. Supports one-to-many for bundles. Stock deducts when the order ships.';

COMMIT;
