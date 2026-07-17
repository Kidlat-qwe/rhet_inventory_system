BEGIN;

CREATE TABLE stock_requests (
  request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system VARCHAR(50) NOT NULL DEFAULT 'PSMS',
  external_reference VARCHAR(100),
  request_date DATE NOT NULL DEFAULT CURRENT_DATE,
  requested_by VARCHAR(150) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  category_name VARCHAR(100) NOT NULL,
  gender VARCHAR(20),
  item_type VARCHAR(50),
  size_label VARCHAR(20),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'FULFILLED', 'FAILED')),
  inventory_id UUID REFERENCES inventory(inventory_id),
  matched_sku VARCHAR(64),
  movement_id UUID REFERENCES stock_movements(movement_id),
  webhook_url VARCHAR(500),
  rejection_reason VARCHAR(500),
  failure_reason VARCHAR(500),
  processed_by UUID REFERENCES users(user_id),
  processed_at TIMESTAMPTZ,
  webhook_last_status VARCHAR(20),
  webhook_last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT stock_requests_external_ref_unique UNIQUE (source_system, external_reference)
);

CREATE INDEX idx_stock_requests_status ON stock_requests(status, created_at DESC);
CREATE INDEX idx_stock_requests_requested_by ON stock_requests(requested_by);
CREATE INDEX idx_stock_requests_inventory ON stock_requests(inventory_id);

COMMIT;
