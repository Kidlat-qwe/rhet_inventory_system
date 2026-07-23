import { pool, withTransaction } from '../database/pool.js';
import { AppError, camelize } from '../utils/api.js';
import * as inventory from './inventory.service.js';
import { resolveInventoryItem } from './inventory-resolver.service.js';
import {
  dispatchStockRequestWebhook,
  looksLikeUuid,
  processorFromAdmin,
  resolveProcessedByDisplayName,
  resolveProcessedByUserId,
} from './webhook.service.js';

const requestSelect = `SELECT sr.*,
    i.item_name,
    i.stocks AS current_stocks,
    a.full_name AS processed_by_name,
    a.email AS processed_by_email
  FROM stock_requests sr
  LEFT JOIN inventory i ON i.inventory_id = sr.inventory_id
  LEFT JOIN users a ON a.user_id = sr.processed_by`;

function displayNameFromUser(user) {
  if (!user) return null;
  const fullName = String(user.full_name || '').trim();
  if (fullName && !looksLikeUuid(fullName)) return fullName;
  const email = String(user.email || '').trim();
  if (email && !looksLikeUuid(email)) return email;
  return null;
}

async function listRequestComponents(requestId, db = pool) {
  const result = await db.query(
    `SELECT * FROM stock_request_components WHERE request_id = $1 ORDER BY created_at ASC`,
    [requestId],
  );
  return camelize(result.rows);
}

async function attachRequestComponents(rows, db = pool) {
  if (!rows.length) return rows;
  const ids = rows.map((row) => row.request_id || row.requestId).filter(Boolean);
  if (!ids.length) return rows.map((row) => ({ ...row, components: [] }));
  const result = await db.query(
    `SELECT * FROM stock_request_components WHERE request_id = ANY($1::uuid[]) ORDER BY created_at ASC`,
    [ids],
  );
  const byRequest = new Map();
  for (const row of camelize(result.rows)) {
    const list = byRequest.get(row.requestId) || [];
    list.push(row);
    byRequest.set(row.requestId, list);
  }
  return rows.map((row) => {
    const id = row.request_id || row.requestId;
    return { ...row, components: byRequest.get(id) || [] };
  });
}

/** Shape DB row for API/webhook consumers: processedBy is always a display name. */
function shapeStockRequest(row) {
  const data = camelize(row);
  const processedByUserId = resolveProcessedByUserId(row) || resolveProcessedByUserId(data);
  let processedByName = resolveProcessedByDisplayName(row) || resolveProcessedByDisplayName(data);

  // Guard: never expose a UUID through name fields
  if (processedByName && looksLikeUuid(processedByName)) {
    processedByName = null;
  }

  return {
    ...data,
    components: data.components || row.components || [],
    processedByUserId,
    processedById: processedByUserId,
    processedBy: processedByName,
    approvedBy: processedByName,
    processedByName,
  };
}

async function loadRequestRow(id) {
  const result = await pool.query(`${requestSelect} WHERE sr.request_id = $1`, [id]);
  if (!result.rowCount) throw new AppError(404, 'REQUEST_NOT_FOUND', 'Stock request was not found');
  return result.rows[0];
}

/** Ensure fulfill/reject webhooks always carry a human display name when a processor exists. */
async function enrichProcessorIdentity(row, preferredUserId = null) {
  if (!row) return row;

  let displayName = resolveProcessedByDisplayName(row);
  let userId = resolveProcessedByUserId(row) || preferredUserId || null;

  if (displayName && !looksLikeUuid(displayName)) {
    return {
      ...row,
      processed_by_name: displayName,
      processed_by: userId || row.processed_by || null,
    };
  }

  if (!userId && row.processed_by && looksLikeUuid(String(row.processed_by))) {
    userId = String(row.processed_by);
  }

  if (userId) {
    const user = await pool.query(
      'SELECT user_id, full_name, email FROM users WHERE user_id = $1',
      [userId],
    );
    displayName = displayNameFromUser(user.rows[0]);
  }

  return {
    ...row,
    processed_by: userId || row.processed_by || null,
    processed_by_name: displayName || null,
    processed_by_email: row.processed_by_email || null,
  };
}

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

async function notify(request, event, processor = null) {
  try {
    await dispatchStockRequestWebhook(request, event, processor);
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

    const isLearningKit = inventory.isLearningKitCategoryName(item.categoryName);
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
    let failureReason = resolved.error || null;

    if (isLearningKit && !failureReason && row.inventory_id) {
      const componentSpecs = Array.isArray(item.components) ? item.components : [];
      const bom = await inventory.listBundleComponents(row.inventory_id);
      if (bom.length && !componentSpecs.length) {
        failureReason = 'Learning Kit requests must include component specs for every included category (uniform: gender/type/size; non-uniform: itemName)';
      } else {
        for (const slot of bom) {
          const matching = componentSpecs.some(
            (spec) => String(spec.categoryName || '').toLowerCase() === String(slot.categoryName || '').toLowerCase(),
          );
          if (!matching) {
            failureReason = `Learning Kit requires component specs for category "${slot.categoryName}"`;
            break;
          }
        }
        for (const spec of componentSpecs) {
          if (failureReason) break;
          const allowed = bom.some(
            (slot) => String(slot.categoryName || '').toLowerCase() === String(spec.categoryName || '').toLowerCase(),
          );
          if (!allowed) {
            failureReason = `Component category "${spec.categoryName}" is not part of this Learning Kit`;
            break;
          }
          const componentResolved = await resolveInventoryItem(pool, {
            categoryName: spec.categoryName,
            gender: spec.gender,
            type: spec.type,
            size: spec.size,
            itemName: spec.itemName,
            sku: spec.sku,
          });
          await pool.query(
            `INSERT INTO stock_request_components (
              request_id, category_name, gender, item_type, size_label, item_name,
              quantity, inventory_id, matched_sku, failure_reason
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
              row.request_id,
              spec.categoryName,
              spec.gender || null,
              spec.type || null,
              spec.size || null,
              spec.itemName || null,
              spec.quantity,
              componentResolved.item?.inventory_id || null,
              componentResolved.item?.sku || null,
              componentResolved.error || null,
            ],
          );
          if (componentResolved.error && !failureReason) {
            failureReason = componentResolved.error;
          }
        }
      }
    } else if (Array.isArray(item.components) && item.components.length) {
      // Ignore components on non-kit items but store nothing.
    }

    if (failureReason) {
      await pool.query(
        `UPDATE stock_requests
         SET failure_reason = $1, updated_at = NOW()
         WHERE request_id = $2`,
        [failureReason, row.request_id],
      );
      row.failure_reason = failureReason;
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

  const withComponents = await attachRequestComponents(result.rows);
  return { data: withComponents.map(shapeStockRequest), total: Number(count.rows[0].count) };
}

export async function getStockRequest(id) {
  const [withComponents] = await attachRequestComponents([await enrichProcessorIdentity(await loadRequestRow(id))]);
  return shapeStockRequest(withComponents);
}

export async function approveStockRequest(id, admin) {
  const adminId = typeof admin === 'object' ? admin.user_id : admin;
  const processor = typeof admin === 'object' ? processorFromAdmin(admin) : null;

  await withTransaction(async (db) => {
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

    const bom = await inventory.listBundleComponents(inventoryId, db);
    const requestComponents = await listRequestComponents(id, db);
    const resolvedComponents = [];

    if (bom.length) {
      for (const slot of bom) {
        const matching = requestComponents.filter(
          (row) => String(row.categoryName || '').toLowerCase() === String(slot.categoryName || '').toLowerCase(),
        );
        if (!matching.length) {
          throw new AppError(
            422,
            'KIT_COMPONENT_REQUIRED',
            `Learning Kit requires component specs for category "${slot.categoryName}"`,
          );
        }
      }

      for (const spec of requestComponents) {
        const allowed = bom.some(
          (slot) => String(slot.categoryName || '').toLowerCase() === String(spec.categoryName || '').toLowerCase(),
        );
        if (!allowed) {
          throw new AppError(422, 'KIT_COMPONENT_INVALID', `Component category "${spec.categoryName}" is not part of this Learning Kit`);
        }

        let componentId = spec.inventoryId;
        let componentSku = spec.matchedSku;
        if (!componentId) {
          const resolved = await resolveInventoryItem(db, {
            categoryName: spec.categoryName,
            gender: spec.gender,
            type: spec.itemType,
            size: spec.sizeLabel,
            itemName: spec.itemName,
          });
          if (resolved.error) throw new AppError(422, 'ITEM_NOT_MATCHED', resolved.error);
          componentId = resolved.item.inventory_id;
          componentSku = resolved.item.sku;
          await db.query(
            `UPDATE stock_request_components
             SET inventory_id = $1, matched_sku = $2, failure_reason = NULL
             WHERE request_component_id = $3`,
            [componentId, componentSku, spec.requestComponentId],
          );
        }

        resolvedComponents.push({
          inventoryId: componentId,
          quantity: Number(spec.quantity),
          sku: componentSku,
        });
      }
    }

    await db.query(
      `UPDATE stock_requests
       SET status = 'APPROVED', inventory_id = $1, matched_sku = $2, processed_by = $3, processed_at = NOW(), updated_at = NOW()
       WHERE request_id = $4`,
      [inventoryId, matchedSku, adminId, id],
    );

    const movement = await inventory.createBundleAwareMovement(
      inventoryId,
      {
        movementType: 'RELEASED',
        quantity: current.quantity,
        referenceNumber: current.external_reference || current.request_id,
        remarks: `${current.source_system} request by ${current.requested_by}: ${current.reason}`,
      },
      adminId,
      db,
      { resolvedComponents },
    );

    const primaryMovement = movement.primary || movement;
    await db.query(
      `UPDATE stock_requests
       SET status = 'FULFILLED', movement_id = $1, updated_at = NOW()
       WHERE request_id = $2`,
      [primaryMovement.movementId || primaryMovement.movement_id, id],
    );
  });

  const enriched = await enrichProcessorIdentity(await loadRequestRow(id), adminId);
  const [withComponents] = await attachRequestComponents([enriched]);
  const resolvedProcessor = processor?.displayName
    ? processor
    : processorFromAdmin({ user_id: adminId, full_name: enriched.processed_by_name, email: enriched.processed_by_email });
  await notify(withComponents, 'stock_request.fulfilled', resolvedProcessor);
  return shapeStockRequest(withComponents);
}

export async function rejectStockRequest(id, admin, rejectionReason) {
  const adminId = typeof admin === 'object' ? admin.user_id : admin;
  const processor = typeof admin === 'object' ? processorFromAdmin(admin) : null;

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

  const enriched = await enrichProcessorIdentity(await loadRequestRow(id), adminId);
  const resolvedProcessor = processor?.displayName
    ? processor
    : processorFromAdmin({ user_id: adminId, full_name: enriched.processed_by_name, email: enriched.processed_by_email });
  await notify(enriched, 'stock_request.rejected', resolvedProcessor);
  return shapeStockRequest(enriched);
}

export async function getStockRequestByReference(reference, sourceSystem = 'PSMS') {
  const result = await pool.query(
    `${requestSelect} WHERE sr.external_reference = $1 AND sr.source_system = $2`,
    [reference, sourceSystem],
  );
  if (!result.rowCount) throw new AppError(404, 'REQUEST_NOT_FOUND', 'Stock request was not found');
  return shapeStockRequest(result.rows[0]);
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
