import { parse } from 'csv-parse/sync';
import { pool, withTransaction } from '../database/pool.js';
import { AppError, camelize } from '../utils/api.js';
import * as inventory from './inventory.service.js';

export const DEFAULT_CHANNEL = 'SHOPEE';

export const SHOPEE_CSV_COLUMNS = {
  orderId: ['Order ID', 'Order SN', 'ordersn', 'order id'],
  buyerName: ['Username (Buyer)', 'Buyer Username', 'buyer username', 'buyer'],
  orderDate: ['Order Creation Date', 'Create Time', 'order creation date', 'order time'],
  sku: ['SKU Reference No.', 'SKU', 'sku reference no.', 'sku id'],
  productName: ['Product Name', 'product name', 'item name'],
  variation: ['Variation Name', 'variation name', 'model name'],
  quantity: ['Quantity', 'quantity', 'qty'],
  unitPrice: ['Deal Price', 'Original Price', 'deal price', 'unit price'],
  totalAmount: ['Order Total', 'Total Amount', 'order total', 'total price'],
};

const orderSelect = `SELECT o.*,
    u.full_name AS imported_by_name,
    (SELECT COUNT(*)::int FROM online_order_items oi WHERE oi.order_id = o.order_id) AS item_count,
    (SELECT COUNT(*)::int FROM online_order_items oi WHERE oi.order_id = o.order_id AND oi.line_status IN ('UNMATCHED', 'OVERSOLD')) AS attention_count
  FROM online_orders o
  LEFT JOIN users u ON u.user_id = o.imported_by`;

const itemSelect = `SELECT oi.*,
    i.item_name AS matched_item_name,
    i.stocks AS current_stocks
  FROM online_order_items oi
  LEFT JOIN inventory i ON i.inventory_id = oi.matched_inventory_id`;

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function pickColumn(row, aliases) {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias);
    const match = entries.find(([key]) => normalizeHeader(key) === normalizedAlias);
    if (match) return match[1];
  }
  return '';
}

function parseMoney(value) {
  if (value === null || value === undefined || value === '') return 0;
  const cleaned = String(value).replace(/[^0-9.-]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseQuantity(value) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeVariation(value) {
  const text = String(value || '').trim();
  return text || '';
}

// Matching status only. Orders no longer deduct RHET stock directly (see
// channel-allocation.service.js for the allocation-based stock model).
// MATCHED/DEDUCTED are treated the same for status purposes so historical
// Phase 1 orders (deducted via ONLINE_SALE) still compute correctly.
export function computeOrderStatus(lines = []) {
  if (!lines.length) return 'RECEIVED';
  if (lines.every((line) => line.line_status === 'CANCELLED' || line.lineStatus === 'CANCELLED')) {
    return 'CANCELLED';
  }
  const statuses = lines.map((line) => line.line_status || line.lineStatus);
  if (statuses.some((status) => status === 'UNMATCHED' || status === 'OVERSOLD')) {
    return 'NEEDS_ATTENTION';
  }
  if (statuses.every((status) => ['MATCHED', 'DEDUCTED', 'CANCELLED'].includes(status))) {
    return statuses.some((status) => status === 'MATCHED' || status === 'DEDUCTED') ? 'FULFILLED' : 'CANCELLED';
  }
  return 'NEEDS_ATTENTION';
}

export function decideLineOutcome({ hasMapping }) {
  if (!hasMapping) {
    return { lineStatus: 'UNMATCHED', failureReason: 'No SKU mapping found for this channel item' };
  }
  return { lineStatus: 'MATCHED', failureReason: null };
}

export const FULFILLMENT_TRANSITIONS = {
  PROCESSING: ['READY_TO_SHIP'],
  READY_TO_SHIP: ['SHIPPED'],
  SHIPPED: ['RECEIVED', 'RETURN'],
  RECEIVED: ['RETURN'],
  RETURN: [],
  RETURN_CONFIRMED: [],
};

export function parseShopeeCsv(csvText, channel = DEFAULT_CHANNEL) {
  const rows = parse(String(csvText || ''), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  });

  if (!rows.length) {
    throw new AppError(422, 'EMPTY_CSV', 'The uploaded CSV does not contain any rows');
  }

  const grouped = new Map();

  rows.forEach((row, index) => {
    const externalOrderId = String(pickColumn(row, SHOPEE_CSV_COLUMNS.orderId) || '').trim();
    if (!externalOrderId) {
      throw new AppError(422, 'INVALID_CSV_ROW', `Row ${index + 2} is missing an order ID column`);
    }

    const quantity = parseQuantity(pickColumn(row, SHOPEE_CSV_COLUMNS.quantity));
    if (!quantity) {
      throw new AppError(422, 'INVALID_CSV_ROW', `Row ${index + 2} has an invalid quantity`);
    }

    const item = {
      externalSku: String(pickColumn(row, SHOPEE_CSV_COLUMNS.sku) || `ROW-${index + 1}`).trim(),
      externalItemName: String(pickColumn(row, SHOPEE_CSV_COLUMNS.productName) || '').trim() || null,
      externalVariation: normalizeVariation(pickColumn(row, SHOPEE_CSV_COLUMNS.variation)),
      quantity,
      unitPrice: parseMoney(pickColumn(row, SHOPEE_CSV_COLUMNS.unitPrice)),
    };

    if (!grouped.has(externalOrderId)) {
      grouped.set(externalOrderId, {
        channel,
        externalOrderId,
        buyerName: String(pickColumn(row, SHOPEE_CSV_COLUMNS.buyerName) || '').trim() || null,
        orderPlacedAt: parseDate(pickColumn(row, SHOPEE_CSV_COLUMNS.orderDate)),
        totalAmount: parseMoney(pickColumn(row, SHOPEE_CSV_COLUMNS.totalAmount)),
        items: [item],
      });
      return;
    }

    const existing = grouped.get(externalOrderId);
    existing.items.push(item);
    if (!existing.totalAmount) {
      existing.totalAmount = parseMoney(pickColumn(row, SHOPEE_CSV_COLUMNS.totalAmount));
    }
  });

  return [...grouped.values()];
}

function shapeOrder(row, items = []) {
  return camelize({
    ...row,
    items: items.map((item) => camelize(item)),
  });
}

async function loadOrderItems(orderId, db = pool) {
  const result = await db.query(`${itemSelect} WHERE oi.order_id = $1 ORDER BY oi.created_at ASC`, [orderId]);
  return result.rows;
}

async function loadOrderRow(orderId, db = pool) {
  const result = await db.query(`${orderSelect} WHERE o.order_id = $1`, [orderId]);
  if (!result.rowCount) throw new AppError(404, 'ORDER_NOT_FOUND', 'Online order was not found');
  const items = await loadOrderItems(orderId, db);
  return shapeOrder(result.rows[0], items);
}

async function refreshOrderStatus(orderId, db) {
  const items = await loadOrderItems(orderId, db);
  const orderStatus = computeOrderStatus(items);
  await db.query(
    `UPDATE online_orders SET order_status = $1, updated_at = NOW() WHERE order_id = $2`,
    [orderStatus, orderId],
  );
  return orderStatus;
}

async function findSkuMapping(db, channel, externalSku) {
  if (!externalSku) return null;
  const result = await db.query(
    `SELECT m.*, i.sku, i.item_name, i.stocks, i.lifecycle_status
     FROM channel_sku_mappings m
     JOIN inventory i ON i.inventory_id = m.inventory_id
     WHERE m.channel = $1 AND LOWER(m.external_sku) = LOWER($2)`,
    [channel, externalSku],
  );
  return result.rowCount ? result.rows[0] : null;
}

// Matches a Shopee line item to an inventory SKU for visibility/reporting only.
// Stock is no longer deducted here: RHET stock leaves the warehouse when the
// admin allocates it to the channel (channel-allocation.service.js), not when
// a Shopee order is imported. This avoids double-counting the same units.
export async function matchOrderLine(db, itemRow, orderMeta = {}) {
  if (itemRow.line_status === 'CANCELLED') {
    return itemRow;
  }

  const mapping = await findSkuMapping(db, orderMeta.channel || DEFAULT_CHANNEL, itemRow.external_sku);
  if (!mapping || mapping.lifecycle_status !== 'ACTIVE') {
    const failureReason = mapping
      ? 'Mapped inventory item is inactive'
      : 'No SKU mapping found for this channel item';
    await db.query(
      `UPDATE online_order_items
       SET line_status = 'UNMATCHED',
           matched_inventory_id = $1,
           matched_sku = $2,
           failure_reason = $3,
           updated_at = NOW()
       WHERE order_item_id = $4`,
      [mapping?.inventory_id || null, mapping?.sku || null, failureReason, itemRow.order_item_id],
    );
    return {
      ...itemRow,
      line_status: 'UNMATCHED',
      matched_inventory_id: mapping?.inventory_id || null,
      matched_sku: mapping?.sku || null,
      failure_reason: failureReason,
    };
  }

  await db.query(
    `UPDATE online_order_items
     SET line_status = 'MATCHED',
         matched_inventory_id = $1,
         matched_sku = $2,
         failure_reason = NULL,
         updated_at = NOW()
     WHERE order_item_id = $3`,
    [mapping.inventory_id, mapping.sku, itemRow.order_item_id],
  );

  return {
    ...itemRow,
    line_status: 'MATCHED',
    matched_inventory_id: mapping.inventory_id,
    matched_sku: mapping.sku,
    failure_reason: null,
  };
}

async function upsertOrderWithItems(db, orderInput, source, importedBy) {
  const orderResult = await db.query(
    `INSERT INTO online_orders (
      channel, external_order_id, buyer_name, order_placed_at, total_amount, source, imported_by, notes
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (channel, external_order_id) DO UPDATE SET
      buyer_name = COALESCE(EXCLUDED.buyer_name, online_orders.buyer_name),
      order_placed_at = COALESCE(EXCLUDED.order_placed_at, online_orders.order_placed_at),
      total_amount = CASE WHEN EXCLUDED.total_amount > 0 THEN EXCLUDED.total_amount ELSE online_orders.total_amount END,
      notes = COALESCE(EXCLUDED.notes, online_orders.notes),
      updated_at = NOW()
    RETURNING *`,
    [
      orderInput.channel || DEFAULT_CHANNEL,
      orderInput.externalOrderId,
      orderInput.buyerName || null,
      orderInput.orderPlacedAt || null,
      orderInput.totalAmount || 0,
      source,
      importedBy,
      orderInput.notes || null,
    ],
  );

  const order = orderResult.rows[0];
  const itemRows = [];

  for (const item of orderInput.items) {
    const itemResult = await db.query(
      `INSERT INTO online_order_items (
        order_id, external_sku, external_item_name, external_variation, quantity, unit_price
      ) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (order_id, external_sku, external_variation) DO UPDATE SET
        external_item_name = COALESCE(EXCLUDED.external_item_name, online_order_items.external_item_name),
        quantity = EXCLUDED.quantity,
        unit_price = CASE WHEN EXCLUDED.unit_price > 0 THEN EXCLUDED.unit_price ELSE online_order_items.unit_price END,
        updated_at = NOW()
      RETURNING *`,
      [
        order.order_id,
        item.externalSku,
        item.externalItemName || null,
        normalizeVariation(item.externalVariation),
        item.quantity,
        item.unitPrice || 0,
      ],
    );
    itemRows.push(itemResult.rows[0]);
  }

  for (const itemRow of itemRows) {
    await matchOrderLine(db, itemRow, order);
  }

  await refreshOrderStatus(order.order_id, db);
  return loadOrderRow(order.order_id, db);
}

export async function importOrdersFromCsv(csvText, importedBy, channel = DEFAULT_CHANNEL) {
  const parsedOrders = parseShopeeCsv(csvText, channel);
  const results = [];

  await withTransaction(async (db) => {
    for (const orderInput of parsedOrders) {
      const saved = await upsertOrderWithItems(db, orderInput, 'CSV_IMPORT', importedBy);
      results.push(saved);
    }
  });

  return results;
}

export async function createManualOrder(input, importedBy) {
  return withTransaction((db) => upsertOrderWithItems(db, input, 'MANUAL', importedBy));
}

export async function listOrders(query) {
  const values = [];
  const where = [];
  const add = (value) => { values.push(value); return `$${values.length}`; };

  if (query.status) where.push(`o.order_status = ${add(query.status)}`);
  if (query.fulfillmentStatus) where.push(`o.fulfillment_status = ${add(query.fulfillmentStatus)}`);
  if (query.channel) where.push(`o.channel = ${add(query.channel)}`);
  if (query.search) {
    const p = add(`%${query.search}%`);
    where.push(`(o.external_order_id ILIKE ${p} OR COALESCE(o.buyer_name, '') ILIKE ${p})`);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await pool.query(`SELECT COUNT(*) FROM online_orders o ${clause}`, values);
  const offset = (query.page - 1) * query.limit;
  values.push(query.limit, offset);

  const result = await pool.query(
    `${orderSelect} ${clause} ORDER BY o.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );

  return {
    data: result.rows.map((row) => camelize(row)),
    total: Number(count.rows[0].count),
  };
}

export async function getOrder(id) {
  return loadOrderRow(id);
}

export async function listMappings(query = {}) {
  const values = [];
  const where = [];
  const add = (value) => { values.push(value); return `$${values.length}`; };

  if (query.channel) where.push(`m.channel = ${add(query.channel)}`);

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT m.*, i.sku AS inventory_sku, i.item_name AS inventory_item_name
     FROM channel_sku_mappings m
     JOIN inventory i ON i.inventory_id = m.inventory_id
     ${clause}
     ORDER BY m.updated_at DESC`,
    values,
  );
  return camelize(result.rows);
}

export async function resolveOrderItem(itemId, inventoryId, admin) {
  const adminId = typeof admin === 'object' ? admin.user_id : admin;

  return withTransaction(async (db) => {
    const itemResult = await db.query(
      `SELECT oi.*, o.channel, o.external_order_id
       FROM online_order_items oi
       JOIN online_orders o ON o.order_id = oi.order_id
       WHERE oi.order_item_id = $1
       FOR UPDATE`,
      [itemId],
    );
    if (!itemResult.rowCount) throw new AppError(404, 'ORDER_ITEM_NOT_FOUND', 'Online order item was not found');

    const item = itemResult.rows[0];
    if (item.line_status === 'CANCELLED') {
      throw new AppError(409, 'ITEM_CANCELLED', 'This line item has been cancelled');
    }

    const inventoryResult = await db.query(
      `SELECT inventory_id, sku, item_name FROM inventory WHERE inventory_id = $1 AND lifecycle_status = 'ACTIVE'`,
      [inventoryId],
    );
    if (!inventoryResult.rowCount) {
      throw new AppError(404, 'ITEM_NOT_FOUND', 'Inventory item was not found or is inactive');
    }

    const inventoryRow = inventoryResult.rows[0];
    await db.query(
      `INSERT INTO channel_sku_mappings (channel, external_sku, external_item_name, inventory_id, created_by)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (channel, external_sku) DO UPDATE SET
         external_item_name = COALESCE(EXCLUDED.external_item_name, channel_sku_mappings.external_item_name),
         inventory_id = EXCLUDED.inventory_id,
         updated_at = NOW()`,
      [item.channel, item.external_sku, item.external_item_name, inventoryId, adminId],
    );

    await matchOrderLine(db, item, {
      channel: item.channel,
      externalOrderId: item.external_order_id,
    });
    await refreshOrderStatus(item.order_id, db);
    return loadOrderRow(item.order_id, db);
  });
}

async function restoreLineStock(db, item, actorId, externalOrderId) {
  if (item.line_status !== 'DEDUCTED' || !item.movement_id || !item.matched_inventory_id) return;

  await inventory.createMovement(
    item.matched_inventory_id,
    {
      movementType: 'CANCELLED',
      quantity: item.quantity,
      direction: 'ADD',
      referenceNumber: externalOrderId,
      remarks: `Restored stock from cancelled Shopee order line ${item.external_sku || ''}`.trim(),
    },
    actorId,
    db,
  );
}

export async function cancelOrderItem(itemId, admin) {
  const adminId = typeof admin === 'object' ? admin.user_id : admin;

  return withTransaction(async (db) => {
    const itemResult = await db.query(
      `SELECT oi.*, o.external_order_id
       FROM online_order_items oi
       JOIN online_orders o ON o.order_id = oi.order_id
       WHERE oi.order_item_id = $1
       FOR UPDATE`,
      [itemId],
    );
    if (!itemResult.rowCount) throw new AppError(404, 'ORDER_ITEM_NOT_FOUND', 'Online order item was not found');

    const item = itemResult.rows[0];
    if (item.line_status === 'CANCELLED') {
      throw new AppError(409, 'ITEM_ALREADY_CANCELLED', 'This line item is already cancelled');
    }

    await restoreLineStock(db, item, adminId, item.external_order_id);
    await db.query(
      `UPDATE online_order_items
       SET line_status = 'CANCELLED', failure_reason = NULL, updated_at = NOW()
       WHERE order_item_id = $1`,
      [itemId],
    );
    await refreshOrderStatus(item.order_id, db);
    return loadOrderRow(item.order_id, db);
  });
}

export async function cancelOrder(orderId, admin) {
  const adminId = typeof admin === 'object' ? admin.user_id : admin;

  return withTransaction(async (db) => {
    const orderResult = await db.query('SELECT * FROM online_orders WHERE order_id = $1 FOR UPDATE', [orderId]);
    if (!orderResult.rowCount) throw new AppError(404, 'ORDER_NOT_FOUND', 'Online order was not found');

    const order = orderResult.rows[0];
    const items = await loadOrderItems(orderId, db);

    for (const item of items) {
      if (item.line_status === 'CANCELLED') continue;
      await restoreLineStock(db, item, adminId, order.external_order_id);
      await db.query(
        `UPDATE online_order_items
         SET line_status = 'CANCELLED', failure_reason = NULL, updated_at = NOW()
         WHERE order_item_id = $1`,
        [item.order_item_id],
      );
    }

    await db.query(
      `UPDATE online_orders SET order_status = 'CANCELLED', updated_at = NOW() WHERE order_id = $1`,
      [orderId],
    );
    return loadOrderRow(orderId, db);
  });
}

export async function updateFulfillmentStatus(orderId, targetStatus, admin) {
  return withTransaction(async (db) => {
    const orderResult = await db.query('SELECT * FROM online_orders WHERE order_id = $1 FOR UPDATE', [orderId]);
    if (!orderResult.rowCount) throw new AppError(404, 'ORDER_NOT_FOUND', 'Online order was not found');

    const order = orderResult.rows[0];
    if (order.order_status === 'CANCELLED') {
      throw new AppError(409, 'ORDER_CANCELLED', 'A cancelled order cannot move through fulfillment');
    }

    const allowed = FULFILLMENT_TRANSITIONS[order.fulfillment_status] || [];
    if (!allowed.includes(targetStatus)) {
      throw new AppError(
        409,
        'INVALID_FULFILLMENT_TRANSITION',
        `Cannot move from ${order.fulfillment_status} to ${targetStatus}`,
      );
    }

    await db.query(
      `UPDATE online_orders SET fulfillment_status = $1, updated_at = NOW() WHERE order_id = $2`,
      [targetStatus, orderId],
    );
    return loadOrderRow(orderId, db);
  });
}

// Only lines already matched to an inventory item can be restored, since a
// physical return can only be credited back to a known SKU. Not-reusable
// returns intentionally create no stock movement: the unit was already
// allocated out to the channel, so there is nothing in the warehouse to
// "damage" — it simply never comes back.
export async function confirmReturn(orderId, { reusable, notes }, admin) {
  const adminId = typeof admin === 'object' ? admin.user_id : admin;

  return withTransaction(async (db) => {
    const orderResult = await db.query('SELECT * FROM online_orders WHERE order_id = $1 FOR UPDATE', [orderId]);
    if (!orderResult.rowCount) throw new AppError(404, 'ORDER_NOT_FOUND', 'Online order was not found');

    const order = orderResult.rows[0];
    if (order.fulfillment_status !== 'RETURN') {
      throw new AppError(409, 'ORDER_NOT_IN_RETURN', 'This order is not currently in the return column');
    }

    const items = await loadOrderItems(orderId, db);
    const restorable = items.filter((item) => item.line_status !== 'CANCELLED' && item.matched_inventory_id);

    if (reusable) {
      for (const item of restorable) {
        await inventory.createMovement(
          item.matched_inventory_id,
          {
            movementType: 'RETURN',
            quantity: item.quantity,
            referenceNumber: order.external_order_id,
            remarks: `Reusable return confirmed for ${order.channel} order ${order.external_order_id}`,
          },
          adminId,
          db,
        );
      }
    }

    await db.query(
      `UPDATE online_orders
       SET fulfillment_status = 'RETURN_CONFIRMED',
           return_reusable = $1,
           return_notes = $2,
           updated_at = NOW()
       WHERE order_id = $3`,
      [reusable, notes || null, orderId],
    );
    return loadOrderRow(orderId, db);
  });
}
