BEGIN;

-- Freebies kind family: same inventory behavior as Uniform / Bundle subtypes,
-- tagged so categories can be created and labeled as promotional freebies.
-- Drop both historical constraint names (018/029 used categories_kind_check).

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
