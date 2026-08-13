BEGIN;

-- Distinguish HQ restock requests from inbound CMS branch returns.
ALTER TABLE stock_requests
  ADD COLUMN IF NOT EXISTS request_kind VARCHAR(20) NOT NULL DEFAULT 'REQUEST';

ALTER TABLE stock_requests
  DROP CONSTRAINT IF EXISTS stock_requests_request_kind_check;

ALTER TABLE stock_requests
  ADD CONSTRAINT stock_requests_request_kind_check
  CHECK (request_kind IN ('REQUEST', 'RETURN'));

CREATE INDEX IF NOT EXISTS idx_stock_requests_request_kind
  ON stock_requests (request_kind, status, created_at DESC);

COMMENT ON COLUMN stock_requests.request_kind IS
  'REQUEST = branch restock from HQ. RETURN = branch sending goods back to warehouse (CMS Return Stock).';

COMMIT;
