import { createHash, randomBytes } from 'node:crypto';
import { pool } from '../database/pool.js';
import { AppError, camelize } from '../utils/api.js';

export function hashApiKey(apiKey) {
  return createHash('sha256').update(apiKey).digest('hex');
}

function buildApiKey(systemCode) {
  const slug = systemCode.toLowerCase().replace(/[^a-z0-9]/g, '') || 'system';
  return `rhet_${slug}_${randomBytes(24).toString('base64url')}`;
}

export function resolveApiKeyExpiresAt(expiration) {
  if (!expiration || expiration === 'none') return null;

  const expiresAt = new Date();
  if (expiration === '7d') {
    expiresAt.setDate(expiresAt.getDate() + 7);
    return expiresAt;
  }
  if (expiration === '1m') {
    expiresAt.setMonth(expiresAt.getMonth() + 1);
    return expiresAt;
  }

  throw new AppError(422, 'VALIDATION_ERROR', 'Expiration must be 7d, 1m, or none');
}

function isApiKeyExpired(client) {
  if (!client?.api_key_expires_at) return false;
  return new Date(client.api_key_expires_at).getTime() <= Date.now();
}

function connectionState(client) {
  if (!client.api_key_hash) return 'NOT_CONFIGURED';
  if (isApiKeyExpired(client)) return 'EXPIRED';
  if (client.last_request_at) return 'CONNECTED';
  return 'CONFIGURED';
}

function formatClient(row, stats = {}) {
  return camelize({
    ...row,
    ...stats,
    hasApiKey: Boolean(row.api_key_hash),
    isExpired: isApiKeyExpired(row),
    connectionState: connectionState(row),
  });
}

const returningColumns = `client_id, system_code, display_name, description, webhook_url, api_base_path, status,
  last_request_at, api_key_prefix, api_key_created_at, api_key_expires_at, created_at, updated_at`;

const clientSelect = `SELECT ic.client_id, ic.system_code, ic.display_name, ic.description, ic.webhook_url,
  ic.api_base_path, ic.status, ic.last_request_at, ic.api_key_prefix, ic.api_key_created_at,
  ic.api_key_expires_at, ic.created_at, ic.updated_at,
  COALESCE(stats.total_requests, 0)::int AS total_requests,
  COALESCE(stats.pending_requests, 0)::int AS pending_requests,
  COALESCE(stats.fulfilled_requests, 0)::int AS fulfilled_requests,
  COALESCE(stats.rejected_requests, 0)::int AS rejected_requests
 FROM integration_clients ic
 LEFT JOIN LATERAL (
   SELECT
     COUNT(*)::int AS total_requests,
     COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending_requests,
     COUNT(*) FILTER (WHERE status = 'FULFILLED')::int AS fulfilled_requests,
     COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS rejected_requests
   FROM stock_requests sr
   WHERE sr.source_system = ic.system_code
 ) stats ON true`;

export async function findClientByApiKey(apiKey) {
  if (!apiKey) return null;

  const result = await pool.query(
    `SELECT * FROM integration_clients
     WHERE api_key_hash = $1
       AND status = 'ACTIVE'
       AND (api_key_expires_at IS NULL OR api_key_expires_at > NOW())`,
    [hashApiKey(apiKey)],
  );
  if (result.rowCount) return result.rows[0];

  return null;
}

export async function recordIntegrationActivity(systemCode) {
  await pool.query(
    `UPDATE integration_clients
     SET last_request_at = NOW(), updated_at = NOW()
     WHERE system_code = $1`,
    [systemCode],
  );
}

export async function listIntegrationClients() {
  const result = await pool.query(`${clientSelect} ORDER BY ic.display_name`);
  return result.rows.map((row) => formatClient(row));
}

export async function createIntegrationClient(input) {
  const systemCode = input.systemCode.trim().toUpperCase();
  const displayName = input.displayName.trim();
  const apiKey = buildApiKey(systemCode);
  const expiresAt = resolveApiKeyExpiresAt(input.expiration);

  const result = await pool.query(
    `INSERT INTO integration_clients (
      system_code, display_name, description, webhook_url,
      api_key_hash, api_key_prefix, api_key_created_at, api_key_expires_at, status
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, 'ACTIVE')
    ON CONFLICT (system_code) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      description = EXCLUDED.description,
      webhook_url = EXCLUDED.webhook_url,
      api_key_hash = EXCLUDED.api_key_hash,
      api_key_prefix = EXCLUDED.api_key_prefix,
      api_key_created_at = NOW(),
      api_key_expires_at = EXCLUDED.api_key_expires_at,
      status = 'ACTIVE',
      updated_at = NOW()
    RETURNING ${returningColumns}`,
    [
      systemCode,
      displayName,
      input.description?.trim() || null,
      input.webhookUrl?.trim() || null,
      hashApiKey(apiKey),
      `${apiKey.slice(0, 16)}...`,
      expiresAt,
    ],
  );

  return { client: formatClient(result.rows[0]), apiKey };
}

export async function regenerateIntegrationApiKey(systemCode, expiration = 'none') {
  const apiKey = buildApiKey(systemCode);
  const expiresAt = resolveApiKeyExpiresAt(expiration);
  const result = await pool.query(
    `UPDATE integration_clients
     SET api_key_hash = $1,
         api_key_prefix = $2,
         api_key_created_at = NOW(),
         api_key_expires_at = $3,
         status = 'ACTIVE',
         updated_at = NOW()
     WHERE system_code = $4
     RETURNING ${returningColumns}`,
    [hashApiKey(apiKey), `${apiKey.slice(0, 16)}...`, expiresAt, systemCode],
  );

  if (!result.rowCount) throw new AppError(404, 'CLIENT_NOT_FOUND', 'Integration client was not found');

  return { client: formatClient(result.rows[0]), apiKey };
}

export async function revokeIntegrationApiKey(systemCode) {
  const result = await pool.query(
    `UPDATE integration_clients
     SET api_key_hash = NULL,
         api_key_prefix = NULL,
         api_key_created_at = NULL,
         api_key_expires_at = NULL,
         updated_at = NOW()
     WHERE system_code = $1
     RETURNING ${returningColumns}`,
    [systemCode],
  );

  if (!result.rowCount) throw new AppError(404, 'CLIENT_NOT_FOUND', 'Integration client was not found');

  return formatClient(result.rows[0]);
}

export async function updateIntegrationClient(systemCode, input) {
  const sets = [];
  const values = [];

  if (Object.hasOwn(input, 'webhookUrl')) {
    values.push(input.webhookUrl || null);
    sets.push(`webhook_url = $${values.length}`);
  }
  if (Object.hasOwn(input, 'status')) {
    values.push(input.status);
    sets.push(`status = $${values.length}`);
  }
  if (Object.hasOwn(input, 'description')) {
    values.push(input.description || null);
    sets.push(`description = $${values.length}`);
  }
  if (Object.hasOwn(input, 'displayName')) {
    values.push(input.displayName);
    sets.push(`display_name = $${values.length}`);
  }

  if (!sets.length) throw new AppError(422, 'VALIDATION_ERROR', 'No valid fields to update');

  values.push(systemCode);
  const result = await pool.query(
    `UPDATE integration_clients
     SET ${sets.join(', ')}, updated_at = NOW()
     WHERE system_code = $${values.length}
     RETURNING ${returningColumns}`,
    values,
  );

  if (!result.rowCount) throw new AppError(404, 'CLIENT_NOT_FOUND', 'Integration client was not found');

  return formatClient(result.rows[0]);
}
