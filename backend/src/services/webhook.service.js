import { env } from '../config/env.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TERMINAL_EVENTS = new Set([
  'stock_request.shipped',
  'stock_request.delivered',
  'stock_request.returned',
  'stock_request.rejected',
  // Legacy alias — some partners may still expect fulfilled during transition.
  'stock_request.fulfilled',
]);

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
    request.delivery_confirmed_by,
    request.deliveryConfirmedBy,
    request.confirmedBy,
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

/**
 * CMS inbound Return Stock (PSMS-RET-*). Do not use stock_request.* events —
 * CMS return rows must not match outbound request webhooks.
 */
export async function dispatchStockReturnWebhook(request, event = 'stock_return.accepted', processor = null) {
  const url = request.webhook_url || request.webhookUrl || env.PSMS_WEBHOOK_URL;
  if (!url) return { skipped: true };

  const processedByName = processor?.displayName
    || request.requestedBy
    || request.requested_by
    || 'Branch Admin';

  const payload = {
    event,
    requestId: request.request_id || request.requestId,
    requestKind: request.request_kind || request.requestKind || 'RETURN',
    externalReference: request.external_reference || request.externalReference,
    batchReference: request.batch_reference || request.batchReference || null,
    sourceSystem: request.source_system || request.sourceSystem,
    status: request.status || 'RETURNED',
    requestedBy: request.requested_by || request.requestedBy,
    branchName: request.branch_name || request.branchName || null,
    reason: request.reason,
    categoryName: request.category_name || request.categoryName,
    gender: request.gender,
    type: request.item_type || request.type || request.itemType,
    size: request.size_label || request.size || request.sizeLabel,
    quantity: request.quantity,
    matchedSku: request.matched_sku || request.matchedSku,
    inventoryId: request.inventory_id || request.inventoryId,
    processedBy: processedByName,
    processedByName: processedByName,
    timestamp: new Date().toISOString(),
  };

  if (env.NODE_ENV !== 'production') {
    console.log('[webhook] POST', url, JSON.stringify({
      event: payload.event,
      externalReference: payload.externalReference,
      status: payload.status,
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

  return { delivered: true, status: response.status };
}

export async function dispatchStockRequestWebhook(request, event, processor = null) {
  const url = request.webhook_url || env.PSMS_WEBHOOK_URL;
  if (!url) return { skipped: true };

  const processedByName = processor?.displayName || resolveProcessedByDisplayName(request);
  const processedByUserId = processor?.userId || resolveProcessedByUserId(request);

  if (TERMINAL_EVENTS.has(event) && !processedByName) {
    // Last-resort label so CMS still receives fulfill/reject (never a UUID).
    processedByName = 'Inventory Admin';
    console.warn('[webhook] Using fallback processedBy display name', {
      requestId: request.request_id || request.requestId,
      externalReference: request.external_reference || request.externalReference,
      processedByUserId,
    });
  }

  const payload = {
    event,
    requestId: request.request_id || request.requestId,
    externalReference: request.external_reference || request.externalReference,
    sourceSystem: request.source_system || request.sourceSystem,
    status: request.status,
    requestedBy: request.requested_by || request.requestedBy,
    branchName: request.branch_name || request.branchName || null,
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
    confirmedBy: request.delivery_confirmed_by || request.deliveryConfirmedBy || request.confirmedBy || null,
    deliveryNotes: request.delivery_notes || request.deliveryNotes || request.notes || null,
    deliveredAt: request.delivered_at || request.deliveredAt || null,
    wasDelivered: request.was_delivered ?? request.wasDelivered ?? null,
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
    if (event === 'stock_request.shipped') {
      payload.shippedBy = processedByName;
    }
    if (event === 'stock_request.delivered') {
      payload.deliveredBy = processedByName;
    }
    if (event === 'stock_request.returned') {
      payload.returnedBy = processedByName;
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

const MANUAL_ORDER_EVENTS = new Set([
  'manual_order.created',
  'manual_order.shipped',
  'manual_order.delivered',
  'manual_order.error',
]);

/**
 * Notify Scoring (or other partner) when a Manual Order status changes.
 * Uses order.webhook_url only (no PSMS fallback — different product).
 */
export async function dispatchManualOrderWebhook(order, event, processor = null) {
  const url = order.webhook_url || order.webhookUrl;
  if (!url) return { skipped: true };
  if (!MANUAL_ORDER_EVENTS.has(event)) {
    throw new Error(`Unknown manual order webhook event: ${event}`);
  }

  let processedByName = processor?.displayName || resolveProcessedByDisplayName(order);
  const processedByUserId = processor?.userId || resolveProcessedByUserId(order);

  if ((event === 'manual_order.shipped' || event === 'manual_order.delivered' || event === 'manual_order.error')
    && !processedByName) {
    processedByName = 'Inventory Admin';
  }

  const payload = {
    event,
    orderId: order.order_id || order.orderId,
    orderNumber: order.order_number || order.orderNumber,
    externalReference: order.external_reference || order.externalReference,
    sourceSystem: order.source_system || order.sourceSystem,
    fulfillmentStatus: order.fulfillment_status || order.fulfillmentStatus,
    customerName: order.customer_name || order.customerName,
    customerPhone: order.customer_phone || order.customerPhone,
    shippingAddress: order.shipping_address || order.shippingAddress,
    courierName: order.courier_name || order.courierName,
    trackingNumber: order.tracking_number || order.trackingNumber,
    studentName: order.student_name || order.studentName,
    programName: order.program_name || order.programName,
    paymentDate: order.payment_date || order.paymentDate,
    notes: order.notes,
    shippedAt: order.shipped_at || order.shippedAt,
    processedBy: processedByName || null,
    processedByName: processedByName || null,
    processedByUserId: processedByUserId || null,
    timestamp: new Date().toISOString(),
  };

  if (env.NODE_ENV !== 'production') {
    console.log('[webhook] POST', url, JSON.stringify({
      event: payload.event,
      externalReference: payload.externalReference,
      fulfillmentStatus: payload.fulfillmentStatus,
      processedBy: payload.processedBy,
    }));
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Manual order webhook failed (${response.status}): ${text.slice(0, 200)}`);
  }

  return { delivered: true, status: response.status, processedBy: processedByName, processedByUserId };
}
