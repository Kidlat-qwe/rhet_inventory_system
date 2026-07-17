import { AppError } from '../utils/api.js';

const positiveTypes = new Set(['STOCK_IN', 'RETURN']);
const negativeTypes = new Set(['STOCK_OUT', 'DAMAGED', 'RELEASED']);

export function calculateStockChange(previous, input) {
  let delta;
  if (input.movementType === 'ADJUSTMENT') delta = input.newStock - previous;
  else if (positiveTypes.has(input.movementType)) delta = input.quantity;
  else if (negativeTypes.has(input.movementType)) delta = -input.quantity;
  else delta = input.direction === 'ADD' ? input.quantity : -input.quantity;

  if (delta === 0) throw new AppError(422, 'NO_STOCK_CHANGE', 'The transaction does not change the stock quantity');
  const next = previous + delta;
  if (next < 0) throw new AppError(409, 'INSUFFICIENT_STOCK', `Only ${previous} unit(s) are available`);
  return { delta, next };
}
