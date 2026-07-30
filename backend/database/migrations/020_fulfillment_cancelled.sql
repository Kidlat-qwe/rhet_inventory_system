BEGIN;

ALTER TABLE online_orders DROP CONSTRAINT IF EXISTS online_orders_fulfillment_status_check;

ALTER TABLE online_orders
  ADD CONSTRAINT online_orders_fulfillment_status_check
  CHECK (fulfillment_status IN (
    'PROCESSING',
    'READY_TO_SHIP',
    'SHIPPED',
    'RECEIVED',
    'RETURN',
    'RETURN_CONFIRMED',
    'CANCELLED'
  ));

-- Move already-cancelled matching lifecycle onto the fulfillment board tab.
UPDATE online_orders
SET fulfillment_status = 'CANCELLED',
    updated_at = NOW()
WHERE order_status = 'CANCELLED'
  AND fulfillment_status NOT IN ('RETURN', 'RETURN_CONFIRMED', 'CANCELLED');

COMMIT;
