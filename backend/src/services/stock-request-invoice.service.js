import { pool, withTransaction } from '../database/pool.js';
import { AppError, camelize } from '../utils/api.js';
import {
  finalizeShippedRequest,
  loadStockRequestRowsByIds,
  shipStockRequestInDb,
} from './stock-request.service.js';

function money(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100) / 100;
}

function variationLabel(row) {
  return [row.gender, row.itemType || row.item_type, row.sizeLabel || row.size_label]
    .filter(Boolean)
    .join(' · ');
}

function itemLabel(row) {
  const name = String(row.itemName || row.item_name || '').trim();
  if (name) return name;
  const variation = variationLabel(row);
  const category = String(row.categoryName || row.category_name || '').trim();
  if (category && variation) return `${category} · ${variation}`;
  return category || row.matchedSku || row.matched_sku || 'Stock item';
}

function groupKey(row) {
  const source = String(row.sourceSystem || row.source_system || 'PSMS').trim() || 'PSMS';
  const batch = String(row.batchReference || row.batch_reference || '').trim();
  if (batch) return `${source}::${batch}`;
  return `solo::${row.requestId || row.request_id}`;
}

function branchKey(row) {
  return String(row.branchName || row.branch_name || '').trim().toLowerCase() || '__no_branch__';
}

function isShippablePreview(row) {
  if (String(row.status || '').toUpperCase() !== 'PENDING') return false;
  const matched = Boolean(row.matchedSku || row.matched_sku || row.inventoryId || row.inventory_id);
  if (!matched) return false;
  const available = Number(row.currentStocks ?? row.current_stocks);
  const needed = Number(row.quantity) || 0;
  if (!Number.isFinite(available)) return false;
  return available >= needed;
}

function blockedReason(row) {
  if (String(row.status || '').toUpperCase() !== 'PENDING') {
    return `Request is already ${String(row.status || 'unknown').toLowerCase()}`;
  }
  if (!Boolean(row.matchedSku || row.matched_sku || row.inventoryId || row.inventory_id)) {
    return 'Item not matched in inventory';
  }
  const available = Number(row.currentStocks ?? row.current_stocks);
  const needed = Number(row.quantity) || 0;
  if (!Number.isFinite(available)) return 'Unable to verify current warehouse stock';
  if (available <= 0) return `Out of stock (needs ${needed})`;
  if (available < needed) return `Only ${available} available, needs ${needed}`;
  return 'Cannot ship';
}

function toInvoiceLineDraft(row) {
  const quantity = Number(row.quantity) || 0;
  const unitPrice = money(row.internalSellingPrice ?? row.internal_selling_price ?? 0);
  return {
    requestId: row.requestId || row.request_id,
    categoryName: row.categoryName || row.category_name || null,
    itemName: itemLabel(row),
    sku: row.matchedSku || row.matched_sku || null,
    variation: variationLabel(row) || null,
    quantity,
    unitPrice,
    lineTotal: money(quantity * unitPrice),
    externalReference: row.externalReference || row.external_reference || null,
  };
}

function shapeInvoice(header, lines) {
  return {
    ...camelize(header),
    lines: camelize(lines || []),
  };
}

async function loadInvoiceWithLines(invoiceId, db = pool) {
  const header = await db.query(
    `SELECT inv.*, u.full_name AS created_by_name
     FROM stock_request_invoices inv
     LEFT JOIN users u ON u.user_id = inv.created_by
     WHERE inv.invoice_id = $1`,
    [invoiceId],
  );
  if (!header.rowCount) throw new AppError(404, 'INVOICE_NOT_FOUND', 'Stock request invoice was not found');
  const lines = await db.query(
    `SELECT * FROM stock_request_invoice_lines WHERE invoice_id = $1 ORDER BY created_at ASC`,
    [invoiceId],
  );
  return shapeInvoice(header.rows[0], lines.rows);
}

async function nextShipmentSeq(sourceSystem, batchReference, db = pool) {
  const result = await db.query(
    `SELECT COALESCE(MAX(shipment_seq), 0) + 1 AS next_seq
     FROM stock_request_invoices
     WHERE source_system = $1 AND batch_reference = $2`,
    [sourceSystem, batchReference],
  );
  return Number(result.rows[0].next_seq) || 1;
}

function assertSameGroup(rows) {
  if (!rows.length) throw new AppError(400, 'NO_REQUESTS', 'Select at least one stock request line');
  const keys = new Set(rows.map(groupKey));
  if (keys.size > 1) {
    throw new AppError(400, 'MIXED_BATCH', 'Invoice lines must belong to one stock request group');
  }
  const branches = new Set(rows.map(branchKey));
  if (branches.size > 1) {
    throw new AppError(400, 'MIXED_BRANCH', 'Invoice lines must be for one branch');
  }
}

export async function previewStockRequestInvoice(requestIds) {
  const rows = await loadStockRequestRowsByIds(requestIds);
  if (rows.length !== requestIds.length) {
    throw new AppError(404, 'REQUEST_NOT_FOUND', 'One or more stock request lines were not found');
  }
  assertSameGroup(rows);

  const ready = rows.filter(isShippablePreview);
  const blocked = rows
    .filter((row) => !isShippablePreview(row))
    .map((row) => ({
      requestId: row.requestId,
      itemName: itemLabel(row),
      reason: blockedReason(row),
    }));

  const first = rows[0];
  const sourceSystem = first.sourceSystem || 'PSMS';
  const batchReference = first.batchReference || first.externalReference || first.requestId;
  const lines = ready.map(toInvoiceLineDraft);
  const subtotal = money(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const shipmentSeq = await nextShipmentSeq(sourceSystem, batchReference);

  return {
    draft: true,
    invoiceNumber: null,
    shipmentSeq,
    sourceSystem,
    batchReference,
    branchName: first.branchName || null,
    requestedBy: first.requestedBy,
    reason: first.reason,
    currency: 'PHP',
    lines,
    subtotal,
    zeroPriceCount: lines.filter((line) => line.unitPrice <= 0).length,
    blocked,
    requestedLineCount: rows.length,
    shippableLineCount: ready.length,
  };
}

export async function issueStockRequestInvoiceAndShip(requestIds, admin) {
  const preview = await previewStockRequestInvoice(requestIds);
  if (!preview.shippableLineCount) {
    throw new AppError(
      409,
      'NO_SHIPPABLE_LINES',
      'No pending lines in this group have enough warehouse stock to ship',
    );
  }

  const readyIds = preview.lines.map((line) => line.requestId);
  const adminId = typeof admin === 'object' ? admin.user_id || admin.userId : admin;
  let invoiceId = null;

  await withTransaction(async (db) => {
    const orderedIds = [...readyIds].sort();
    const shipmentSeq = await nextShipmentSeq(preview.sourceSystem, preview.batchReference, db);
    const numberRow = await db.query('SELECT nextval(\'stock_request_invoice_number_seq\') AS n');
    const year = new Date().getFullYear();
    const invoiceNumber = `INV-SR-${year}-${String(numberRow.rows[0].n).padStart(5, '0')}`;

    const header = await db.query(
      `INSERT INTO stock_request_invoices (
        invoice_number, source_system, batch_reference, branch_name, requested_by, reason,
        shipment_seq, currency, subtotal, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *`,
      [
        invoiceNumber,
        preview.sourceSystem,
        preview.batchReference,
        preview.branchName,
        preview.requestedBy,
        preview.reason,
        shipmentSeq,
        'PHP',
        preview.subtotal,
        adminId || null,
      ],
    );
    invoiceId = header.rows[0].invoice_id;

    for (const line of preview.lines) {
      await db.query(
        `INSERT INTO stock_request_invoice_lines (
          invoice_id, request_id, category_name, item_name, sku, variation,
          quantity, unit_price, line_total
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          invoiceId,
          line.requestId,
          line.categoryName,
          line.itemName,
          line.sku,
          line.variation,
          line.quantity,
          line.unitPrice,
          line.lineTotal,
        ],
      );
    }

    for (const id of orderedIds) {
      await shipStockRequestInDb(db, id, adminId);
    }
  });

  const shipped = [];
  for (const id of readyIds) {
    shipped.push(await finalizeShippedRequest(id, admin));
  }

  const invoice = await loadInvoiceWithLines(invoiceId);
  return {
    invoice,
    shipped,
    blocked: preview.blocked,
  };
}

export async function listStockRequestInvoices({ batchReference, sourceSystem = 'PSMS' }) {
  const headers = await pool.query(
    `SELECT inv.*, u.full_name AS created_by_name
     FROM stock_request_invoices inv
     LEFT JOIN users u ON u.user_id = inv.created_by
     WHERE inv.source_system = $1 AND inv.batch_reference = $2
     ORDER BY inv.shipment_seq ASC`,
    [sourceSystem, batchReference],
  );
  if (!headers.rowCount) return [];

  const ids = headers.rows.map((row) => row.invoice_id);
  const lines = await pool.query(
    `SELECT * FROM stock_request_invoice_lines
     WHERE invoice_id = ANY($1::uuid[])
     ORDER BY created_at ASC`,
    [ids],
  );
  const byInvoice = new Map();
  for (const line of lines.rows) {
    const list = byInvoice.get(line.invoice_id) || [];
    list.push(line);
    byInvoice.set(line.invoice_id, list);
  }
  return headers.rows.map((header) => shapeInvoice(header, byInvoice.get(header.invoice_id) || []));
}

export async function getStockRequestInvoice(invoiceId) {
  return loadInvoiceWithLines(invoiceId);
}
