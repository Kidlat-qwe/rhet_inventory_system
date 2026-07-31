BEGIN;

-- Stock request fulfillment lifecycle:
--   PENDING → SHIPPED (warehouse deduct) → DELIVERED (branch received)
--   PENDING → REJECTED
--   SHIPPED | DELIVERED → RETURNED (restock warehouse)
-- Cut out live use of APPROVED / FULFILLED / FAILED.

ALTER TABLE stock_requests DROP CONSTRAINT IF EXISTS stock_requests_status_check;

UPDATE stock_requests SET status = 'DELIVERED' WHERE status IN ('FULFILLED', 'APPROVED');
UPDATE stock_requests SET status = 'PENDING' WHERE status = 'FAILED';

ALTER TABLE stock_requests
  ADD CONSTRAINT stock_requests_status_check
  CHECK (status IN ('PENDING', 'SHIPPED', 'DELIVERED', 'RETURNED', 'REJECTED'));

COMMENT ON COLUMN stock_requests.status IS
  'PENDING | SHIPPED (RHET stock deducted) | DELIVERED | RETURNED | REJECTED';

COMMIT;
