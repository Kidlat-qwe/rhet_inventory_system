import { randomUUID } from 'node:crypto';
import { pool, withTransaction } from '../database/pool.js';
import { AppError } from '../utils/api.js';
import * as inventory from './inventory.service.js';
import { resolveInventoryItem } from './inventory-resolver.service.js';
import { dispatchStockReturnWebhook } from './webhook.service.js';
import { loadStockRequestRowsByIds } from './stock-request.service.js';

function itemRefs(items, batchReference) {
  return items.map((item, index) => String(item.externalReference || '').trim()
    || `${batchReference}-${index + 1}`);
}

/**
 * CMS Return Stock → Pending inspection on RHET (no warehouse movement yet).
 * Staff later marks reusable / not reusable; only reusable restocks.
 * One POST = one cart (batchReference). All-or-nothing match.
 * Idempotent on (sourceSystem, externalReference) when every line already exists as RETURN.
 */
export async function createStockReturnsFromPsms(input) {
  const sourceSystem = input.sourceSystem || 'PSMS';
  const batchReference = String(input.batchReference || '').trim()
    || `${sourceSystem}-RET-${randomUUID()}`;
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) {
    throw new AppError(400, 'NO_ITEMS', 'Return must include at least one item');
  }

  const refs = itemRefs(items, batchReference);
  const existing = await pool.query(
    `SELECT request_id, request_kind, external_reference
     FROM stock_requests
     WHERE source_system = $1 AND external_reference = ANY($2::text[])`,
    [sourceSystem, refs],
  );

  if (existing.rowCount === items.length) {
    if (existing.rows.every((row) => String(row.request_kind || '').toUpperCase() === 'RETURN')) {
      return {
        created: false,
        data: await loadStockRequestRowsByIds(existing.rows.map((row) => row.request_id)),
      };
    }
    throw new AppError(
      409,
      'REFERENCE_CONFLICT',
      'One or more external references already exist as stock requests (not branch returns)',
    );
  }
  if (existing.rowCount > 0) {
    throw new AppError(
      409,
      'PARTIAL_REFERENCE_CONFLICT',
      'Some return lines were already submitted. Resubmit the original cart or use new PSMS-RET references',
    );
  }

  const createdIds = [];

  await withTransaction(async (db) => {
    for (const [index, item] of items.entries()) {
      const externalReference = refs[index];
      const resolved = await resolveInventoryItem(db, {
        categoryName: item.categoryName,
        gender: item.gender,
        type: item.type,
        size: item.size,
        itemName: item.itemName,
        sku: item.sku,
      });
      if (resolved.error) {
        throw new AppError(422, 'ITEM_NOT_MATCHED', resolved.error);
      }

      const meta = await db.query(
        `SELECT c.category_name, c.category_kind
         FROM inventory i
         JOIN categories c ON c.category_id = i.category_id
         WHERE i.inventory_id = $1`,
        [resolved.item.inventory_id],
      );
      if (inventory.isLearningKitCategory(meta.rows[0]) || inventory.isToolKitCategory(meta.rows[0])) {
        throw new AppError(
          422,
          'KIT_RETURN_UNSUPPORTED',
          `Learning Kit / Tool Kit returns are not supported. Return the concrete component items instead (${item.categoryName})`,
        );
      }

      const inserted = await db.query(
        `INSERT INTO stock_requests (
          source_system, external_reference, batch_reference, request_kind, request_date,
          requested_by, branch_name, reason,
          category_name, gender, item_type, size_label, quantity, status,
          inventory_id, matched_sku, webhook_url
        ) VALUES ($1,$2,$3,'RETURN',$4,$5,$6,$7,$8,$9,$10,$11,$12,'PENDING',$13,$14,$15)
        RETURNING request_id`,
        [
          sourceSystem,
          externalReference,
          batchReference,
          input.requestDate || new Date(),
          input.requestedBy,
          input.branchName,
          input.reason,
          item.categoryName,
          item.gender || null,
          item.type || null,
          item.size || null,
          item.quantity,
          resolved.item.inventory_id,
          resolved.item.sku || null,
          input.webhookUrl || null,
        ],
      );
      createdIds.push(inserted.rows[0].request_id);
    }
  });

  const data = await loadStockRequestRowsByIds(createdIds);
  for (const row of data) {
    try {
      await dispatchStockReturnWebhook(row, 'stock_return.received', {
        displayName: row.requestedBy || row.requested_by || 'Branch Admin',
      });
    } catch (error) {
      console.error('Stock return webhook failed', row.requestId || row.request_id, error.message);
    }
  }
  return { created: true, data };
}
