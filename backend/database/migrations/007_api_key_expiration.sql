BEGIN;

ALTER TABLE integration_clients
  ADD COLUMN IF NOT EXISTS api_key_expires_at TIMESTAMPTZ;

COMMIT;
