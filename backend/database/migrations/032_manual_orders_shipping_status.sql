BEGIN;

-- Align manual_orders fulfillment statuses with Scoring Shipping Management.
-- Remove READY_TO_SHIP; rename RECEIVED → DELIVERED; CANCELLED → ERROR;
-- add PENDING, INELIGIBLE, NEEDS_ATTENTION.

ALTER TABLE manual_orders DROP CONSTRAINT IF EXISTS manual_orders_fulfillment_status_check;

UPDATE manual_orders
SET fulfillment_status = 'PROCESSING', updated_at = NOW()
WHERE fulfillment_status = 'READY_TO_SHIP';

UPDATE manual_orders
SET fulfillment_status = 'DELIVERED', updated_at = NOW()
WHERE fulfillment_status = 'RECEIVED';

UPDATE manual_orders
SET fulfillment_status = 'ERROR', updated_at = NOW()
WHERE fulfillment_status = 'CANCELLED';

ALTER TABLE manual_orders
  ADD CONSTRAINT manual_orders_fulfillment_status_check
  CHECK (fulfillment_status IN (
    'PENDING',
    'PROCESSING',
    'SHIPPED',
    'DELIVERED',
    'ERROR',
    'INELIGIBLE',
    'NEEDS_ATTENTION',
    'RETURN',
    'RETURN_CONFIRMED'
  ));

ALTER TABLE manual_orders
  ADD COLUMN IF NOT EXISTS external_reference VARCHAR(120),
  ADD COLUMN IF NOT EXISTS source_system VARCHAR(40),
  ADD COLUMN IF NOT EXISTS student_name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS program_name VARCHAR(180),
  ADD COLUMN IF NOT EXISTS payment_date DATE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_orders_external_reference
  ON manual_orders (external_reference)
  WHERE external_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_manual_orders_source_system
  ON manual_orders (source_system)
  WHERE source_system IS NOT NULL;

COMMENT ON TABLE manual_orders IS
  'HQ / Scoring courier shipments (non-Shopee). Status tabs align with Scoring Shipping Management.';
COMMENT ON COLUMN manual_orders.external_reference IS
  'Idempotency key from external system (e.g. SCORING-12389).';
COMMENT ON COLUMN manual_orders.source_system IS
  'Origin system code (e.g. SCORING) or null for staff-created orders.';
COMMENT ON COLUMN manual_orders.student_name IS
  'Student name from Scoring Shipping Management when pushed.';
COMMENT ON COLUMN manual_orders.program_name IS
  'Program / campus label from Scoring when pushed.';

COMMIT;
