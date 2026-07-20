BEGIN;

CREATE TABLE channel_sku_mappings (
  mapping_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel VARCHAR(50) NOT NULL DEFAULT 'SHOPEE',
  external_sku VARCHAR(120) NOT NULL,
  external_item_name VARCHAR(255),
  inventory_id UUID NOT NULL REFERENCES inventory(inventory_id),
  created_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT channel_sku_mappings_unique UNIQUE (channel, external_sku)
);

CREATE INDEX idx_channel_sku_mappings_inventory ON channel_sku_mappings(inventory_id);

CREATE TABLE online_orders (
  order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel VARCHAR(50) NOT NULL DEFAULT 'SHOPEE',
  external_order_id VARCHAR(100) NOT NULL,
  order_status VARCHAR(20) NOT NULL DEFAULT 'RECEIVED'
    CHECK (order_status IN ('RECEIVED', 'NEEDS_ATTENTION', 'FULFILLED', 'CANCELLED')),
  buyer_name VARCHAR(150),
  order_placed_at TIMESTAMPTZ,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  source VARCHAR(20) NOT NULL DEFAULT 'CSV_IMPORT'
    CHECK (source IN ('CSV_IMPORT', 'MANUAL', 'API')),
  imported_by UUID REFERENCES users(user_id),
  notes VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT online_orders_external_unique UNIQUE (channel, external_order_id)
);

CREATE INDEX idx_online_orders_status ON online_orders(order_status, created_at DESC);
CREATE INDEX idx_online_orders_channel ON online_orders(channel, created_at DESC);

CREATE TABLE online_order_items (
  order_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES online_orders(order_id) ON DELETE CASCADE,
  external_sku VARCHAR(120),
  external_item_name VARCHAR(255),
  external_variation VARCHAR(255),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  line_status VARCHAR(20) NOT NULL DEFAULT 'UNMATCHED'
    CHECK (line_status IN ('MATCHED', 'UNMATCHED', 'OVERSOLD', 'DEDUCTED', 'CANCELLED')),
  matched_inventory_id UUID REFERENCES inventory(inventory_id),
  matched_sku VARCHAR(64),
  movement_id UUID REFERENCES stock_movements(movement_id),
  failure_reason VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT online_order_items_line_unique UNIQUE (order_id, external_sku, external_variation)
);

CREATE INDEX idx_online_order_items_order ON online_order_items(order_id);
CREATE INDEX idx_online_order_items_status ON online_order_items(line_status);

ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check CHECK (
  movement_type IN (
    'STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'RETURN', 'DAMAGED', 'RELEASED', 'CANCELLED', 'ONLINE_SALE'
  )
);

COMMIT;
