BEGIN;

-- Same pattern as online_orders: staff choose whether a returned line goes back to warehouse.
ALTER TABLE stock_requests
  ADD COLUMN IF NOT EXISTS return_reusable BOOLEAN,
  ADD COLUMN IF NOT EXISTS return_notes VARCHAR(500);

-- Legacy staff returns always restocked warehouse.
UPDATE stock_requests
SET return_reusable = TRUE
WHERE status = 'RETURNED'
  AND COALESCE(request_kind, 'REQUEST') = 'REQUEST'
  AND return_reusable IS NULL;

-- CMS inbound Return Stock already increased warehouse qty on accept.
UPDATE stock_requests
SET return_reusable = TRUE
WHERE request_kind = 'RETURN'
  AND return_reusable IS NULL;

COMMENT ON COLUMN stock_requests.return_reusable IS
  'When status is RETURNED: true = warehouse qty increased; false = not reusable, no restock.';

COMMENT ON COLUMN stock_requests.return_notes IS
  'Optional inspection notes when a shipped/delivered stock request is marked returned.';

COMMIT;
