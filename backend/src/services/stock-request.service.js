import { randomUUID } from 'node:crypto';
import { pool, withTransaction } from '../database/pool.js';
import { AppError, camelize } from '../utils/api.js';
import * as inventory from './inventory.service.js';
import { resolveInventoryItem } from './inventory-resolver.service.js';
import {
  dispatchStockRequestWebhook,
  dispatchStockReturnWebhook,
  isCmsBranchReturn,
  looksLikeUuid,
  processorFromAdmin,
  resolveProcessedByDisplayName,
  resolveProcessedByUserId,
} from './webhook.service.js';

export const requestSelect = `SELECT sr.*,
    i.item_name,
    i.stocks AS current_stocks,
    i.internal_selling_price,
    i.price AS catalog_price,
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

/** Tool Kit / Bundle (LEARNING_KIT) parents use computed availability, not stored parent qty. */
async function enrichStockRequestAvailability(rows, db = pool) {
  const enriched = [];
  for (const row of rows) {
    const inventoryId = row.inventory_id || row.inventoryId;
    if (!inventoryId) {
      enriched.push(row);
      continue;
    }

    const meta = await db.query(
      `SELECT i.inventory_id, i.stocks, c.category_name, c.category_kind, c.has_child_skus
       FROM inventory i
       JOIN categories c ON c.category_id = i.category_id
       WHERE i.inventory_id = $1`,
      [inventoryId],
    );
    if (!meta.rowCount) {
      enriched.push(row);
      continue;
    }

    const item = camelize(meta.rows[0]);
    if (!inventory.isVirtualKitCategory(item)) {
      enriched.push(row);
      continue;
    }

    const bom = await inventory.listBundleComponents(inventoryId, db);
    const available = bom.length ? await inventory.computeAvailableKits(bom, db) : 0;
    enriched.push({ ...row, current_stocks: available });
  }
  return enriched;
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
    if (isCmsBranchReturn(request)) {
      return { skipped: true, reason: 'CMS_BRANCH_RETURN' };
    }
    const result = await dispatchStockRequestWebhook(request, event, processor);
    if (result?.skipped) {
      if (result.reason === 'CMS_BRANCH_RETURN') return result;
      await recordWebhookAttempt(
        request.request_id,
        'SKIPPED',
        'No webhookUrl on request and PSMS_WEBHOOK_URL is not configured',
      );
      console.warn(
        'Stock request webhook skipped (no URL)',
        request.request_id,
        request.external_reference || request.externalReference,
      );
      return result;
    }
    await recordWebhookAttempt(request.request_id, 'DELIVERED');
    return result;
  } catch (error) {
    await recordWebhookAttempt(request.request_id, 'FAILED', error.message);
    console.error('Stock request webhook failed', request.request_id, error.message);
    return { failed: true, error: error.message };
  }
}

export async function createStockRequestsFromPsms(input) {
  const created = [];
  const sourceSystem = input.sourceSystem || 'PSMS';
  const batchReference = String(input.batchReference || '').trim()
    || `${sourceSystem}-BATCH-${randomUUID()}`;

  for (const [index, item] of input.items.entries()) {
    const externalReference = item.externalReference
      || `${batchReference}-${index + 1}`;

    const categoryLookup = await pool.query(
      `SELECT category_id, category_name, category_kind, has_child_skus
       FROM categories
       WHERE LOWER(category_name) = LOWER($1) AND status = $2`,
      [item.categoryName, 'ACTIVE'],
    );
    const isLearningKit = inventory.isLearningKitCategory(categoryLookup.rows[0])
      || inventory.isLearningKitCategoryName(item.categoryName);
        const resolved = await resolveInventoryItem(pool, {
      categoryName: item.categoryName,
      gender: item.gender,
      type: item.type,
      size: item.size,
      itemName: item.itemName,
      sku: item.sku,
    });

    const result = await pool.query(
      `INSERT INTO stock_requests (
        source_system, external_reference, batch_reference, request_date, requested_by, branch_name, reason,
        category_name, gender, item_type, size_label, quantity, status,
        inventory_id, matched_sku, webhook_url
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'PENDING',$13,$14,$15)
      RETURNING *`,
      [
        sourceSystem,
        externalReference,
        batchReference,
        input.requestDate,
        input.requestedBy,
        input.branchName,
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
      if (!bom.length) {
        failureReason = 'Bundle has no bill of materials configured';
      } else if (!componentSpecs.length) {
        failureReason = 'Bundle requests must include component specs for every included category (uniform: gender/type/size; non-uniform: itemName)';
      } else {
        for (const slot of bom) {
          const matching = componentSpecs.some(
            (spec) => String(spec.categoryName || '').toLowerCase() === String(slot.categoryName || '').toLowerCase(),
          );
          if (!matching) {
            failureReason = `Bundle requires component specs for category "${slot.categoryName}"`;
            break;
          }
        }
        for (const spec of componentSpecs) {
          if (failureReason) break;
          const allowed = bom.some(
            (slot) => String(slot.categoryName || '').toLowerCase() === String(spec.categoryName || '').toLowerCase(),
          );
          if (!allowed) {
            failureReason = `Component category "${spec.categoryName}" is not part of this bundle`;
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

  const withAvailability = await enrichStockRequestAvailability(result.rows);
  const withComponents = await attachRequestComponents(withAvailability);
  return { data: withComponents.map(shapeStockRequest), total: Number(count.rows[0].count) };
}

export async function getStockRequest(id) {
  const row = await enrichProcessorIdentity(await loadRequestRow(id));
  const [withAvailability] = await enrichStockRequestAvailability([row]);
  const [withComponents] = await attachRequestComponents([withAvailability]);
  return shapeStockRequest(withComponents);
}

export async function loadStockRequestRowsByIds(ids, db = pool) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))];
  if (!uniqueIds.length) return [];
  const result = await db.query(
    `${requestSelect} WHERE sr.request_id = ANY($1::uuid[])`,
    [uniqueIds],
  );
  const withAvailability = await enrichStockRequestAvailability(result.rows, db);
  const withComponents = await attachRequestComponents(withAvailability, db);
  return withComponents.map(shapeStockRequest);
}

async function restockStockRequestLine(db, current, adminId, notes) {
  if (!current.inventory_id) {
    throw new AppError(422, 'ITEM_NOT_MATCHED', 'Cannot restock a request with no matched inventory item');
  }

  const components = await listRequestComponents(current.request_id, db);
  const parentMeta = await inventory.getInventory(current.inventory_id, db);
  const isLearningKitReturn = components.length > 0;
  const isToolKitReturn = inventory.isToolKitCategory(parentMeta);
  const remarks = notes
    || `Reusable return for ${current.external_reference || current.request_id}`;
  let movementId = null;

  if (isLearningKitReturn) {
    for (const spec of components) {
      if (!spec.inventoryId) continue;
      const componentMeta = await inventory.getInventory(spec.inventoryId, db).catch(() => null);
      const movementInput = {
        movementType: 'RETURN',
        quantity: Number(spec.quantity) || current.quantity,
        referenceNumber: current.external_reference || current.request_id,
        remarks,
      };
      const movement = componentMeta && inventory.isToolKitCategory(componentMeta)
        ? await inventory.createBundleAwareMovement(spec.inventoryId, movementInput, adminId, db, {})
        : await inventory.createMovement(spec.inventoryId, movementInput, adminId, db);
      movementId = movement?.movementId || movement?.movement_id || movementId;
    }
  } else if (isToolKitReturn) {
    const movement = await inventory.createBundleAwareMovement(
      current.inventory_id,
      {
        movementType: 'RETURN',
        quantity: current.quantity,
        referenceNumber: current.external_reference || current.request_id,
        remarks,
      },
      adminId,
      db,
      {},
    );
    movementId = movement?.movementId || movement?.movement_id || null;
  } else {
    const movement = await inventory.createMovement(
      current.inventory_id,
      {
        movementType: 'RETURN',
        quantity: current.quantity,
        referenceNumber: current.external_reference || current.request_id,
        remarks,
      },
      adminId,
      db,
    );
    movementId = movement?.movementId || movement?.movement_id || null;
  }

  return movementId;
}

/** Deduct warehouse stock and mark SHIPPED inside an open transaction. */
export async function shipStockRequestInDb(db, id, adminId) {
  const locked = await db.query('SELECT * FROM stock_requests WHERE request_id = $1 FOR UPDATE', [id]);
  if (!locked.rowCount) throw new AppError(404, 'REQUEST_NOT_FOUND', 'Stock request was not found');

  const current = locked.rows[0];
  if (String(current.request_kind || '').toUpperCase() === 'RETURN') {
    throw new AppError(409, 'INVALID_STATUS_TRANSITION', 'Branch return lines cannot be shipped');
  }
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
      itemName: current.item_name,
    });
    if (resolved.error) throw new AppError(422, 'ITEM_NOT_MATCHED', resolved.error);
    inventoryId = resolved.item.inventory_id;
    matchedSku = resolved.item.sku;
  }

  const itemMeta = await db.query(
    `SELECT i.stocks, c.category_name, c.category_kind, c.has_child_skus
     FROM inventory i
     JOIN categories c ON c.category_id = i.category_id
     WHERE i.inventory_id = $1
     FOR UPDATE OF i`,
    [inventoryId],
  );
  if (!itemMeta.rowCount) throw new AppError(404, 'ITEM_NOT_FOUND', 'Matched inventory item was not found');

  const isLearningKit = inventory.isLearningKitCategory(itemMeta.rows[0]);
  const isToolKit = inventory.isToolKitCategory(itemMeta.rows[0]);
  const isKit = isLearningKit || isToolKit;
  const bom = isKit ? await inventory.listBundleComponents(inventoryId, db) : [];
  const requestComponents = isLearningKit ? await listRequestComponents(id, db) : [];
  const resolvedComponents = [];

  if (isLearningKit) {
    if (!bom.length) {
      throw new AppError(422, 'KIT_BOM_INCOMPLETE', 'Bundle has no bill of materials configured');
    }

    for (const slot of bom) {
      const matching = requestComponents.filter(
        (row) => String(row.categoryName || '').toLowerCase() === String(slot.categoryName || '').toLowerCase(),
      );
      if (!matching.length) {
        throw new AppError(
          422,
          'KIT_COMPONENT_REQUIRED',
          `Bundle requires component specs for category "${slot.categoryName}" (provided by the requesting system)`,
        );
      }
    }

    for (const spec of requestComponents) {
      const allowed = bom.some(
        (slot) => String(slot.categoryName || '').toLowerCase() === String(spec.categoryName || '').toLowerCase(),
      );
      if (!allowed) {
        throw new AppError(422, 'KIT_COMPONENT_INVALID', `Component category "${spec.categoryName}" is not part of this bundle`);
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

    const available = await inventory.computeAvailableKits(bom, db);
    if (available < current.quantity) {
      throw new AppError(409, 'INSUFFICIENT_STOCK', `Only ${available} kit(s) can be assembled from current category stock`);
    }
  } else if (isToolKit) {
    if (!bom.length || !bom.every((row) => row.isPinned)) {
      throw new AppError(422, 'KIT_BOM_INCOMPLETE', 'Tool Kit has no pinned raw items configured');
    }
    const available = await inventory.computeAvailableKits(bom, db);
    if (available < current.quantity) {
      throw new AppError(409, 'INSUFFICIENT_STOCK', `Only ${available} Tool Kit(s) can be assembled from raw item stock`);
    }
  } else if (itemMeta.rows[0].stocks < current.quantity) {
    throw new AppError(409, 'INSUFFICIENT_STOCK', `Only ${itemMeta.rows[0].stocks} unit(s) are available`);
  }

  await db.query(
    `UPDATE stock_requests
     SET inventory_id = $1, matched_sku = $2, processed_by = $3, processed_at = NOW(), updated_at = NOW()
     WHERE request_id = $4`,
    [inventoryId, matchedSku, adminId, id],
  );

  const movement = await inventory.createBundleAwareMovement(
    inventoryId,
    {
      movementType: 'RELEASED',
      quantity: current.quantity,
      referenceNumber: current.external_reference || current.request_id,
      remarks: `${current.source_system} shipped to branch for ${current.requested_by}: ${current.reason}`,
    },
    adminId,
    db,
    isLearningKit ? { resolvedComponents } : {},
  );

  const primaryMovement = movement.primary || movement;
  const firstComponent = (movement.components || [])[0];
  const movementId = primaryMovement.movementId
    || primaryMovement.movement_id
    || firstComponent?.movementId
    || firstComponent?.movement_id
    || null;

  await db.query(
    `UPDATE stock_requests
     SET status = 'SHIPPED', movement_id = $1, updated_at = NOW()
     WHERE request_id = $2`,
    [movementId, id],
  );

  return current;
}

export async function finalizeShippedRequest(id, admin) {
  const adminId = typeof admin === 'object' ? admin.user_id : admin;
  const processor = typeof admin === 'object' ? processorFromAdmin(admin) : null;
  const enriched = await enrichProcessorIdentity(await loadRequestRow(id), adminId);
  const [withComponents] = await attachRequestComponents([enriched]);
  const resolvedProcessor = processor?.displayName
    ? processor
    : processorFromAdmin({ user_id: adminId, full_name: enriched.processed_by_name, email: enriched.processed_by_email });
  await notify(withComponents, 'stock_request.shipped', resolvedProcessor);
  return shapeStockRequest(withComponents);
}

export async function shipStockRequest(id, admin) {
  const adminId = typeof admin === 'object' ? admin.user_id : admin;
  await withTransaction(async (db) => {
    await shipStockRequestInDb(db, id, adminId);
  });
  return finalizeShippedRequest(id, admin);
}

/** @deprecated Prefer shipStockRequest — kept for older clients during transition. */
export async function approveStockRequest(id, admin) {
  return shipStockRequest(id, admin);
}

export async function deliverStockRequest(id, options = {}) {
  const admin = options.admin || null;
  const adminId = typeof admin === 'object' && admin ? (admin.user_id || admin.userId || null) : admin;
  const confirmedBy = String(options.confirmedBy || '').trim() || null;
  const branchName = String(options.branchName || '').trim() || null;
  const notes = String(options.notes || '').trim() || null;

  const staffProcessor = typeof admin === 'object' && admin ? processorFromAdmin(admin) : null;
  const processor = staffProcessor?.displayName
    ? staffProcessor
    : (confirmedBy ? { userId: null, displayName: confirmedBy, email: null } : null);

  // Idempotent: CMS confirm-delivery may retry after RHET is already DELIVERED.
  const current = await getStockRequest(id);
  if (isCmsBranchReturn(current)) {
    throw new AppError(
      409,
      'INVALID_STATUS_TRANSITION',
      'Branch returns cannot be marked delivered',
    );
  }
  if (String(current.status || '').toUpperCase() === 'DELIVERED') {
    if (confirmedBy || notes || branchName) {
      await pool.query(
        `UPDATE stock_requests
         SET delivery_confirmed_by = COALESCE(delivery_confirmed_by, $1),
             delivery_notes = COALESCE(delivery_notes, $2),
             branch_name = CASE
               WHEN branch_name IS NULL OR branch_name = '' THEN COALESCE($3, branch_name)
               ELSE branch_name
             END,
             updated_at = NOW()
         WHERE request_id = $4 AND status = 'DELIVERED'`,
        [confirmedBy, notes, branchName, id],
      );
    }
    return getStockRequest(id);
  }

  const result = await pool.query(
    `UPDATE stock_requests
     SET status = 'DELIVERED',
         processed_by = COALESCE(processed_by, $1),
         processed_at = COALESCE(processed_at, NOW()),
         delivered_at = COALESCE(delivered_at, NOW()),
         delivery_confirmed_by = COALESCE($2, delivery_confirmed_by),
         delivery_notes = COALESCE($3, delivery_notes),
         branch_name = CASE
           WHEN branch_name IS NULL OR branch_name = '' THEN COALESCE($4, branch_name)
           ELSE branch_name
         END,
         updated_at = NOW()
     WHERE request_id = $5 AND status = 'SHIPPED'
     RETURNING *`,
    [adminId, confirmedBy, notes, branchName, id],
  );

  if (!result.rowCount) {
    const existing = await getStockRequest(id);
    // Race / retry: another caller already delivered — treat as success (no second webhook).
    if (String(existing.status || '').toUpperCase() === 'DELIVERED') {
      return existing;
    }
    throw new AppError(
      409,
      'INVALID_STATUS_TRANSITION',
      `Cannot mark delivered from ${String(existing.status || 'unknown').toLowerCase()} (must be shipped)`,
    );
  }

  const enriched = await enrichProcessorIdentity(await loadRequestRow(id), adminId);
  const [withComponents] = await attachRequestComponents([enriched]);
  const resolvedProcessor = processor?.displayName
    ? processor
    : processorFromAdmin({ user_id: adminId, full_name: enriched.processed_by_name, email: enriched.processed_by_email })
      || (confirmedBy ? { userId: null, displayName: confirmedBy, email: null } : null)
      || { userId: null, displayName: 'Branch Admin', email: null };

  // Branch stock credit happens on delivered (CMS). Legacy partners may still listen for fulfilled.
  await notify(withComponents, 'stock_request.delivered', resolvedProcessor);
  await notify(withComponents, 'stock_request.fulfilled', resolvedProcessor);
  return shapeStockRequest(withComponents);
}

export async function returnStockRequest(id, admin, options = {}) {
  const adminId = typeof admin === 'object' ? admin.user_id : admin;
  const processor = typeof admin === 'object' ? processorFromAdmin(admin) : null;
  const notes = typeof options === 'string' ? options : (options?.notes || null);
  let wasDelivered = false;
  let isBranchReturn = false;
  let reusable = true;

  await withTransaction(async (db) => {
    const locked = await db.query('SELECT * FROM stock_requests WHERE request_id = $1 FOR UPDATE', [id]);
    if (!locked.rowCount) throw new AppError(404, 'REQUEST_NOT_FOUND', 'Stock request was not found');

    const current = locked.rows[0];
    isBranchReturn = String(current.request_kind || '').toUpperCase() === 'RETURN';

    if (isBranchReturn) {
      reusable = options?.reusable !== false;
      if (current.status !== 'PENDING') {
        throw new AppError(
          409,
          'INVALID_STATUS_TRANSITION',
          `This branch return is already ${String(current.status || '').toLowerCase()}`,
        );
      }
    } else {
      reusable = true;
      if (current.status !== 'SHIPPED' && current.status !== 'DELIVERED') {
        throw new AppError(
          409,
          'INVALID_STATUS_TRANSITION',
          `Cannot return a request in ${current.status.toLowerCase()} status`,
        );
      }
      wasDelivered = current.status === 'DELIVERED';
    }

    let movementId = null;
    if (reusable) {
      movementId = await restockStockRequestLine(db, current, adminId, notes);
    }

    await db.query(
      `UPDATE stock_requests
       SET status = 'RETURNED',
           return_reusable = $1,
           return_notes = $2,
           movement_id = COALESCE($3, movement_id),
           processed_by = COALESCE(processed_by, $4),
           processed_at = COALESCE(processed_at, NOW()),
           updated_at = NOW()
       WHERE request_id = $5`,
      [reusable, notes || null, movementId, adminId, id],
    );
  });

  const enriched = await enrichProcessorIdentity(await loadRequestRow(id), adminId);
  const [withComponents] = await attachRequestComponents([enriched]);
  const resolvedProcessor = processor?.displayName
    ? processor
    : processorFromAdmin({ user_id: adminId, full_name: enriched.processed_by_name, email: enriched.processed_by_email });

  const shaped = shapeStockRequest(withComponents);
  shaped.wasDelivered = wasDelivered;

  if (isBranchReturn) {
    try {
      await dispatchStockReturnWebhook({
        ...withComponents,
        return_reusable: reusable,
        returnReusable: reusable,
        return_notes: notes,
        returnNotes: notes,
      }, 'stock_return.accepted', resolvedProcessor);
    } catch (error) {
      console.error('Stock return inspect webhook failed', id, error.message);
    }
  } else {
    await notify({
      ...withComponents,
      was_delivered: wasDelivered,
      wasDelivered,
      return_reusable: reusable,
      returnReusable: reusable,
      return_notes: notes,
      returnNotes: notes,
    }, 'stock_request.returned', resolvedProcessor);
  }

  return shaped;
}

export async function rejectStockRequest(id, admin, rejectionReason) {
  const adminId = typeof admin === 'object' ? admin.user_id : admin;
  const processor = typeof admin === 'object' ? processorFromAdmin(admin) : null;

  const existingKind = await pool.query(
    'SELECT request_kind, status FROM stock_requests WHERE request_id = $1',
    [id],
  );
  if (!existingKind.rowCount) throw new AppError(404, 'REQUEST_NOT_FOUND', 'Stock request was not found');
  if (String(existingKind.rows[0].request_kind || '').toUpperCase() === 'RETURN') {
    throw new AppError(
      409,
      'INVALID_STATUS_TRANSITION',
      'Branch returns cannot be rejected. Inspect the item as reusable or not reusable instead',
    );
  }

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
    `SELECT category_id, category_name, category_kind, category_type, has_child_skus
     FROM categories
     WHERE status = 'ACTIVE'
     ORDER BY category_name`,
  );

  const inventoryRows = await pool.query(
    `SELECT i.inventory_id, i.sku, i.item_name, i.stocks, i.status, i.variation,
            c.category_name, c.category_kind, c.has_child_skus
     FROM inventory i
     JOIN categories c ON c.category_id = i.category_id
     WHERE i.lifecycle_status = 'ACTIVE'
     ORDER BY c.category_name, i.item_name`,
  );

  const items = [];
  for (const row of camelize(inventoryRows.rows)) {
    if (inventory.isVirtualKitCategory(row)) {
      const full = await inventory.getInventory(row.inventoryId);
      items.push({
        inventoryId: full.inventoryId,
        sku: full.sku,
        itemName: full.itemName,
        stocks: full.stocks,
        status: full.status,
        variation: full.variation,
        categoryName: full.categoryName,
        categoryKind: full.categoryKind,
        stockMode: full.stockMode,
        bomComplete: full.bomComplete,
        components: (full.components || []).map((component) => ({
          categoryId: component.categoryId,
          categoryName: component.categoryName,
          inventoryId: component.inventoryId || component.componentInventoryId || null,
          sku: component.sku || null,
          itemName: component.itemName || null,
          quantity: component.quantity,
          isPinned: Boolean(component.isPinned),
          stocks: component.isPinned ? Number(component.stocks) || 0 : Number(component.categoryStocks) || 0,
        })),
      });
    } else {
      items.push(row);
    }
  }

  return {
    categories: camelize(categories.rows),
    items,
  };
}
