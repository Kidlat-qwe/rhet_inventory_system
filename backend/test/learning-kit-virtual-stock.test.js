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

test('isToolKitCategoryName matches Tool Kit only', async () => {
  const { isToolKitCategoryName, isVirtualKitCategory, isToolKitCategory } = await import('../src/services/inventory.service.js');
  assert.equal(isToolKitCategoryName('Tool Kit'), true);
  assert.equal(isToolKitCategoryName('Learning Kit'), false);
  assert.equal(isVirtualKitCategory({ category_kind: 'TOOL_KIT' }), true);
  assert.equal(isVirtualKitCategory({ category_kind: 'OTHER' }), false);
  assert.equal(isToolKitCategory({ category_kind: 'OTHER', has_child_skus: true }), true);
  assert.equal(isToolKitCategory({ category_kind: 'OTHER', hasChildSkus: true }), true);
  assert.equal(isToolKitCategory({ category_kind: 'OTHER', has_child_skus: false }), false);
});

test('computeAvailableKits pinned BOM matches scarcest raw item', async () => {
  const available = await computeAvailableKits([
    { isPinned: true, stocks: 49, quantity: 1 },
    { isPinned: true, stocks: 30, quantity: 1 },
    { isPinned: true, stocks: 40, quantity: 1 },
  ]);
  assert.equal(available, 30);
});

test('deriveStockStatus follows computed kit quantity', async () => {
  const { deriveStockStatus } = await import('../src/services/inventory.service.js');
  assert.equal(deriveStockStatus({ lifecycleStatus: 'ACTIVE', stocks: 99, lowStockThreshold: 5 }), 'ACTIVE');
  assert.equal(deriveStockStatus({ lifecycleStatus: 'ACTIVE', stocks: 0, lowStockThreshold: 5 }), 'OUT_OF_STOCK');
  assert.equal(deriveStockStatus({ lifecycleStatus: 'ACTIVE', stocks: 3, lowStockThreshold: 5 }), 'LOW_STOCK');
  assert.equal(deriveStockStatus({ lifecycleStatus: 'INACTIVE', stocks: 99, lowStockThreshold: 5 }), 'INACTIVE');
});
