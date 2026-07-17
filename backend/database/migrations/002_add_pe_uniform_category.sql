BEGIN;

INSERT INTO categories (category_name) VALUES ('PE Uniform')
ON CONFLICT (category_name) DO NOTHING;

COMMIT;
