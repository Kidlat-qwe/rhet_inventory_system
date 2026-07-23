import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FULFILLMENT_TRANSITIONS,
  computeOrderStatus,
  decideLineOutcome,
  parseShopeeCsv,
} from '../src/services/online-order.service.js';

const sampleCsv = `Order ID,Username (Buyer),Order Creation Date,SKU Reference No.,Product Name,Variation Name,Quantity,Deal Price,Order Total
220101ABCDEF,buyer_one,2026-01-15 10:00,SHP-UNI-01,PE Uniform,Boys · Small · 28,2,450.00,900.00
220101ABCDEF,buyer_one,2026-01-15 10:00,SHP-BAG-01,School Bag,Blue,1,650.00,900.00
220102GHIJKL,buyer_two,2026-01-16 11:30,SHP-BOOK-01,Science Book,,1,320.00,320.00`;

test('parseShopeeCsv groups rows by order id', () => {
  const orders = parseShopeeCsv(sampleCsv);
  assert.equal(orders.length, 2);
  assert.equal(orders[0].externalOrderId, '220101ABCDEF');
  assert.equal(orders[0].items.length, 2);
  assert.equal(orders[0].items[0].externalSku, 'SHP-UNI-01');
  assert.equal(orders[0].items[0].quantity, 2);
  assert.equal(orders[1].externalOrderId, '220102GHIJKL');
  assert.equal(orders[1].items[0].quantity, 1);
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
