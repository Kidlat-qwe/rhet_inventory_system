import assert from 'node:assert/strict';
import test from 'node:test';
import {
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

test('computeOrderStatus returns FULFILLED when all lines are deducted', () => {
  assert.equal(
    computeOrderStatus([{ line_status: 'DEDUCTED' }, { line_status: 'DEDUCTED' }]),
    'FULFILLED',
  );
});

test('computeOrderStatus returns NEEDS_ATTENTION when a line is unmatched or oversold', () => {
  assert.equal(
    computeOrderStatus([{ line_status: 'DEDUCTED' }, { line_status: 'UNMATCHED' }]),
    'NEEDS_ATTENTION',
  );
  assert.equal(
    computeOrderStatus([{ line_status: 'OVERSOLD' }]),
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
  assert.deepEqual(decideLineOutcome({ hasMapping: false, availableStock: 10, quantity: 1 }), {
    lineStatus: 'UNMATCHED',
    failureReason: 'No SKU mapping found for this channel item',
  });
});

test('decideLineOutcome marks oversold items', () => {
  assert.deepEqual(decideLineOutcome({ hasMapping: true, availableStock: 1, quantity: 3 }), {
    lineStatus: 'OVERSOLD',
    failureReason: 'Only 1 unit(s) available, but 3 requested',
  });
});

test('decideLineOutcome allows deduction when stock is sufficient', () => {
  assert.deepEqual(decideLineOutcome({ hasMapping: true, availableStock: 5, quantity: 3 }), {
    lineStatus: 'DEDUCTED',
    failureReason: null,
  });
});

test('online sale deducts units through stock rules', async () => {
  const { calculateStockChange } = await import('../src/services/stock-rules.js');
  assert.deepEqual(calculateStockChange(10, { movementType: 'ONLINE_SALE', quantity: 4 }), { delta: -4, next: 6 });
});
