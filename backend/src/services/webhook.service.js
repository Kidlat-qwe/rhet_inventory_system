import { env } from '../config/env.js';

export async function dispatchStockRequestWebhook(request, event) {
  const url = request.webhook_url || env.PSMS_WEBHOOK_URL;
  if (!url) return { skipped: true };

  const payload = {
    event,
    requestId: request.request_id,
    externalReference: request.external_reference,
    sourceSystem: request.source_system,
    status: request.status,
    requestedBy: request.requested_by,
    reason: request.reason,
    categoryName: request.category_name,
    gender: request.gender,
    type: request.item_type,
    size: request.size_label,
    quantity: request.quantity,
    matchedSku: request.matched_sku,
    inventoryId: request.inventory_id,
    rejectionReason: request.rejection_reason,
    failureReason: request.failure_reason,
    processedAt: request.processed_at,
    timestamp: new Date().toISOString(),
  };

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
