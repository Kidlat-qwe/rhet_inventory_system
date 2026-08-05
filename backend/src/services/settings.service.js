import { pool } from '../database/pool.js';
import { AppError } from '../utils/api.js';

/** Canonical defaults when DB is empty or a key is missing. */
export const DEFAULT_SETTINGS = Object.freeze({
  organizationName: 'RHET Inventory System',
  timezone: 'Asia/Manila',
  defaultLowStockThreshold: 20,
  courierPresets: Object.freeze(['LBC Express', 'J&T Express', 'Lalamove']),
  uniformSizes: Object.freeze(['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL']),
  shirtSizes: Object.freeze(['XS', 'S', 'M', 'L', 'XL', 'Teen']),
  helpAssistantEnabled: true,
});

const ALLOWED_TIMEZONES = new Set(['Asia/Manila', 'Asia/Singapore', 'UTC']);

function cleanStringList(value, { maxItems = 40, maxLen = 60 } = {}) {
  if (!Array.isArray(value)) return null;
  const seen = new Set();
  const out = [];
  for (const entry of value) {
    const text = String(entry || '').trim();
    if (!text || text.length > maxLen) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

function mergeSettings(stored = {}) {
  const courierPresets = cleanStringList(stored.courierPresets) || [...DEFAULT_SETTINGS.courierPresets];
  const uniformSizes = cleanStringList(stored.uniformSizes, { maxItems: 30, maxLen: 20 })
    || [...DEFAULT_SETTINGS.uniformSizes];
  const shirtSizes = cleanStringList(stored.shirtSizes, { maxItems: 30, maxLen: 20 })
    || [...DEFAULT_SETTINGS.shirtSizes];

  const threshold = Number(stored.defaultLowStockThreshold);
  const organizationName = String(stored.organizationName || '').trim().slice(0, 120)
    || DEFAULT_SETTINGS.organizationName;
  const timezone = ALLOWED_TIMEZONES.has(stored.timezone)
    ? stored.timezone
    : DEFAULT_SETTINGS.timezone;

  return {
    organizationName,
    timezone,
    defaultLowStockThreshold: Number.isFinite(threshold) && threshold >= 0
      ? Math.min(999999, Math.floor(threshold))
      : DEFAULT_SETTINGS.defaultLowStockThreshold,
    courierPresets,
    uniformSizes,
    shirtSizes,
    helpAssistantEnabled: stored.helpAssistantEnabled === false ? false : true,
  };
}

export async function getSettings() {
  const result = await pool.query(
    'SELECT settings, updated_at, updated_by FROM system_settings WHERE id = 1',
  );
  if (!result.rowCount) {
    await pool.query(
      `INSERT INTO system_settings (id, settings) VALUES (1, '{}'::jsonb)
       ON CONFLICT (id) DO NOTHING`,
    );
    return {
      ...mergeSettings({}),
      updatedAt: null,
      updatedBy: null,
    };
  }
  const row = result.rows[0];
  return {
    ...mergeSettings(row.settings || {}),
    updatedAt: row.updated_at || null,
    updatedBy: row.updated_by || null,
  };
}

/**
 * Partial update: only provided keys are merged into the stored document.
 */
export async function updateSettings(patch = {}, actorUserId = null) {
  if (!patch || typeof patch !== 'object') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Settings body is required');
  }

  const current = await getSettings();
  const next = { ...current };

  if (patch.organizationName !== undefined) {
    const name = String(patch.organizationName || '').trim();
    if (name.length < 2 || name.length > 120) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Organization name must be 2–120 characters');
    }
    next.organizationName = name;
  }

  if (patch.timezone !== undefined) {
    if (!ALLOWED_TIMEZONES.has(patch.timezone)) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Unsupported timezone');
    }
    next.timezone = patch.timezone;
  }

  if (patch.defaultLowStockThreshold !== undefined) {
    const threshold = Number(patch.defaultLowStockThreshold);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 999999) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Default low-stock threshold must be 0–999999');
    }
    next.defaultLowStockThreshold = Math.floor(threshold);
  }

  if (patch.courierPresets !== undefined) {
    const list = cleanStringList(patch.courierPresets);
    if (!list?.length) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Add at least one courier preset');
    }
    next.courierPresets = list;
  }

  if (patch.uniformSizes !== undefined) {
    const list = cleanStringList(patch.uniformSizes, { maxItems: 30, maxLen: 20 });
    if (!list?.length) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Add at least one uniform size');
    }
    next.uniformSizes = list;
  }

  if (patch.shirtSizes !== undefined) {
    const list = cleanStringList(patch.shirtSizes, { maxItems: 30, maxLen: 20 });
    if (!list?.length) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Add at least one shirt size');
    }
    next.shirtSizes = list;
  }

  if (patch.helpAssistantEnabled !== undefined) {
    next.helpAssistantEnabled = Boolean(patch.helpAssistantEnabled);
  }

  const document = {
    organizationName: next.organizationName,
    timezone: next.timezone,
    defaultLowStockThreshold: next.defaultLowStockThreshold,
    courierPresets: next.courierPresets,
    uniformSizes: next.uniformSizes,
    shirtSizes: next.shirtSizes,
    helpAssistantEnabled: next.helpAssistantEnabled,
  };

  const result = await pool.query(
    `INSERT INTO system_settings (id, settings, updated_at, updated_by)
     VALUES (1, $1::jsonb, NOW(), $2)
     ON CONFLICT (id) DO UPDATE SET
       settings = EXCLUDED.settings,
       updated_at = NOW(),
       updated_by = EXCLUDED.updated_by
     RETURNING settings, updated_at, updated_by`,
    [JSON.stringify(document), actorUserId || null],
  );

  const row = result.rows[0];
  return {
    ...mergeSettings(row.settings || {}),
    updatedAt: row.updated_at || null,
    updatedBy: row.updated_by || null,
  };
}
