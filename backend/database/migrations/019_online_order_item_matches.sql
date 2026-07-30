BEGIN;

-- Multi-item RHET matches for one Shopee order line (bundles / kits).
CREATE TABLE IF NOT EXISTS online_order_item_matches (
  match_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES online_order_items(order_item_id) ON DELETE CASCADE,
  inventory_id uuid NOT NULL REFERENCES inventory(inventory_id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT online_order_item_matches_unique UNIQUE (order_item_id, inventory_id)
);

CREATE INDEX IF NOT EXISTS idx_online_order_item_matches_item
  ON online_order_item_matches(order_item_id);

CREATE INDEX IF NOT EXISTS idx_online_order_item_matches_inventory
  ON online_order_item_matches(inventory_id);

COMMENT ON TABLE online_order_item_matches IS
  'RHET inventory rows mapped to a Shopee order line. Supports one-to-many for bundle listings. Visibility only; stock still uses channel allocation.';

-- Backfill existing single matches.
INSERT INTO online_order_item_matches (order_item_id, inventory_id, quantity)
SELECT oi.order_item_id, oi.matched_inventory_id, oi.quantity
FROM online_order_items oi
WHERE oi.matched_inventory_id IS NOT NULL
  AND oi.line_status IN ('MATCHED', 'DEDUCTED', 'OVERSOLD')
ON CONFLICT (order_item_id, inventory_id) DO NOTHING;

COMMIT;
