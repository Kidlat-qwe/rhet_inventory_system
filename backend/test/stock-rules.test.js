import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateStockChange } from '../src/services/stock-rules.js';

test('stock in adds units', () => {
  assert.deepEqual(calculateStockChange(10, { movementType: 'STOCK_IN', quantity: 5 }), { delta: 5, next: 15 });
});

test('released stock deducts units', () => {
  assert.deepEqual(calculateStockChange(10, { movementType: 'RELEASED', quantity: 4 }), { delta: -4, next: 6 });
});

test('adjustment calculates an auditable delta', () => {
  assert.deepEqual(calculateStockChange(10, { movementType: 'ADJUSTMENT', newStock: 7 }), { delta: -3, next: 7 });
});

test('cancelled transaction respects its explicit direction', () => {
  assert.deepEqual(calculateStockChange(10, { movementType: 'CANCELLED', quantity: 2, direction: 'ADD' }), { delta: 2, next: 12 });
});

test('a deduction cannot create negative stock', () => {
  assert.throws(() => calculateStockChange(2, { movementType: 'DAMAGED', quantity: 3 }), (error) => error.code === 'INSUFFICIENT_STOCK');
});

test('a no-op adjustment is rejected', () => {
  assert.throws(() => calculateStockChange(2, { movementType: 'ADJUSTMENT', newStock: 2 }), (error) => error.code === 'NO_STOCK_CHANGE');
});
