BEGIN;

-- HQ direct shipments with RHET-provided courier (separate from Shopee Online Orders).

CREATE TABLE IF NOT EXISTS manual_orders (
  order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(40) NOT NULL,
  customer_name VARCHAR(150) NOT NULL,
  customer_phone VARCHAR(40),
  shipping_address VARCHAR(500),
  courier_name VARCHAR(100),
  tracking_number VARCHAR(100),
  notes VARCHAR(500),
  fulfillment_status VARCHAR(30) NOT NULL DEFAULT 'PROCESSING'
    CHECK (fulfillment_status IN (
      'PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'RECEIVED',
      'RETURN', 'RETURN_CONFIRMED', 'CANCELLED'
    )),
  created_by UUID REFERENCES users(user_id),
  shipped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT manual_orders_order_number_unique UNIQUE (order_number)
);

CREATE INDEX IF NOT EXISTS idx_manual_orders_fulfillment
  ON manual_orders (fulfillment_status, created_at DESC);

CREATE TABLE IF NOT EXISTS manual_order_items (
  order_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES manual_orders(order_id) ON DELETE CASCADE,
  inventory_id UUID NOT NULL REFERENCES inventory(inventory_id),
  sku VARCHAR(64),
  item_name VARCHAR(180),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_status VARCHAR(20) NOT NULL DEFAULT 'MATCHED'
    CHECK (line_status IN ('MATCHED', 'DEDUCTED', 'CANCELLED')),
  movement_id UUID REFERENCES stock_movements(movement_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manual_order_items_order
  ON manual_order_items (order_id);

CREATE INDEX IF NOT EXISTS idx_manual_order_items_inventory
  ON manual_order_items (inventory_id);

ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check CHECK (
  movement_type IN (
    'STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'RETURN', 'DAMAGED', 'RELEASED',
    'CANCELLED', 'ONLINE_SALE', 'CHANNEL_ALLOCATION', 'MANUAL_SALE'
  )
);

COMMENT ON TABLE manual_orders IS
  'HQ direct-to-customer shipments fulfilled with RHET-provided courier (not marketplace).';
COMMENT ON COLUMN stock_movements.movement_type IS
  'Includes MANUAL_SALE for Manual Orders ship-deduct.';

COMMIT;
