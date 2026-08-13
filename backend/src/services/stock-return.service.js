import { randomUUID } from 'node:crypto';
import { pool, withTransaction } from '../database/pool.js';
import { AppError } from '../utils/api.js';
import * as inventory from './inventory.service.js';
import { resolveInventoryItem } from './inventory-resolver.service.js';
import { dispatchStockReturnWebhook } from './webhook.service.js';
import { loadStockRequestRowsByIds } from './stock-request.service.js';

async function resolveIntegrationActorId(db) {
  const result = await db.query(
    `SELECT user_id
     FROM users
     WHERE status = 'ACTIVE'
     ORDER BY CASE WHEN role = 'ADMIN' THEN 0 ELSE 1 END, created_at ASC
     LIMIT 1`,
  );
  if (!result.rowCount) {
    throw new AppError(
      500,
      'NO_SYSTEM_USER',
      'Cannot record a branch return: no active RHET user exists for the stock movement',
    );
  }
  return result.rows[0].user_id;
}

function itemRefs(items, batchReference) {
  return items.map((item, index) => String(item.externalReference || '').trim()
    || `${batchReference}-${index + 1}`);
}

/**
 * CMS Return Stock → restock RHET warehouse immediately.
 * One POST = one cart (batchReference). All-or-nothing.
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
    const actorId = await resolveIntegrationActorId(db);

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
          inventory_id, matched_sku, webhook_url, processed_at
        ) VALUES ($1,$2,$3,'RETURN',$4,$5,$6,$7,$8,$9,$10,$11,$12,'RETURNED',$13,$14,$15,NOW())
        RETURNING *`,
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
      const row = inserted.rows[0];

      const movement = await inventory.createMovement(
        resolved.item.inventory_id,
        {
          movementType: 'RETURN',
          quantity: item.quantity,
          referenceNumber: externalReference,
          remarks: `${sourceSystem} branch return from ${input.requestedBy} (${input.branchName}): ${input.reason}`,
        },
        actorId,
        db,
      );
      const movementId = movement.movementId || movement.movement_id || null;
      await db.query(
        `UPDATE stock_requests
         SET movement_id = $1, updated_at = NOW()
         WHERE request_id = $2`,
        [movementId, row.request_id],
      );
      createdIds.push(row.request_id);
    }
  });

  const data = await loadStockRequestRowsByIds(createdIds);
  for (const row of data) {
    try {
      await dispatchStockReturnWebhook(row, 'stock_return.accepted', {
        displayName: row.requestedBy || row.requested_by || 'Branch Admin',
      });
    } catch (error) {
      console.error('Stock return webhook failed', row.requestId || row.request_id, error.message);
    }
  }
  return { created: true, data };
}
