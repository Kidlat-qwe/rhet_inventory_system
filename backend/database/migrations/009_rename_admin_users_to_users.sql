BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'admin_users'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN
    ALTER TABLE admin_users RENAME TO users;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'admin_id'
  ) THEN
    ALTER TABLE users RENAME COLUMN admin_id TO user_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_users_email_unique') THEN
    ALTER TABLE users RENAME CONSTRAINT admin_users_email_unique TO users_email_unique;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_users_role_valid') THEN
    ALTER TABLE users RENAME CONSTRAINT admin_users_role_valid TO users_role_valid;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_users_pkey') THEN
    ALTER TABLE users RENAME CONSTRAINT admin_users_pkey TO users_pkey;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_users_firebase_uid_key') THEN
    ALTER TABLE users RENAME CONSTRAINT admin_users_firebase_uid_key TO users_firebase_uid_key;
  END IF;
END $$;

COMMIT;
