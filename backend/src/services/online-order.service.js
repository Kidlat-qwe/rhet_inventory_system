import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
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
  orderStatus: [
    'Order Status',
    'order status',
    'Status',
    'Parcel Status',
    'Shipping Status',
    'Order Complete Status',
  ],
};

/** Higher rank = later in the fulfillment board (forward-only CSV sync). */
export const FULFILLMENT_RANK = {
  PROCESSING: 0,
  READY_TO_SHIP: 1,
  SHIPPED: 2,
  RECEIVED: 3,
  RETURN: 4,
  RETURN_CONFIRMED: 5,
};

/**
 * Map Shopee Seller Centre export "Order Status" text → RHET fulfillment_status.
 * Returns null when the value is missing or unrecognized (leave RHET as-is).
 */
export function mapShopeeOrderStatusToFulfillment(rawStatus) {
  const text = String(rawStatus || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!text) return null;

  if (text.includes('cancel')) return 'CANCELLED';

  if (text.includes('return') || text.includes('refund')) return 'RETURN';

  if (
    text.includes('complet')
    || text.includes('deliver')
    || text === 'received'
    || text.includes('buyer has received')
    || text.includes('order received')
  ) {
    return 'RECEIVED';
  }

  // "To Ship" / "Ready To Ship" before generic "ship" / "shipping"
  if (text.includes('to ship') || text.includes('ready to ship') || text === 'processed') {
    return 'READY_TO_SHIP';
  }

  if (
    text.includes('to receive')
    || text.includes('in transit')
    || text.includes('out for delivery')
    || text.includes('shipped')
    || text.includes('shipping')
  ) {
    return 'SHIPPED';
  }

  if (
    text.includes('unpaid')
    || text.includes('to pay')
    || text.includes('pending')
    || text === 'processing'
    || text.includes('order processing')
  ) {
    return 'PROCESSING';
  }

  return null;
}

/**
 * CSV re-import may advance fulfillment when the export shows a newer status.
 * Never moves backward; never auto-changes RETURN / RETURN_CONFIRMED rows.
 * CANCELLED is a side-exit (allowed from active delivery stages, not from return).
 */
export function shouldApplyFulfillmentFromImport(currentStatus, nextStatus) {
  if (!nextStatus) return false;
  const current = currentStatus || 'PROCESSING';
  if (current === 'RETURN' || current === 'RETURN_CONFIRMED') return false;
  if (current === 'CANCELLED') return false;
  if (nextStatus === current) return false;

  if (nextStatus === 'CANCELLED') {
    return ['PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'RECEIVED'].includes(current);
  }

  const currentRank = FULFILLMENT_RANK[current];
  const nextRank = FULFILLMENT_RANK[nextStatus];
  if (currentRank === undefined || nextRank === undefined) return false;

  if (nextStatus === 'RETURN') {
    return current === 'SHIPPED' || current === 'RECEIVED';
  }

  return nextRank > currentRank;
}

function pickHigherFulfillment(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  if (a === 'CANCELLED' || b === 'CANCELLED') return 'CANCELLED';
  return FULFILLMENT_RANK[b] > FULFILLMENT_RANK[a] ? b : a;
}

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

function isLikelyExcelWorkbook(text) {
  return String(text || '').startsWith('PK\u0003\u0004');
}

function isExcelFileName(fileName = '') {
  return /\.xlsx?$/i.test(String(fileName || '').trim());
}

function parseCsvRows(csvText) {
  const text = String(csvText || '');
  if (isLikelyExcelWorkbook(text)) {
    throw new AppError(
      422,
      'INVALID_FILE_TYPE',
      'This looks like an Excel workbook sent as text. Upload the .xlsx file directly (or export CSV UTF-8).',
    );
  }

  try {
    return parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_column_count: true,
    });
  } catch {
    throw new AppError(
      422,
      'INVALID_CSV_FILE',
      'The selected file could not be parsed as CSV. Upload a Shopee .csv or .xlsx export.',
    );
  }
}

function parseXlsxRows(buffer) {
  let workbook;
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true,
      raw: false,
    });
  } catch {
    throw new AppError(422, 'INVALID_XLSX_FILE', 'The selected Excel file could not be read. Re-export from Shopee Seller Centre and try again.');
  }

  const sheetName = workbook.SheetNames?.[0];
  if (!sheetName) {
    throw new AppError(422, 'EMPTY_XLSX', 'The Excel workbook does not contain any sheets');
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: '',
    raw: false,
    blankrows: false,
  });

  if (!rows.length) {
    throw new AppError(422, 'EMPTY_XLSX', 'The Excel sheet does not contain any data rows');
  }

  return rows.map((row) => {
    const normalized = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[String(key || '').trim()] = value == null ? '' : value;
    }
    return normalized;
  });
}

/**
 * Accepts either CSV text or an Excel workbook (base64).
 * @param {string|{ csvText?: string, fileBase64?: string, fileName?: string }} input
 */
export function resolveShopeeImportRows(input) {
  if (typeof input === 'string') {
    return parseCsvRows(input);
  }

  const payload = input || {};
  const csvText = payload.csvText != null ? String(payload.csvText) : '';
  const fileBase64 = payload.fileBase64 != null ? String(payload.fileBase64).trim() : '';
  const fileName = payload.fileName || '';

  if (fileBase64) {
    let buffer;
    try {
      buffer = Buffer.from(fileBase64, 'base64');
    } catch {
      throw new AppError(422, 'INVALID_FILE_ENCODING', 'The uploaded file could not be decoded');
    }
    if (!buffer.length) {
      throw new AppError(422, 'EMPTY_FILE', 'The uploaded file is empty');
    }

    const looksLikeZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
    if (looksLikeZip || isExcelFileName(fileName)) {
      return parseXlsxRows(buffer);
    }
    return parseCsvRows(buffer.toString('utf8'));
  }

  if (csvText.trim()) {
    return parseCsvRows(csvText);
  }

  throw new AppError(422, 'MISSING_IMPORT_FILE', 'Provide csvText or an Excel file upload');
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
  CANCELLED: [],
};

function groupShopeeOrderRows(rows, channel = DEFAULT_CHANNEL) {
  if (!rows.length) {
    throw new AppError(422, 'EMPTY_CSV', 'The uploaded file does not contain any rows');
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

    const rawOrderStatus = String(pickColumn(row, SHOPEE_CSV_COLUMNS.orderStatus) || '').trim() || null;
    const mappedFulfillment = mapShopeeOrderStatusToFulfillment(rawOrderStatus);

    const externalVariation = normalizeVariation(pickColumn(row, SHOPEE_CSV_COLUMNS.variation));
    const rawSku = String(pickColumn(row, SHOPEE_CSV_COLUMNS.sku) || '').trim();

    const item = {
      // Shopee sometimes leaves `SKU Reference No.` blank for variation rows.
      // When blank, we keep the synthetic ROW-n value in `external_sku`
      // and rely on matching/mapping fallback via `external_variation`.
      externalSku: rawSku || `ROW-${index + 1}`,
      externalItemName: String(pickColumn(row, SHOPEE_CSV_COLUMNS.productName) || '').trim() || null,
      externalVariation,
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
        externalOrderStatus: rawOrderStatus,
        fulfillmentStatus: mappedFulfillment,
        items: [item],
      });
      return;
    }

    const existing = grouped.get(externalOrderId);
    existing.items.push(item);
    if (!existing.totalAmount) {
      existing.totalAmount = parseMoney(pickColumn(row, SHOPEE_CSV_COLUMNS.totalAmount));
    }
    if (rawOrderStatus && !existing.externalOrderStatus) {
      existing.externalOrderStatus = rawOrderStatus;
    }
    existing.fulfillmentStatus = pickHigherFulfillment(existing.fulfillmentStatus, mappedFulfillment);
  });

  return [...grouped.values()];
}

/**
 * Parse a Shopee Seller Centre export (.csv text or .xlsx via base64 payload).
 * @param {string|{ csvText?: string, fileBase64?: string, fileName?: string }} input
 */
export function parseShopeeOrders(input, channel = DEFAULT_CHANNEL) {
  return groupShopeeOrderRows(resolveShopeeImportRows(input), channel);
}

/** @deprecated Prefer parseShopeeOrders — kept for callers/tests that pass CSV text. */
export function parseShopeeCsv(csvText, channel = DEFAULT_CHANNEL) {
  return parseShopeeOrders(csvText, channel);
}

function shapeOrder(row, items = []) {
  return camelize({
    ...row,
    items: items.map((item) => camelize(item)),
  });
}

function isSyntheticExternalSku(sku) {
  return /^ROW-\d+$/i.test(String(sku || '').trim());
}

async function replaceItemMatches(db, orderItemId, matches = []) {
  await db.query('DELETE FROM online_order_item_matches WHERE order_item_id = $1', [orderItemId]);
  for (const match of matches) {
    await db.query(
      `INSERT INTO online_order_item_matches (order_item_id, inventory_id, quantity)
       VALUES ($1, $2, $3)`,
      [orderItemId, match.inventoryId, match.quantity],
    );
  }
}

async function loadItemMatches(orderItemIds, db = pool) {
  if (!orderItemIds.length) return new Map();
  const result = await db.query(
    `SELECT m.match_id, m.order_item_id, m.inventory_id, m.quantity, m.movement_id,
            i.sku, i.item_name, i.stocks
     FROM online_order_item_matches m
     JOIN inventory i ON i.inventory_id = m.inventory_id
     WHERE m.order_item_id = ANY($1::uuid[])
     ORDER BY m.created_at ASC`,
    [orderItemIds],
  );

  const byItem = new Map();
  for (const row of result.rows) {
    const list = byItem.get(row.order_item_id) || [];
    list.push({
      match_id: row.match_id,
      inventory_id: row.inventory_id,
      quantity: row.quantity,
      sku: row.sku,
      item_name: row.item_name,
      stocks: row.stocks,
      movement_id: row.movement_id,
    });
    byItem.set(row.order_item_id, list);
  }
  return byItem;
}

async function loadOrderItems(orderId, db = pool) {
  const result = await db.query(`${itemSelect} WHERE oi.order_id = $1 ORDER BY oi.created_at ASC`, [orderId]);
  const matchesByItem = await loadItemMatches(result.rows.map((row) => row.order_item_id), db);
  return result.rows.map((item) => {
    const inventoryMatches = matchesByItem.get(item.order_item_id);
    if (inventoryMatches?.length) {
      return { ...item, inventory_matches: inventoryMatches };
    }
    if (item.matched_inventory_id) {
      return {
        ...item,
        inventory_matches: [{
          inventory_id: item.matched_inventory_id,
          quantity: item.quantity,
          sku: item.matched_sku,
          item_name: item.matched_item_name,
          stocks: item.current_stocks,
        }],
      };
    }
    return { ...item, inventory_matches: [] };
  });
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

/** Direct inventory match when Shopee SKU equals RHET inventory.sku. */
async function findInventoryBySku(db, sku) {
  if (!sku || isSyntheticExternalSku(sku)) return null;
  const result = await db.query(
    `SELECT inventory_id, sku, item_name, stocks, lifecycle_status
     FROM inventory
     WHERE LOWER(sku) = LOWER($1)
     LIMIT 1`,
    [sku],
  );
  return result.rowCount ? result.rows[0] : null;
}

async function rememberChannelSkuMapping(db, {
  channel,
  externalSku,
  externalItemName = null,
  inventoryId,
  createdBy = null,
}) {
  if (!externalSku || isSyntheticExternalSku(externalSku) || !inventoryId) return;
  await db.query(
    `INSERT INTO channel_sku_mappings (channel, external_sku, external_item_name, inventory_id, created_by)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (channel, external_sku) DO UPDATE SET
       external_item_name = COALESCE(EXCLUDED.external_item_name, channel_sku_mappings.external_item_name),
       inventory_id = EXCLUDED.inventory_id,
       updated_at = NOW()`,
    [channel, externalSku, externalItemName, inventoryId, createdBy],
  );
}

// Matches a Shopee line item to an inventory SKU.
// Stock is deducted later when the order reaches SHIPPED (see deductOrderForShipment).
export async function matchOrderLine(db, itemRow, orderMeta = {}) {
  if (itemRow.line_status === 'CANCELLED' || itemRow.line_status === 'DEDUCTED') {
    return itemRow;
  }

  const channel = orderMeta.channel || DEFAULT_CHANNEL;
  const createdBy = orderMeta.imported_by || orderMeta.importedBy || null;

  // 1) Learned mapping from a previous Map item / auto-match.
  let mapping = await findSkuMapping(db, channel, itemRow.external_sku);

  // 2) Blank Shopee SKU (ROW-n): try variation as mapping key.
  if (!mapping && itemRow.external_variation && isSyntheticExternalSku(itemRow.external_sku)) {
    mapping = await findSkuMapping(db, channel, itemRow.external_variation);
  }

  // 3) Same string as RHET inventory.sku (e.g. PEU-U-PANTS-L on both sides).
  let matchedViaInventorySku = false;
  if (!mapping) {
    const inventoryRow = await findInventoryBySku(db, itemRow.external_sku);
    if (inventoryRow) {
      mapping = inventoryRow;
      matchedViaInventorySku = true;
    }
  }

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
    await replaceItemMatches(db, itemRow.order_item_id, []);
    return {
      ...itemRow,
      line_status: 'UNMATCHED',
      matched_inventory_id: mapping?.inventory_id || null,
      matched_sku: mapping?.sku || null,
      failure_reason: failureReason,
    };
  }

  if (matchedViaInventorySku) {
    await rememberChannelSkuMapping(db, {
      channel,
      externalSku: itemRow.external_sku,
      externalItemName: itemRow.external_item_name || null,
      inventoryId: mapping.inventory_id,
      createdBy,
    });
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
  await replaceItemMatches(db, itemRow.order_item_id, [{
    inventoryId: mapping.inventory_id,
    quantity: itemRow.quantity,
  }]);

  return {
    ...itemRow,
    line_status: 'MATCHED',
    matched_inventory_id: mapping.inventory_id,
    matched_sku: mapping.sku,
    failure_reason: null,
  };
}

/** True when moving into SHIPPED or later (e.g. RECEIVED) from a pre-ship status. */
export function shipmentRequiresDeduction(fromStatus, toStatus) {
  if (!toStatus) return false;
  if (['CANCELLED', 'RETURN', 'RETURN_CONFIRMED'].includes(toStatus)) return false;
  const fromRank = FULFILLMENT_RANK[fromStatus] ?? -1;
  const toRank = FULFILLMENT_RANK[toStatus];
  if (toRank === undefined) return false;
  return toRank >= FULFILLMENT_RANK.SHIPPED && fromRank < FULFILLMENT_RANK.SHIPPED;
}

function collectShipmentRequirements(items = []) {
  const unmatched = [];
  const neededByInventory = new Map();

  for (const item of items) {
    const lineStatus = item.line_status || item.lineStatus;
    if (lineStatus === 'CANCELLED') continue;
    if (lineStatus === 'DEDUCTED') continue;

    const matches = item.inventory_matches || item.inventoryMatches || [];
    if (!matches.length || lineStatus === 'UNMATCHED') {
      unmatched.push({
        orderItemId: item.order_item_id || item.orderItemId,
        externalSku: item.external_sku || item.externalSku,
        externalItemName: item.external_item_name || item.externalItemName,
      });
      continue;
    }

    for (const match of matches) {
      if (match.movement_id || match.movementId) continue;
      const inventoryId = match.inventory_id || match.inventoryId;
      const quantity = Number(match.quantity) || 0;
      if (!inventoryId || quantity < 1) continue;
      const current = neededByInventory.get(inventoryId) || {
        inventoryId,
        sku: match.sku,
        itemName: match.item_name || match.itemName,
        quantity: 0,
        stocks: match.stocks,
      };
      current.quantity += quantity;
      current.stocks = match.stocks;
      neededByInventory.set(inventoryId, current);
    }
  }

  return { unmatched, requirements: [...neededByInventory.values()] };
}

async function assertShipmentStock(db, orderId) {
  const items = await loadOrderItems(orderId, db);
  const { unmatched, requirements } = collectShipmentRequirements(items);

  if (unmatched.length) {
    throw new AppError(
      409,
      'LINES_UNMATCHED',
      `Map all line items before shipping (${unmatched.length} unmatched). Stock is deducted only for mapped RHET items.`,
      { unmatched },
    );
  }

  const shortages = [];
  for (const req of requirements) {
    const locked = await db.query(
      `SELECT inventory_id, sku, item_name, stocks, lifecycle_status
       FROM inventory WHERE inventory_id = $1 FOR UPDATE`,
      [req.inventoryId],
    );
    if (!locked.rowCount || locked.rows[0].lifecycle_status !== 'ACTIVE') {
      shortages.push({
        inventoryId: req.inventoryId,
        sku: req.sku,
        required: req.quantity,
        available: 0,
        reason: 'Item missing or inactive',
      });
      continue;
    }
    const available = locked.rows[0].stocks;
    if (available < req.quantity) {
      shortages.push({
        inventoryId: req.inventoryId,
        sku: locked.rows[0].sku,
        itemName: locked.rows[0].item_name,
        required: req.quantity,
        available,
      });
    }
  }

  if (shortages.length) {
    const summary = shortages
      .map((row) => `${row.sku || 'item'}: need ${row.required}, have ${row.available}`)
      .join('; ');
    throw new AppError(
      409,
      'INSUFFICIENT_STOCK',
      `Cannot mark shipped — insufficient stock (${summary})`,
      { shortages },
    );
  }

  return items;
}

async function deductOrderForShipment(db, order, actorId) {
  const items = await assertShipmentStock(db, order.order_id);
  let primaryMovementId = null;

  for (const item of items) {
    if (item.line_status === 'CANCELLED' || item.line_status === 'DEDUCTED') continue;
    const matches = item.inventory_matches || [];
    if (!matches.length) continue;

    let lineMovementId = item.movement_id || null;
    for (const match of matches) {
      if (match.movement_id) {
        lineMovementId = lineMovementId || match.movement_id;
        continue;
      }
      const movement = await inventory.createMovement(
        match.inventory_id,
        {
          movementType: 'ONLINE_SALE',
          quantity: match.quantity,
          referenceNumber: order.external_order_id,
          remarks: `Shopee shipment ${order.external_order_id} · ${item.external_sku || ''}`.trim(),
        },
        actorId,
        db,
      );
      await db.query(
        `UPDATE online_order_item_matches SET movement_id = $1 WHERE match_id = $2`,
        [movement.movementId, match.match_id],
      );
      lineMovementId = lineMovementId || movement.movementId;
      primaryMovementId = primaryMovementId || movement.movementId;
    }

    await db.query(
      `UPDATE online_order_items
       SET line_status = 'DEDUCTED',
           movement_id = $1,
           failure_reason = NULL,
           updated_at = NOW()
       WHERE order_item_id = $2`,
      [lineMovementId, item.order_item_id],
    );
  }

  return primaryMovementId;
}

async function applyFulfillmentFromImport(db, orderRow, proposedStatus, importedBy = null) {
  if (!shouldApplyFulfillmentFromImport(orderRow.fulfillment_status, proposedStatus)) {
    return { order: orderRow, fulfillmentApplied: false, deductSkipped: false };
  }

  if (shipmentRequiresDeduction(orderRow.fulfillment_status, proposedStatus)) {
    try {
      await deductOrderForShipment(db, orderRow, importedBy);
    } catch (error) {
      // Import should not fail the whole batch: leave fulfillment unchanged until mapped/stocked.
      if (error instanceof AppError && ['LINES_UNMATCHED', 'INSUFFICIENT_STOCK', 'VIRTUAL_KIT_STOCK'].includes(error.code)) {
        return { order: orderRow, fulfillmentApplied: false, deductSkipped: true, deductError: error };
      }
      throw error;
    }
  }

  await db.query(
    `UPDATE online_orders SET fulfillment_status = $1, updated_at = NOW() WHERE order_id = $2`,
    [proposedStatus, orderRow.order_id],
  );
  return {
    order: { ...orderRow, fulfillment_status: proposedStatus },
    fulfillmentApplied: true,
    deductSkipped: false,
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

  let order = orderResult.rows[0];
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

  if (orderInput.fulfillmentStatus === 'CANCELLED') {
    await markOrderAsCancelled(db, order, importedBy);
    return loadOrderRow(order.order_id, db);
  }

  for (const itemRow of itemRows) {
    if (itemRow.line_status === 'DEDUCTED') continue;
    await matchOrderLine(db, itemRow, order);
  }

  const fulfillmentResult = await applyFulfillmentFromImport(
    db,
    order,
    orderInput.fulfillmentStatus || null,
    importedBy,
  );
  order = fulfillmentResult.order;

  await refreshOrderStatus(order.order_id, db);
  return loadOrderRow(order.order_id, db);
}

/**
 * Dry-run parse + compare against existing orders. Does not write to the database.
 */
export async function previewOrdersFromCsv(input, channel = DEFAULT_CHANNEL) {
  const payload = typeof input === 'string' ? { csvText: input } : (input || {});
  const resolvedChannel = payload.channel || channel;
  const parsedOrders = parseShopeeOrders(payload, resolvedChannel);
  const externalIds = parsedOrders.map((order) => order.externalOrderId);

  const existingResult = externalIds.length
    ? await pool.query(
      `SELECT external_order_id, fulfillment_status, order_status, buyer_name, total_amount
       FROM online_orders
       WHERE channel = $1 AND external_order_id = ANY($2::text[])`,
      [resolvedChannel, externalIds],
    )
    : { rows: [] };

  const existingById = new Map(
    existingResult.rows.map((row) => [row.external_order_id, row]),
  );

  let newCount = 0;
  let updateCount = 0;
  let fulfillmentChangeCount = 0;
  let itemCount = 0;
  let unmappedStatusCount = 0;

  const orders = parsedOrders.map((order) => {
    const existing = existingById.get(order.externalOrderId);
    const isNew = !existing;
    if (isNew) newCount += 1;
    else updateCount += 1;

    itemCount += order.items.length;
    const currentFulfillment = existing?.fulfillment_status || null;
    const proposedFulfillment = order.fulfillmentStatus || null;
    if (order.externalOrderStatus && !proposedFulfillment) unmappedStatusCount += 1;

    const willUpdateFulfillment = shouldApplyFulfillmentFromImport(
      isNew ? null : currentFulfillment,
      proposedFulfillment,
    );
    if (willUpdateFulfillment) fulfillmentChangeCount += 1;

    const resultingFulfillment = willUpdateFulfillment
      ? proposedFulfillment
      : (currentFulfillment || proposedFulfillment || 'PROCESSING');

    return {
      externalOrderId: order.externalOrderId,
      buyerName: order.buyerName,
      itemCount: order.items.length,
      totalAmount: order.totalAmount || 0,
      externalOrderStatus: order.externalOrderStatus,
      isNew,
      currentFulfillmentStatus: currentFulfillment,
      proposedFulfillmentStatus: proposedFulfillment,
      resultingFulfillmentStatus: resultingFulfillment,
      fulfillmentWillChange: willUpdateFulfillment,
    };
  });

  return {
    channel: resolvedChannel,
    summary: {
      orderCount: parsedOrders.length,
      newCount,
      updateCount,
      itemCount,
      fulfillmentChangeCount,
      unmappedStatusCount,
    },
    orders,
  };
}

export async function importOrdersFromCsv(input, importedBy, channel = DEFAULT_CHANNEL) {
  const payload = typeof input === 'string' ? { csvText: input } : (input || {});
  const resolvedChannel = payload.channel || channel;
  const parsedOrders = parseShopeeOrders(payload, resolvedChannel);
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

export async function resolveOrderItem(itemId, body, admin) {
  const adminId = typeof admin === 'object' ? admin.user_id : admin;
  const payload = typeof body === 'string' ? { inventoryId: body } : (body || {});

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

    const matchesInput = payload.matches?.length
      ? payload.matches
      : [{ inventoryId: payload.inventoryId, quantity: payload.quantity }];

    const inventoryIds = matchesInput.map((row) => row.inventoryId).filter(Boolean);
    if (!inventoryIds.length) {
      throw new AppError(422, 'INVALID_MATCHES', 'At least one inventory item is required');
    }

    const inventoryResult = await db.query(
      `SELECT inventory_id, sku, item_name
       FROM inventory
       WHERE inventory_id = ANY($1::uuid[]) AND lifecycle_status = 'ACTIVE'`,
      [inventoryIds],
    );
    if (inventoryResult.rowCount !== inventoryIds.length) {
      throw new AppError(404, 'ITEM_NOT_FOUND', 'One or more inventory items were not found or are inactive');
    }

    const inventoryById = new Map(inventoryResult.rows.map((row) => [row.inventory_id, row]));
    const normalizedMatches = matchesInput.map((row) => ({
      inventoryId: row.inventoryId,
      quantity: row.quantity ?? item.quantity,
      sku: inventoryById.get(row.inventoryId).sku,
    }));
    const primary = normalizedMatches[0];

    // If Shopee's `SKU Reference No.` was missing, we store a synthetic `ROW-n`
    // in `external_sku`, but we can still use `external_variation` as the stable
    // channel mapping key (so future imports auto-resolve).
    const externalSkuForMapping = (() => {
      if (item.external_sku && !isSyntheticExternalSku(item.external_sku)) return item.external_sku;
      if (item.external_variation && !isSyntheticExternalSku(item.external_variation)) return item.external_variation;
      return null;
    })();

    if (externalSkuForMapping) {
      await db.query(
        `INSERT INTO channel_sku_mappings (channel, external_sku, external_item_name, inventory_id, created_by)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (channel, external_sku) DO UPDATE SET
           external_item_name = COALESCE(EXCLUDED.external_item_name, channel_sku_mappings.external_item_name),
           inventory_id = EXCLUDED.inventory_id,
           updated_at = NOW()`,
        [item.channel, externalSkuForMapping, item.external_item_name, primary.inventoryId, adminId],
      );
    }

    await replaceItemMatches(db, item.order_item_id, normalizedMatches);
    await db.query(
      `UPDATE online_order_items
       SET line_status = 'MATCHED',
           matched_inventory_id = $1,
           matched_sku = $2,
           failure_reason = NULL,
           updated_at = NOW()
       WHERE order_item_id = $3`,
      [primary.inventoryId, primary.sku, item.order_item_id],
    );

    const orderLock = await db.query(
      `SELECT * FROM online_orders WHERE order_id = $1 FOR UPDATE`,
      [item.order_id],
    );
    const order = orderLock.rows[0];
    if (['SHIPPED', 'RECEIVED'].includes(order.fulfillment_status)) {
      await deductOrderForShipment(db, order, adminId);
    }

    await refreshOrderStatus(item.order_id, db);
    return loadOrderRow(item.order_id, db);
  });
}

async function restoreLineStock(db, item, actorId, externalOrderId) {
  if (item.line_status !== 'DEDUCTED') return;

  const matches = item.inventory_matches || [];
  if (matches.length) {
    for (const match of matches) {
      if (!match.movement_id && !match.inventory_id) continue;
      await inventory.createMovement(
        match.inventory_id,
        {
          movementType: 'CANCELLED',
          quantity: match.quantity,
          direction: 'ADD',
          referenceNumber: externalOrderId,
          remarks: `Restored stock from cancelled Shopee order line ${item.external_sku || ''}`.trim(),
        },
        actorId,
        db,
      );
      if (match.match_id) {
        await db.query(
          `UPDATE online_order_item_matches SET movement_id = NULL WHERE match_id = $1`,
          [match.match_id],
        );
      }
    }
  } else if (item.matched_inventory_id) {
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

  await db.query(
    `UPDATE online_order_items SET movement_id = NULL, updated_at = NOW() WHERE order_item_id = $1`,
    [item.order_item_id],
  );
}

async function markOrderAsCancelled(db, order, actorId = null) {
  const items = await loadOrderItems(order.order_id, db);

  for (const item of items) {
    if (item.line_status === 'CANCELLED') continue;
    await restoreLineStock(db, item, actorId, order.external_order_id);
    await db.query(
      `UPDATE online_order_items
       SET line_status = 'CANCELLED', failure_reason = NULL, updated_at = NOW()
       WHERE order_item_id = $1`,
      [item.order_item_id],
    );
  }

  await db.query(
    `UPDATE online_orders
     SET order_status = 'CANCELLED',
         fulfillment_status = 'CANCELLED',
         updated_at = NOW()
     WHERE order_id = $1`,
    [order.order_id],
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

    const orderItems = await loadOrderItems(item.order_id, db);
    const fullItem = orderItems.find((row) => row.order_item_id === itemId) || item;
    await restoreLineStock(db, fullItem, adminId, item.external_order_id);
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
    if (order.order_status === 'CANCELLED' || order.fulfillment_status === 'CANCELLED') {
      throw new AppError(409, 'ORDER_ALREADY_CANCELLED', 'This order is already cancelled');
    }
    if (order.fulfillment_status === 'RETURN' || order.fulfillment_status === 'RETURN_CONFIRMED') {
      throw new AppError(
        409,
        'INVALID_CANCEL',
        'Return orders cannot be cancelled here — complete return inspection instead',
      );
    }

    await markOrderAsCancelled(db, order, adminId);
    return loadOrderRow(orderId, db);
  });
}

export async function updateFulfillmentStatus(orderId, targetStatus, admin) {
  const adminId = typeof admin === 'object' ? admin.user_id : admin;

  return withTransaction(async (db) => {
    const orderResult = await db.query('SELECT * FROM online_orders WHERE order_id = $1 FOR UPDATE', [orderId]);
    if (!orderResult.rowCount) throw new AppError(404, 'ORDER_NOT_FOUND', 'Online order was not found');

    const order = orderResult.rows[0];
    if (order.order_status === 'CANCELLED' || order.fulfillment_status === 'CANCELLED') {
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

    if (shipmentRequiresDeduction(order.fulfillment_status, targetStatus)) {
      await deductOrderForShipment(db, order, adminId);
    }

    await db.query(
      `UPDATE online_orders SET fulfillment_status = $1, updated_at = NOW() WHERE order_id = $2`,
      [targetStatus, orderId],
    );
    return loadOrderRow(orderId, db);
  });
}

// Restores deducted RHET stock for reusable returns (per mapped match qty).
// Not-reusable returns intentionally create no stock movement.
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
    const restorable = items.filter((item) => item.line_status === 'DEDUCTED' || (
      item.line_status !== 'CANCELLED' && item.matched_inventory_id
    ));

    if (reusable) {
      for (const item of restorable) {
        const matches = item.inventory_matches || [];
        if (matches.length) {
          for (const match of matches) {
            await inventory.createMovement(
              match.inventory_id,
              {
                movementType: 'RETURN',
                quantity: match.quantity,
                referenceNumber: order.external_order_id,
                remarks: `Reusable return confirmed for ${order.channel} order ${order.external_order_id}`,
              },
              adminId,
              db,
            );
          }
        } else if (item.matched_inventory_id) {
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
