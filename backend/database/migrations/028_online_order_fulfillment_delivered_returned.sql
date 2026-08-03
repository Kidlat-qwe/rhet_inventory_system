BEGIN;

-- Online orders board: Received → Delivered; Return + Return confirmed → Returned.
ALTER TABLE online_orders DROP CONSTRAINT IF EXISTS online_orders_fulfillment_status_check;

ALTER TABLE online_orders
  ADD CONSTRAINT online_orders_fulfillment_status_check
  CHECK (fulfillment_status IN (
    'PROCESSING',
    'READY_TO_SHIP',
    'SHIPPED',
    'RECEIVED',
    'DELIVERED',
    'RETURN',
    'RETURN_CONFIRMED',
    'RETURNED',
    'CANCELLED'
  ));

UPDATE online_orders
SET fulfillment_status = 'DELIVERED',
    updated_at = NOW()
WHERE fulfillment_status = 'RECEIVED';

UPDATE online_orders
SET fulfillment_status = 'RETURNED',
    updated_at = NOW()
WHERE fulfillment_status IN ('RETURN', 'RETURN_CONFIRMED');

ALTER TABLE online_orders DROP CONSTRAINT IF EXISTS online_orders_fulfillment_status_check;

ALTER TABLE online_orders
  ADD CONSTRAINT online_orders_fulfillment_status_check
  CHECK (fulfillment_status IN (
    'PROCESSING',
    'READY_TO_SHIP',
    'SHIPPED',
    'DELIVERED',
    'RETURNED',
    'CANCELLED'
  ));

COMMIT;
