BEGIN;

-- Full-set pricing was retired from the product model. Uniform sets are now
-- tracked only as paired per-piece rows (e.g. Polo+Short / Blouse+Skirt).
ALTER TABLE inventory DROP COLUMN IF EXISTS full_set_price;

COMMIT;
