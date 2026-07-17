BEGIN;

CREATE TABLE integration_clients (
  client_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_code VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  description VARCHAR(500),
  webhook_url VARCHAR(500),
  api_base_path VARCHAR(120) NOT NULL DEFAULT '/api/v1/integrations',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'INACTIVE')),
  last_request_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
