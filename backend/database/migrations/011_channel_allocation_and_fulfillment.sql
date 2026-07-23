BEGIN;

ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check CHECK (
  movement_type IN (
    'STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'RETURN', 'DAMAGED', 'RELEASED',
    'CANCELLED', 'ONLINE_SALE', 'CHANNEL_ALLOCATION'
  )
);

ALTER TABLE online_orders
  ADD COLUMN fulfillment_status VARCHAR(20) NOT NULL DEFAULT 'PROCESSING'
    CHECK (fulfillment_status IN (
      'PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'RECEIVED', 'RETURN', 'RETURN_CONFIRMED'
    )),
  ADD COLUMN return_reusable BOOLEAN,
  ADD COLUMN return_notes VARCHAR(500);

CREATE INDEX idx_online_orders_fulfillment_status ON online_orders(fulfillment_status, created_at DESC);

CREATE TABLE channel_stock_snapshots (
  snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel VARCHAR(50) NOT NULL DEFAULT 'SHOPEE',
  inventory_id UUID NOT NULL REFERENCES inventory(inventory_id),
  baseline_qty INTEGER NOT NULL DEFAULT 0 CHECK (baseline_qty >= 0),
  allocated_qty INTEGER NOT NULL DEFAULT 0 CHECK (allocated_qty >= 0),
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT channel_stock_snapshots_unique UNIQUE (channel, inventory_id)
);

CREATE INDEX idx_channel_stock_snapshots_inventory ON channel_stock_snapshots(inventory_id);

CREATE TABLE channel_allocation_logs (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel VARCHAR(50) NOT NULL DEFAULT 'SHOPEE',
  inventory_id UUID NOT NULL REFERENCES inventory(inventory_id),
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('ALLOCATE', 'DEALLOCATE')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  movement_id UUID REFERENCES stock_movements(movement_id),
  created_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_channel_allocation_logs_inventory ON channel_allocation_logs(inventory_id, created_at DESC);

COMMIT;
