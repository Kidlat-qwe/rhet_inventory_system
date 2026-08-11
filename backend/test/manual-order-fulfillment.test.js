import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FULFILLMENT_TRANSITIONS,
  shipmentRequiresDeduction,
} from '../src/services/manual-order-fulfillment.js';

describe('manual order fulfillment (Shipping Management–aligned)', () => {
  it('removes READY_TO_SHIP and allows Processing → Shipped', () => {
    assert.ok(!Object.prototype.hasOwnProperty.call(FULFILLMENT_TRANSITIONS, 'READY_TO_SHIP'));
    assert.deepEqual(FULFILLMENT_TRANSITIONS.PROCESSING, [
      'SHIPPED',
      'NEEDS_ATTENTION',
      'INELIGIBLE',
      'ERROR',
    ]);
  });

  it('deducts stock only when entering SHIPPED', () => {
    assert.equal(shipmentRequiresDeduction('PROCESSING', 'SHIPPED'), true);
    assert.equal(shipmentRequiresDeduction('NEEDS_ATTENTION', 'SHIPPED'), true);
    assert.equal(shipmentRequiresDeduction('PROCESSING', 'NEEDS_ATTENTION'), false);
    assert.equal(shipmentRequiresDeduction('SHIPPED', 'DELIVERED'), false);
  });

  it('supports Delivered and Error paths', () => {
    assert.deepEqual(FULFILLMENT_TRANSITIONS.SHIPPED, ['DELIVERED', 'RETURN']);
    assert.deepEqual(FULFILLMENT_TRANSITIONS.DELIVERED, ['RETURN']);
    assert.deepEqual(FULFILLMENT_TRANSITIONS.ERROR, []);
  });
});
