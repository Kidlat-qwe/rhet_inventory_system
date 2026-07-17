BEGIN;

ALTER TABLE integration_clients
  ADD COLUMN IF NOT EXISTS api_key_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS api_key_prefix VARCHAR(24),
  ADD COLUMN IF NOT EXISTS api_key_created_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_clients_api_key_hash
  ON integration_clients(api_key_hash)
  WHERE api_key_hash IS NOT NULL;

COMMIT;
