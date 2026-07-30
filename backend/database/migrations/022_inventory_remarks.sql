BEGIN;

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS remarks VARCHAR(500);

COMMENT ON COLUMN inventory.remarks IS
  'Optional free-text description / notes for the inventory item.';

COMMIT;
