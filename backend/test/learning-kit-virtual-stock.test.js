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
