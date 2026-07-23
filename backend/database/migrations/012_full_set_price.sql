BEGIN;

-- Per-variant bundle price for uniform "sets". A uniform set is the pairing of
-- the category's two types (School Uniform: Polo + Short, PE Uniform: Shirt +
-- Pants) for the same gender and size. The value is entered once per pair and
-- stored on both rows of the pair. NULL for non-set / non-uniform items.
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS full_set_price numeric(12, 2);

COMMENT ON COLUMN inventory.full_set_price IS
  'Bundle price for a uniform set (Polo+Short / Shirt+Pants) sharing gender and size. NULL when the item is not part of a set.';

COMMIT;
