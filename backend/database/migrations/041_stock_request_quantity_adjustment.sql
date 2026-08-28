BEGIN;

ALTER TABLE stock_requests
  ADD COLUMN IF NOT EXISTS original_quantity INTEGER,
  ADD COLUMN IF NOT EXISTS quantity_adjustment_remarks VARCHAR(500),
  ADD COLUMN IF NOT EXISTS quantity_adjusted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quantity_adjusted_by UUID REFERENCES users(user_id);

COMMENT ON COLUMN stock_requests.original_quantity IS
  'CMS-requested quantity before RHET staff adjustment (set on first adjustment).';

COMMENT ON COLUMN stock_requests.quantity_adjustment_remarks IS
  'Required note when staff reduces quantity before ship (synced to partner via webhook).';

COMMIT;
