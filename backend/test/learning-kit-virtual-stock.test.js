import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAvailableKits, isLearningKitCategoryName } from '../src/services/inventory.service.js';

test('computeAvailableKits uses pinned component stocks when present', async () => {
  const available = await computeAvailableKits([
    { isPinned: true, stocks: 11, quantity: 1 },
    { isPinned: true, stocks: 13, quantity: 1 },
    { isPinned: true, stocks: 15, quantity: 1 },
  ]);
  assert.equal(available, 11);
});

test('computeAvailableKits returns 0 for empty BOM', async () => {
  assert.equal(await computeAvailableKits([]), 0);
});

test('isLearningKitCategoryName matches Learning Kit only', () => {
  assert.equal(isLearningKitCategoryName('Learning Kit'), true);
  assert.equal(isLearningKitCategoryName('Backpack'), false);
});

test('deriveStockStatus follows computed kit quantity', async () => {
  const { deriveStockStatus } = await import('../src/services/inventory.service.js');
  assert.equal(deriveStockStatus({ lifecycleStatus: 'ACTIVE', stocks: 99, lowStockThreshold: 5 }), 'ACTIVE');
  assert.equal(deriveStockStatus({ lifecycleStatus: 'ACTIVE', stocks: 0, lowStockThreshold: 5 }), 'OUT_OF_STOCK');
  assert.equal(deriveStockStatus({ lifecycleStatus: 'ACTIVE', stocks: 3, lowStockThreshold: 5 }), 'LOW_STOCK');
  assert.equal(deriveStockStatus({ lifecycleStatus: 'INACTIVE', stocks: 99, lowStockThreshold: 5 }), 'INACTIVE');
});
