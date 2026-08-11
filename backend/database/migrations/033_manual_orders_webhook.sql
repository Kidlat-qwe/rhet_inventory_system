BEGIN;

-- Scoring / partner Manual Orders integration: webhook columns + longer notes for Remarks.

ALTER TABLE manual_orders
  ADD COLUMN IF NOT EXISTS webhook_url VARCHAR(500),
  ADD COLUMN IF NOT EXISTS webhook_last_status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS webhook_last_attempt_at TIMESTAMPTZ;

ALTER TABLE manual_orders
  ALTER COLUMN notes TYPE VARCHAR(2000);

COMMENT ON COLUMN manual_orders.webhook_url IS
  'Partner callback URL for manual_order.* events (Scoring Shipping Management).';
COMMENT ON COLUMN manual_orders.notes IS
  'Delivery remarks / mapping hints (up to 2000 chars for Scoring Remarks).';

COMMIT;
