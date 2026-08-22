BEGIN;

-- Kind LEARNING_KIT is the virtual-bundle behavior (category BOM + request components[]).
-- UI label is "Bundle". The same kind can be reused on any category name.
-- Moving Up Kit is the second bundle category (alongside Learning Kit).

UPDATE categories
SET category_kind = 'LEARNING_KIT',
    updated_at = NOW()
WHERE LOWER(TRIM(category_name)) = 'moving up kit'
  AND category_kind <> 'LEARNING_KIT';

COMMENT ON COLUMN categories.category_kind IS
  'Behavior template: SCHOOL_UNIFORM | PE_UNIFORM | LCA_SHIRT | LEARNING_KIT (UI: Bundle) | TOOL_KIT | OTHER. Display name remains unique. LEARNING_KIT may be reused on Learning Kit, Moving Up Kit, and similar packs.';

COMMIT;
