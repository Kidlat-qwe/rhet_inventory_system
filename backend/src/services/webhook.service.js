import { env } from '../config/env.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TERMINAL_EVENTS = new Set(['stock_request.fulfilled', 'stock_request.rejected']);

export function looksLikeUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

/** Build processor context from authenticated admin row (req.admin). */
export function processorFromAdmin(admin) {
  if (!admin) return null;

  const userId = admin.user_id || admin.userId || null;
  const fullName = String(admin.full_name || admin.fullName || '').trim();
  const email = String(admin.email || '').trim();

  let displayName = null;
  if (fullName && !looksLikeUuid(fullName)) displayName = fullName;
  else if (email && !looksLikeUuid(email)) displayName = email;

  return {
    userId: userId && looksLikeUuid(String(userId)) ? String(userId) : userId,
    displayName,
    email: email || null,
  };
}

/**
 * Display name for external systems. Never returns a UUID.
 * Preference: full name → email → null
 */
export function resolveProcessedByDisplayName(request = {}) {
  const candidates = [
    request.processed_by_name,
    request.processedByName,
    request.processed_by_email,
    request.processedByEmail,
    request.approvedBy,
    request.rejectedBy,
    request.processedBy,
  ];

  for (const raw of candidates) {
    if (raw === null || raw === undefined) continue;
    const value = String(raw).trim();
    if (!value) continue;
    if (looksLikeUuid(value)) continue;
    return value;
  }

  return null;
}

export function resolveProcessedByUserId(request = {}) {
  const candidates = [
    request.processed_by,
    request.processedByUserId,
    request.processedById,
  ];

  for (const raw of candidates) {
    if (raw === null || raw === undefined) continue;
    const value = String(raw).trim();
    if (looksLikeUuid(value)) return value;
  }

  if (typeof request.processedBy === 'string' && looksLikeUuid(request.processedBy)) {
    return request.processedBy.trim();
  }

  return null;
}

export async function dispatchStockRequestWebhook(request, event, processor = null) {
  const url = request.webhook_url || env.PSMS_WEBHOOK_URL;
  if (!url) return { skipped: true };

  const processedByName = processor?.displayName || resolveProcessedByDisplayName(request);
  const processedByUserId = processor?.userId || resolveProcessedByUserId(request);

  if (TERMINAL_EVENTS.has(event) && !processedByName) {
    const message = `Cannot send ${event} without processor display name`;
    console.error('[webhook]', message, {
      requestId: request.request_id || request.requestId,
      externalReference: request.external_reference || request.externalReference,
      processedByUserId,
    });
    throw new Error(message);
  }

  const payload = {
    event,
    requestId: request.request_id || request.requestId,
    externalReference: request.external_reference || request.externalReference,
    sourceSystem: request.source_system || request.sourceSystem,
    status: request.status,
    requestedBy: request.requested_by || request.requestedBy,
    reason: request.reason,
    categoryName: request.category_name || request.categoryName,
    gender: request.gender,
    type: request.item_type || request.type || request.itemType,
    size: request.size_label || request.size || request.sizeLabel,
    quantity: request.quantity,
    matchedSku: request.matched_sku || request.matchedSku,
    inventoryId: request.inventory_id || request.inventoryId,
    rejectionReason: request.rejection_reason || request.rejectionReason,
    failureReason: request.failure_reason || request.failureReason,
    processedAt: request.processed_at || request.processedAt,
    timestamp: new Date().toISOString(),
  };

  // Fulfill + reject: always send human-readable name fields (never UUID, never omit)
  if (TERMINAL_EVENTS.has(event)) {
    payload.processedBy = processedByName;
    payload.approvedBy = processedByName;
    payload.processedByName = processedByName;
    payload.processedByUserId = processedByUserId || null;
    if (event === 'stock_request.rejected') {
      payload.rejectedBy = processedByName;
    }
  }

  if (env.NODE_ENV !== 'production') {
    console.log('[webhook] POST', url, JSON.stringify({
      event: payload.event,
      externalReference: payload.externalReference,
      status: payload.status,
      processedBy: payload.processedBy,
      rejectedBy: payload.rejectedBy,
      processedByUserId: payload.processedByUserId,
    }));
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(env.PSMS_INTEGRATION_KEY && { 'X-Integration-Key': env.PSMS_INTEGRATION_KEY }),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Webhook failed (${response.status}): ${text.slice(0, 200)}`);
  }

  return { delivered: true, status: response.status, processedBy: processedByName, processedByUserId };
}
