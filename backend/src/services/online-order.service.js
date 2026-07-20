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

export function computeOrderStatus(lines = []) {
  if (!lines.length) return 'RECEIVED';
  if (lines.every((line) => line.line_status === 'CANCELLED' || line.lineStatus === 'CANCELLED')) {
    return 'CANCELLED';
  }
  const statuses = lines.map((line) => line.line_status || line.lineStatus);
  if (statuses.some((status) => status === 'UNMATCHED' || status === 'OVERSOLD')) {
    return 'NEEDS_ATTENTION';
  }
  if (statuses.every((status) => status === 'DEDUCTED' || status === 'CANCELLED')) {
    return statuses.some((status) => status === 'DEDUCTED') ? 'FULFILLED' : 'CANCELLED';
  }
  return 'NEEDS_ATTENTION';
}

export function decideLineOutcome({ hasMapping, availableStock, quantity }) {
  if (!hasMapping) {
    return { lineStatus: 'UNMATCHED', failureReason: 'No SKU mapping found for this channel item' };
  }
  if (!Number.isFinite(availableStock) || availableStock < quantity) {
    return {
      lineStatus: 'OVERSOLD',
      failureReason: `Only ${availableStock ?? 0} unit(s) available, but ${quantity} requested`,
    };
  }
  return { lineStatus: 'DEDUCTED', failureReason: null };
}

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

export async function matchAndDeductLine(db, itemRow, actorId, orderMeta = {}) {
  if (itemRow.line_status === 'DEDUCTED' || itemRow.line_status === 'CANCELLED') {
    return itemRow;
  }

  const mapping = await findSkuMapping(db, orderMeta.channel || DEFAULT_CHANNEL, itemRow.external_sku);
  if (!mapping) {
    await db.query(
      `UPDATE online_order_items
       SET line_status = 'UNMATCHED',
           matched_inventory_id = NULL,
           matched_sku = NULL,
           failure_reason = $1,
           updated_at = NOW()
       WHERE order_item_id = $2`,
      ['No SKU mapping found for this channel item', itemRow.order_item_id],
    );
    return { ...itemRow, line_status: 'UNMATCHED', failure_reason: 'No SKU mapping found for this channel item' };
  }

  if (mapping.lifecycle_status !== 'ACTIVE') {
    await db.query(
      `UPDATE online_order_items
       SET line_status = 'UNMATCHED',
           matched_inventory_id = $1,
           matched_sku = $2,
           failure_reason = $3,
           updated_at = NOW()
       WHERE order_item_id = $4`,
      [mapping.inventory_id, mapping.sku, 'Mapped inventory item is inactive', itemRow.order_item_id],
    );
    return {
      ...itemRow,
      line_status: 'UNMATCHED',
      matched_inventory_id: mapping.inventory_id,
      matched_sku: mapping.sku,
      failure_reason: 'Mapped inventory item is inactive',
    };
  }

  const stockResult = await db.query(
    'SELECT stocks FROM inventory WHERE inventory_id = $1 FOR UPDATE',
    [mapping.inventory_id],
  );
  const availableStock = stockResult.rows[0]?.stocks ?? 0;
  const outcome = decideLineOutcome({
    hasMapping: true,
    availableStock,
    quantity: itemRow.quantity,
  });

  if (outcome.lineStatus !== 'DEDUCTED') {
    await db.query(
      `UPDATE online_order_items
       SET line_status = $1,
           matched_inventory_id = $2,
           matched_sku = $3,
           failure_reason = $4,
           updated_at = NOW()
       WHERE order_item_id = $5`,
      [outcome.lineStatus, mapping.inventory_id, mapping.sku, outcome.failureReason, itemRow.order_item_id],
    );
    return {
      ...itemRow,
      line_status: outcome.lineStatus,
      matched_inventory_id: mapping.inventory_id,
      matched_sku: mapping.sku,
      failure_reason: outcome.failureReason,
    };
  }

  const movement = await inventory.createMovement(
    mapping.inventory_id,
    {
      movementType: 'ONLINE_SALE',
      quantity: itemRow.quantity,
      referenceNumber: orderMeta.externalOrderId || orderMeta.external_order_id || null,
      remarks: `Shopee order ${orderMeta.externalOrderId || orderMeta.external_order_id || ''}: ${itemRow.external_item_name || itemRow.external_sku}`,
    },
    actorId,
    db,
  );

  await db.query(
    `UPDATE online_order_items
     SET line_status = 'DEDUCTED',
         matched_inventory_id = $1,
         matched_sku = $2,
         movement_id = $3,
         failure_reason = NULL,
         updated_at = NOW()
     WHERE order_item_id = $4`,
    [mapping.inventory_id, mapping.sku, movement.movementId || movement.movement_id, itemRow.order_item_id],
  );

  return {
    ...itemRow,
    line_status: 'DEDUCTED',
    matched_inventory_id: mapping.inventory_id,
    matched_sku: mapping.sku,
    movement_id: movement.movementId || movement.movement_id,
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
    await matchAndDeductLine(db, itemRow, importedBy, order);
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
    if (item.line_status === 'DEDUCTED') {
      throw new AppError(409, 'ITEM_ALREADY_DEDUCTED', 'This line item has already been deducted');
    }
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

    await matchAndDeductLine(db, item, adminId, {
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
