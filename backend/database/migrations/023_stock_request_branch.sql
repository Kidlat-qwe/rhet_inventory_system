BEGIN;

-- CMS/PSMS branch display name for stock requests (e.g. "LCA Makati").
-- Required on new integration POSTs; nullable so historical rows remain valid.
ALTER TABLE stock_requests
  ADD COLUMN IF NOT EXISTS branch_name VARCHAR(150);

CREATE INDEX IF NOT EXISTS idx_stock_requests_branch_name
  ON stock_requests (branch_name);

COMMENT ON COLUMN stock_requests.branch_name IS
  'CMS/PSMS branch or campus display name that submitted the request';

COMMIT;
