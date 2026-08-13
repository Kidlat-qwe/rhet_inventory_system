BEGIN;

-- Group CMS cart lines (one submit) and persist shipment invoices at internal selling price.

ALTER TABLE stock_requests
  ADD COLUMN IF NOT EXISTS batch_reference VARCHAR(100);

UPDATE stock_requests
SET batch_reference = COALESCE(NULLIF(BTRIM(external_reference), ''), request_id::text)
WHERE batch_reference IS NULL OR BTRIM(batch_reference) = '';

CREATE INDEX IF NOT EXISTS idx_stock_requests_batch_reference
  ON stock_requests (source_system, batch_reference, created_at DESC);

COMMENT ON COLUMN stock_requests.batch_reference IS
  'Shared CMS cart / request-group id. Same value on every line from one Request Stock submit.';

CREATE SEQUENCE IF NOT EXISTS stock_request_invoice_number_seq START WITH 1;

CREATE TABLE IF NOT EXISTS stock_request_invoices (
  invoice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(40) NOT NULL UNIQUE,
  source_system VARCHAR(50) NOT NULL DEFAULT 'PSMS',
  batch_reference VARCHAR(100) NOT NULL,
  branch_name VARCHAR(150),
  requested_by VARCHAR(150),
  reason VARCHAR(500),
  shipment_seq INTEGER NOT NULL DEFAULT 1 CHECK (shipment_seq > 0),
  currency VARCHAR(8) NOT NULL DEFAULT 'PHP',
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  created_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT stock_request_invoices_batch_seq UNIQUE (source_system, batch_reference, shipment_seq)
);

CREATE INDEX IF NOT EXISTS idx_stock_request_invoices_batch
  ON stock_request_invoices (source_system, batch_reference, created_at DESC);

CREATE TABLE IF NOT EXISTS stock_request_invoice_lines (
  invoice_line_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES stock_request_invoices(invoice_id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES stock_requests(request_id),
  category_name VARCHAR(100),
  item_name VARCHAR(180),
  sku VARCHAR(64),
  variation VARCHAR(120),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  line_total NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_request_invoice_lines_invoice
  ON stock_request_invoice_lines (invoice_id);

CREATE INDEX IF NOT EXISTS idx_stock_request_invoice_lines_request
  ON stock_request_invoice_lines (request_id);

COMMENT ON TABLE stock_request_invoices IS
  'One invoice per warehouse shipment within a stock-request group. Prices are snapshots of internal_selling_price.';

COMMIT;
