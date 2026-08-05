-- Single-row system settings (JSON document) for org defaults and catalog presets.

CREATE TABLE IF NOT EXISTS system_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  updated_by uuid REFERENCES users(user_id)
);

COMMENT ON TABLE system_settings IS
  'Singleton org settings: low-stock default, couriers, uniform sizes, branding, feature flags.';

INSERT INTO system_settings (id, settings)
VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
