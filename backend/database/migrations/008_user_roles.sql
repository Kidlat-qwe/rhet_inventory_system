BEGIN;

-- Keep this migration safe for both legacy admin_users and renamed users tables.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'ADMIN';

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'users_role_valid'
    ) THEN
      ALTER TABLE users
        ADD CONSTRAINT users_role_valid CHECK (role IN ('ADMIN', 'USER'));
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'admin_users'
  ) THEN
    ALTER TABLE admin_users
      ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'ADMIN';

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'admin_users_role_valid'
    ) THEN
      ALTER TABLE admin_users
        ADD CONSTRAINT admin_users_role_valid CHECK (role IN ('ADMIN', 'USER'));
    END IF;
  END IF;
END $$;

COMMIT;
