import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import {
  FULFILLMENT_TRANSITIONS,
  computeOrderStatus,
  decideLineOutcome,
  mapShopeeOrderStatusToFulfillment,
  parseShopeeCsv,
  parseShopeeOrders,
  shipmentRequiresDeduction,
  shouldApplyFulfillmentFromImport,
} from '../src/services/online-order.service.js';

const sampleCsv = `Order ID,Username (Buyer),Order Creation Date,Order Status,SKU Reference No.,Product Name,Variation Name,Quantity,Deal Price,Order Total
220101ABCDEF,buyer_one,2026-01-15 10:00,To Receive,SHP-UNI-01,PE Uniform,Boys · Small · 28,2,450.00,900.00
220101ABCDEF,buyer_one,2026-01-15 10:00,To Receive,SHP-BAG-01,School Bag,Blue,1,650.00,900.00
220102GHIJKL,buyer_two,2026-01-16 11:30,Completed,SHP-BOOK-01,Science Book,,1,320.00,320.00`;

test('parseShopeeCsv groups rows by order id', () => {
  const orders = parseShopeeCsv(sampleCsv);
  assert.equal(orders.length, 2);
  assert.equal(orders[0].externalOrderId, '220101ABCDEF');
  assert.equal(orders[0].items.length, 2);
  assert.equal(orders[0].items[0].externalSku, 'SHP-UNI-01');
  assert.equal(orders[0].items[0].quantity, 2);
  assert.equal(orders[0].fulfillmentStatus, 'SHIPPED');
  assert.equal(orders[0].externalOrderStatus, 'To Receive');
  assert.equal(orders[1].externalOrderId, '220102GHIJKL');
  assert.equal(orders[1].items[0].quantity, 1);
  assert.equal(orders[1].fulfillmentStatus, 'RECEIVED');
});

test('mapShopeeOrderStatusToFulfillment maps common Seller Centre labels', () => {
  assert.equal(mapShopeeOrderStatusToFulfillment('To Ship'), 'READY_TO_SHIP');
  assert.equal(mapShopeeOrderStatusToFulfillment('Shipped'), 'SHIPPED');
  assert.equal(mapShopeeOrderStatusToFulfillment('To Receive'), 'SHIPPED');
  assert.equal(mapShopeeOrderStatusToFulfillment('Completed'), 'RECEIVED');
  assert.equal(mapShopeeOrderStatusToFulfillment('Cancelled'), 'CANCELLED');
  assert.equal(mapShopeeOrderStatusToFulfillment(''), null);
});

test('parseShopeeCsv rejects raw Excel bytes pasted as text', () => {
  assert.throws(
    () => parseShopeeCsv('PK\u0003\u0004fake-xlsx-binary'),
    (error) => error.code === 'INVALID_FILE_TYPE' && error.status === 422,
  );
});

test('parseShopeeOrders accepts xlsx base64 payloads', () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet([
    {
      'Order ID': 'XLSX-ORDER-1',
      'Username (Buyer)': 'buyer_xlsx',
      'Order Creation Date': '2026-07-28 10:00',
      'Order Status': 'To ship',
      'SKU Reference No.': 'SHP-XLSX-01',
      'Product Name': 'PE Uniform',
      'Variation Name': 'XXL',
      Quantity: 2,
      'Deal Price': 450,
      'Order Total': 900,
    },
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'orders');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  const orders = parseShopeeOrders({
    fileBase64: Buffer.from(buffer).toString('base64'),
    fileName: 'orders.xlsx',
  });

  assert.equal(orders.length, 1);
  assert.equal(orders[0].externalOrderId, 'XLSX-ORDER-1');
  assert.equal(orders[0].items[0].externalSku, 'SHP-XLSX-01');
  assert.equal(orders[0].items[0].quantity, 2);
  assert.equal(orders[0].fulfillmentStatus, 'READY_TO_SHIP');
});


test('shipmentRequiresDeduction triggers at SHIPPED and beyond', () => {
  assert.equal(shipmentRequiresDeduction('READY_TO_SHIP', 'SHIPPED'), true);
  assert.equal(shipmentRequiresDeduction('PROCESSING', 'RECEIVED'), true);
  assert.equal(shipmentRequiresDeduction('SHIPPED', 'RECEIVED'), false);
  assert.equal(shipmentRequiresDeduction('READY_TO_SHIP', 'READY_TO_SHIP'), false);
  assert.equal(shipmentRequiresDeduction('SHIPPED', 'CANCELLED'), false);
});

test('shouldApplyFulfillmentFromImport advances only when export is newer', () => {
  assert.equal(shouldApplyFulfillmentFromImport('SHIPPED', 'SHIPPED'), false);
  assert.equal(shouldApplyFulfillmentFromImport('SHIPPED', 'RECEIVED'), true);
  assert.equal(shouldApplyFulfillmentFromImport('RECEIVED', 'SHIPPED'), false);
  assert.equal(shouldApplyFulfillmentFromImport('RETURN', 'RECEIVED'), false);
  assert.equal(shouldApplyFulfillmentFromImport(null, 'SHIPPED'), true);
  assert.equal(shouldApplyFulfillmentFromImport('READY_TO_SHIP', 'CANCELLED'), true);
  assert.equal(shouldApplyFulfillmentFromImport('CANCELLED', 'READY_TO_SHIP'), false);
  assert.equal(shouldApplyFulfillmentFromImport('RETURN', 'CANCELLED'), false);
});

test('computeOrderStatus returns FULFILLED when all lines are matched', () => {
  assert.equal(
    computeOrderStatus([{ line_status: 'MATCHED' }, { line_status: 'MATCHED' }]),
    'FULFILLED',
  );
});

test('computeOrderStatus still treats legacy DEDUCTED lines (Phase 1 data) as fulfilled', () => {
  assert.equal(
    computeOrderStatus([{ line_status: 'DEDUCTED' }, { line_status: 'MATCHED' }]),
    'FULFILLED',
  );
});

test('computeOrderStatus returns NEEDS_ATTENTION when a line is unmatched', () => {
  assert.equal(
    computeOrderStatus([{ line_status: 'MATCHED' }, { line_status: 'UNMATCHED' }]),
    'NEEDS_ATTENTION',
  );
});

test('computeOrderStatus returns CANCELLED when all lines are cancelled', () => {
  assert.equal(
    computeOrderStatus([{ line_status: 'CANCELLED' }, { line_status: 'CANCELLED' }]),
    'CANCELLED',
  );
});

test('decideLineOutcome marks unmatched items', () => {
  assert.deepEqual(decideLineOutcome({ hasMapping: false }), {
    lineStatus: 'UNMATCHED',
    failureReason: 'No SKU mapping found for this channel item',
  });
});

test('decideLineOutcome marks matched items (no stock deduction — allocation model)', () => {
  assert.deepEqual(decideLineOutcome({ hasMapping: true }), {
    lineStatus: 'MATCHED',
    failureReason: null,
  });
});

test('fulfillment transitions only allow the documented forward moves', () => {
  assert.deepEqual(FULFILLMENT_TRANSITIONS.PROCESSING, ['READY_TO_SHIP']);
  assert.deepEqual(FULFILLMENT_TRANSITIONS.READY_TO_SHIP, ['SHIPPED']);
  assert.deepEqual(FULFILLMENT_TRANSITIONS.SHIPPED, ['RECEIVED', 'RETURN']);
  assert.deepEqual(FULFILLMENT_TRANSITIONS.RECEIVED, ['RETURN']);
  assert.deepEqual(FULFILLMENT_TRANSITIONS.RETURN, []);
  assert.deepEqual(FULFILLMENT_TRANSITIONS.RETURN_CONFIRMED, []);
  assert.deepEqual(FULFILLMENT_TRANSITIONS.CANCELLED, []);
});

test('legacy ONLINE_SALE movements still deduct units through stock rules', async () => {
  const { calculateStockChange } = await import('../src/services/stock-rules.js');
  assert.deepEqual(calculateStockChange(10, { movementType: 'ONLINE_SALE', quantity: 4 }), { delta: -4, next: 6 });
});

test('CHANNEL_ALLOCATION deducts RHET stock when allocating to a channel', async () => {
  const { calculateStockChange } = await import('../src/services/stock-rules.js');
  assert.deepEqual(
    calculateStockChange(100, { movementType: 'CHANNEL_ALLOCATION', quantity: 20, direction: 'DEDUCT' }),
    { delta: -20, next: 80 },
  );
});

test('CHANNEL_ALLOCATION restores RHET stock when deallocating from a channel', async () => {
  const { calculateStockChange } = await import('../src/services/stock-rules.js');
  assert.deepEqual(
    calculateStockChange(80, { movementType: 'CHANNEL_ALLOCATION', quantity: 5, direction: 'ADD' }),
    { delta: 5, next: 85 },
  );
});

test('RETURN movement restores RHET stock for a reusable return', async () => {
  const { calculateStockChange } = await import('../src/services/stock-rules.js');
  assert.deepEqual(
    calculateStockChange(80, { movementType: 'RETURN', quantity: 1 }),
    { delta: 1, next: 81 },
  );
});
