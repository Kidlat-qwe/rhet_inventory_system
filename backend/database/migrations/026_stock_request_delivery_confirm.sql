BEGIN;

ALTER TABLE stock_requests
  ADD COLUMN IF NOT EXISTS delivery_confirmed_by VARCHAR(150),
  ADD COLUMN IF NOT EXISTS delivery_notes VARCHAR(500),
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

COMMENT ON COLUMN stock_requests.delivery_confirmed_by IS
  'Display name of branch admin (or staff) who confirmed physical receipt';
COMMENT ON COLUMN stock_requests.delivered_at IS
  'When status moved to DELIVERED (CMS confirm or RHET manual override)';

COMMIT;
