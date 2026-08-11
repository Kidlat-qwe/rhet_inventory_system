/** Scoring Shipping Management–aligned ranks (+ RHET return). */
export const FULFILLMENT_RANK = {
  PENDING: 0,
  NEEDS_ATTENTION: 1,
  PROCESSING: 2,
  SHIPPED: 3,
  DELIVERED: 4,
  RETURN: 5,
  RETURN_CONFIRMED: 6,
  INELIGIBLE: -1,
  ERROR: -2,
};

/**
 * Allowed transitions. READY_TO_SHIP removed — Processing goes straight to Shipped.
 * Return flow remains RHET-only for stock restock.
 */
export const FULFILLMENT_TRANSITIONS = {
  PENDING: ['PROCESSING', 'NEEDS_ATTENTION', 'INELIGIBLE', 'ERROR'],
  NEEDS_ATTENTION: ['PROCESSING', 'SHIPPED', 'INELIGIBLE', 'ERROR'],
  PROCESSING: ['SHIPPED', 'NEEDS_ATTENTION', 'INELIGIBLE', 'ERROR'],
  SHIPPED: ['DELIVERED', 'RETURN'],
  DELIVERED: ['RETURN'],
  RETURN: ['RETURN_CONFIRMED'],
  RETURN_CONFIRMED: [],
  INELIGIBLE: ['ERROR', 'PROCESSING'],
  ERROR: [],
};

export function shipmentRequiresDeduction(fromStatus, toStatus) {
  if (toStatus !== 'SHIPPED') return false;
  if (fromStatus === 'SHIPPED' || fromStatus === 'DELIVERED' || fromStatus === 'RETURN' || fromStatus === 'RETURN_CONFIRMED') {
    return false;
  }
  const fromRank = FULFILLMENT_RANK[fromStatus] ?? -1;
  return fromRank < FULFILLMENT_RANK.SHIPPED && fromRank >= 0;
}
