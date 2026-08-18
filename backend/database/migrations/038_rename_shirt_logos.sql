BEGIN;

-- Shirt logos were stored as uniform_type "Logo 1" / "Logo 2".
-- Display names are now Beeli / LCA. Existing SKUs are left unchanged.

UPDATE inventory
SET uniform_type = 'Beeli'
WHERE uniform_type = 'Logo 1';

UPDATE inventory
SET uniform_type = 'LCA'
WHERE uniform_type = 'Logo 2';

UPDATE inventory
SET variation = replace(variation, 'Logo 1', 'Beeli')
WHERE variation LIKE '%Logo 1%';

UPDATE inventory
SET variation = replace(variation, 'Logo 2', 'LCA')
WHERE variation LIKE '%Logo 2%';

COMMIT;
