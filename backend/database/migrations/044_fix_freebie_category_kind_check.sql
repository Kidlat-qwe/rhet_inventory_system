BEGIN;

-- Fix Freebies CHECK: 043 initially dropped the wrong constraint name
-- (categories_category_kind_check) while live DBs still had categories_kind_check
-- from 018/029, so FREEBIE_* inserts failed with CONSTRAINT_VIOLATION (422).

ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_category_kind_check;
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_kind_check;

ALTER TABLE categories
  ADD CONSTRAINT categories_kind_check CHECK (
    category_kind IN (
      'SCHOOL_UNIFORM',
      'PE_UNIFORM',
      'LCA_SHIRT',
      'LEARNING_KIT',
      'TOOL_KIT',
      'OTHER',
      'FREEBIE_SCHOOL_UNIFORM',
      'FREEBIE_PE_UNIFORM',
      'FREEBIE_LCA_SHIRT',
      'FREEBIE_LEARNING_KIT'
    )
  );

COMMENT ON COLUMN categories.category_kind IS
  'Behavior template: SCHOOL_UNIFORM | PE_UNIFORM | LCA_SHIRT | LEARNING_KIT (UI: Bundle) | TOOL_KIT | OTHER | FREEBIE_* (same behavior as base kinds, promotional freebies). Display name remains unique.';

COMMIT;
