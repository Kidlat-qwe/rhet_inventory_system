import * as XLSX from 'xlsx';

const EXPORT_HEADERS = [
  'Request ID',
  'Batch reference',
  'External reference',
  'Branch',
  'Requested by',
  'Source system',
  'Item',
  'SKU',
  'Variation',
  'Category',
  'Quantity',
  'Selling price',
  'Amount',
  'Status',
  'Requested at',
  'Delivered at',
  'Delivery confirmed by',
  'Reason',
];

const AMOUNT_COLUMN_INDEX = EXPORT_HEADERS.indexOf('Amount');

function safeText(value) {
  const text = String(value ?? '').trim();
  return text;
}

function buildExportRow(row, branchName) {
  const qty = Number(row.quantity) || 0;
  const price = Number(row.sellingPrice ?? row.price) || 0;
  return [
    row.requestId || row.request_id || '',
    safeText(row.batchReference || row.batch_reference),
    safeText(row.externalReference || row.external_reference),
    safeText(branchName || row.branchName || row.branch_name),
    safeText(row.requestedBy || row.requested_by),
    safeText(row.sourceSystem || row.source_system),
    safeText(row.itemLabel || row.itemName || row.item_name || row.categoryName || row.category_name || 'Item'),
    safeText(row.sku || row.matchedSku || row.matched_sku),
    safeText(row.variation),
    safeText(row.categoryName || row.category_name),
    qty,
    price,
    qty * price,
    'DELIVERED',
    safeText(row.requestedAtLabel || row.requestDateLabel || ''),
    safeText(row.deliveredAtLabel || row.deliveredAt || row.delivered_at),
    safeText(row.deliveryConfirmedBy || row.delivery_confirmed_by),
    safeText(row.reason),
  ];
}

/**
 * Build an XLSX buffer for one branch's delivered lines.
 * Amount = quantity × inventory selling price (`price`).
 * @param {{
 *   organizationName?: string,
 *   branchName: string,
 *   periodLabel?: string,
 *   generatedAtLabel?: string,
 *   rows?: object[],
 * }} input
 * @returns {Buffer}
 */
export function buildBranchDeliveredXlsx(input) {
  const {
    branchName = 'No branch',
    periodLabel = '',
    generatedAtLabel = '',
    rows = [],
  } = input;

  const dataRows = rows.map((row) => buildExportRow(row, branchName));
  const totalAmount = dataRows.reduce((sum, row) => sum + Number(row[AMOUNT_COLUMN_INDEX] || 0), 0);
  const totalRow = EXPORT_HEADERS.map((_, columnIndex) => {
    if (columnIndex === AMOUNT_COLUMN_INDEX - 1) return 'Total';
    if (columnIndex === AMOUNT_COLUMN_INDEX) return totalAmount;
    return '';
  });

  const metaRows = [
    ['Branch', branchName],
    ['Period', periodLabel],
    ['Generated', generatedAtLabel],
    ['Lines', rows.length],
    [],
  ];

  const sheetRows = [
    ...metaRows,
    EXPORT_HEADERS,
    ...dataRows,
    [],
    totalRow,
  ];

  if (!rows.length) {
    sheetRows.push([]);
    sheetRows.push(['No delivered items for this branch in the selected period.']);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  worksheet['!cols'] = EXPORT_HEADERS.map((header, columnIndex) => {
    const maxCellLength = dataRows.reduce((max, row) => {
      const cell = String(row[columnIndex] ?? '');
      return Math.max(max, cell.length);
    }, Math.max(header.length, columnIndex === AMOUNT_COLUMN_INDEX - 1 ? 5 : 0));
    return { wch: Math.min(Math.max(maxCellLength + 2, 10), 48) };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Delivered');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
