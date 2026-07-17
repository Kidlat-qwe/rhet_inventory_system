import { pool, withTransaction } from '../database/pool.js';
import { AppError, camelize } from '../utils/api.js';
import * as inventory from './inventory.service.js';
import { resolveInventoryItem } from './inventory-resolver.service.js';
import { dispatchStockRequestWebhook } from './webhook.service.js';

const requestSelect = `SELECT sr.*, i.item_name, i.stocks AS current_stocks, a.full_name AS processed_by_name
  FROM stock_requests sr
  LEFT JOIN inventory i ON i.inventory_id = sr.inventory_id
  LEFT JOIN users a ON a.user_id = sr.processed_by`;

async function recordWebhookAttempt(requestId, status, errorMessage) {
  await pool.query(
    `UPDATE stock_requests
     SET webhook_last_status = $1,
         webhook_last_attempt_at = NOW(),
         failure_reason = COALESCE($2, failure_reason),
         updated_at = NOW()
     WHERE request_id = $3`,
    [status, errorMessage || null, requestId],
  );
}

async function notify(request, event) {
  try {
    await dispatchStockRequestWebhook(request, event);
    await recordWebhookAttempt(request.request_id, 'DELIVERED');
  } catch (error) {
    await recordWebhookAttempt(request.request_id, 'FAILED', error.message);
    console.error('Stock request webhook failed', request.request_id, error.message);
  }
}

export async function createStockRequestsFromPsms(input) {
  const created = [];
  const sourceSystem = input.sourceSystem || 'PSMS';

  for (const [index, item] of input.items.entries()) {
    const externalReference = item.externalReference
      || `${input.batchReference || sourceSystem}-${Date.now()}-${index + 1}`;

    const resolved = await resolveInventoryItem(pool, {
      categoryName: item.categoryName,
      gender: item.gender,
      type: item.type,
      size: item.size,
      itemName: item.itemName,
    });

    const result = await pool.query(
      `INSERT INTO stock_requests (
        source_system, external_reference, request_date, requested_by, reason,
        category_name, gender, item_type, size_label, quantity, status,
        inventory_id, matched_sku, webhook_url
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PENDING',$11,$12,$13)
      RETURNING *`,
      [
        sourceSystem,
        externalReference,
        input.requestDate,
        input.requestedBy,
        input.reason,
        item.categoryName,
        item.gender || null,
        item.type || null,
        item.size || null,
        item.quantity,
        resolved.item?.inventory_id || null,
        resolved.item?.sku || null,
        input.webhookUrl || null,
      ],
    );

    const row = result.rows[0];
    if (resolved.error) {
      await pool.query(
        `UPDATE stock_requests
         SET failure_reason = $1, updated_at = NOW()
         WHERE request_id = $2`,
        [resolved.error, row.request_id],
      );
      row.failure_reason = resolved.error;
    }

    created.push(row);
    await notify(row, 'stock_request.created');
  }

  return camelize(created);
}

export async function listStockRequests(query) {
  const values = [];
  const where = [];
  const add = (value) => { values.push(value); return `$${values.length}`; };

  if (query.status) where.push(`sr.status = ${add(query.status)}`);
  if (query.sourceSystem) where.push(`sr.source_system = ${add(query.sourceSystem)}`);

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await pool.query(`SELECT COUNT(*) FROM stock_requests sr ${clause}`, values);
  const offset = (query.page - 1) * query.limit;
  values.push(query.limit, offset);

  const result = await pool.query(
    `${requestSelect} ${clause} ORDER BY sr.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );

  return { data: camelize(result.rows), total: Number(count.rows[0].count) };
}

export async function getStockRequest(id) {
  const result = await pool.query(`${requestSelect} WHERE sr.request_id = $1`, [id]);
  if (!result.rowCount) throw new AppError(404, 'REQUEST_NOT_FOUND', 'Stock request was not found');
  return camelize(result.rows[0]);
}

export async function approveStockRequest(id, adminId) {
  const request = await withTransaction(async (db) => {
    const locked = await db.query('SELECT * FROM stock_requests WHERE request_id = $1 FOR UPDATE', [id]);
    if (!locked.rowCount) throw new AppError(404, 'REQUEST_NOT_FOUND', 'Stock request was not found');

    const current = locked.rows[0];
    if (current.status !== 'PENDING') {
      throw new AppError(409, 'REQUEST_NOT_PENDING', `Request is already ${current.status.toLowerCase()}`);
    }

    let inventoryId = current.inventory_id;
    let matchedSku = current.matched_sku;

    if (!inventoryId) {
      const resolved = await resolveInventoryItem(db, {
        categoryName: current.category_name,
        gender: current.gender,
        type: current.item_type,
        size: current.size_label,
      });
      if (resolved.error) throw new AppError(422, 'ITEM_NOT_MATCHED', resolved.error);
      inventoryId = resolved.item.inventory_id;
      matchedSku = resolved.item.sku;
    }

    const stockCheck = await db.query('SELECT stocks FROM inventory WHERE inventory_id = $1 FOR UPDATE', [inventoryId]);
    if (!stockCheck.rowCount) throw new AppError(404, 'ITEM_NOT_FOUND', 'Matched inventory item was not found');
    if (stockCheck.rows[0].stocks < current.quantity) {
      throw new AppError(409, 'INSUFFICIENT_STOCK', `Only ${stockCheck.rows[0].stocks} unit(s) are available`);
    }

    await db.query(
      `UPDATE stock_requests
       SET status = 'APPROVED', inventory_id = $1, matched_sku = $2, processed_by = $3, processed_at = NOW(), updated_at = NOW()
       WHERE request_id = $4`,
      [inventoryId, matchedSku, adminId, id],
    );

    const movement = await inventory.createMovement(
      inventoryId,
      {
        movementType: 'RELEASED',
        quantity: current.quantity,
        referenceNumber: current.external_reference || current.request_id,
        remarks: `${current.source_system} request by ${current.requested_by}: ${current.reason}`,
      },
      adminId,
      db,
    );

    const fulfilled = await db.query(
      `UPDATE stock_requests
       SET status = 'FULFILLED', movement_id = $1, updated_at = NOW()
       WHERE request_id = $2
       RETURNING *`,
      [movement.movementId || movement.movement_id, id],
    );

    return fulfilled.rows[0];
  });

  await notify(request, 'stock_request.fulfilled');
  return camelize(await getStockRequest(id));
}

export async function rejectStockRequest(id, adminId, rejectionReason) {
  const result = await pool.query(
    `UPDATE stock_requests
     SET status = 'REJECTED',
         rejection_reason = $1,
         processed_by = $2,
         processed_at = NOW(),
         updated_at = NOW()
     WHERE request_id = $3 AND status = 'PENDING'
     RETURNING *`,
    [rejectionReason, adminId, id],
  );

  if (!result.rowCount) {
    const existing = await getStockRequest(id);
    throw new AppError(409, 'REQUEST_NOT_PENDING', `Request is already ${existing.status.toLowerCase()}`);
  }

  await notify(result.rows[0], 'stock_request.rejected');
  return getStockRequest(id);
}

export async function getStockRequestByReference(reference, sourceSystem = 'PSMS') {
  const result = await pool.query(
    `${requestSelect} WHERE sr.external_reference = $1 AND sr.source_system = $2`,
    [reference, sourceSystem],
  );
  if (!result.rowCount) throw new AppError(404, 'REQUEST_NOT_FOUND', 'Stock request was not found');
  return camelize(result.rows[0]);
}

export async function getAvailability(input) {
  const resolved = await resolveInventoryItem(pool, input);
  if (resolved.error) {
    return { available: false, message: resolved.error, stocks: 0 };
  }
  return {
    available: resolved.item.stocks > 0,
    stocks: resolved.item.stocks,
    status: resolved.item.status,
    sku: resolved.item.sku,
    itemName: resolved.item.item_name,
    variation: resolved.item.variation,
    inventoryId: resolved.item.inventory_id,
  };
}

export async function getIntegrationCatalog() {
  const categories = await pool.query(
    `SELECT category_id, category_name FROM categories WHERE status = 'ACTIVE' ORDER BY category_name`,
  );

  const inventoryRows = await pool.query(
    `SELECT i.inventory_id, i.sku, i.item_name, i.stocks, i.status, i.variation, c.category_name
     FROM inventory i
     JOIN categories c ON c.category_id = i.category_id
     WHERE i.lifecycle_status = 'ACTIVE'
     ORDER BY c.category_name, i.item_name`,
  );

  return camelize({
    categories: categories.rows,
    items: inventoryRows.rows,
  });
}
