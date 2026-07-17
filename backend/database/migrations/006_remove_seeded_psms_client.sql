BEGIN;

-- Remove only the untouched legacy seed. User-created or active integrations
-- are preserved when they have an API key or associated stock requests.
DELETE FROM integration_clients AS client
WHERE client.system_code = 'PSMS'
  AND client.api_key_hash IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM stock_requests AS request
    WHERE request.source_system = client.system_code
  );

COMMIT;
