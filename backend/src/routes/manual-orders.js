import { Router } from 'express';
import * as controller from '../controllers/manual-order.controller.js';
import { validate } from '../middleware/validate.js';
import {
  confirmManualReturnSchema,
  createManualOrderSchema,
  manualOrderIdParams,
  manualOrderListSchema,
  replaceManualOrderItemsSchema,
  updateManualFulfillmentSchema,
  updateManualOrderSchema,
} from '../validation/manual-order.schemas.js';

// Authenticated ADMIN and USER staff can manage HQ / Scoring courier orders.
export const manualOrders = Router();

manualOrders.get('/', validate(manualOrderListSchema), controller.list);
manualOrders.get('/:id', validate(manualOrderIdParams), controller.get);
manualOrders.post('/', validate(createManualOrderSchema), controller.create);
manualOrders.patch('/:id', validate(updateManualOrderSchema), controller.update);
manualOrders.put('/:id/items', validate(replaceManualOrderItemsSchema), controller.replaceItems);
manualOrders.post('/:id/fulfillment-status', validate(updateManualFulfillmentSchema), controller.updateFulfillmentStatus);
manualOrders.post('/:id/cancel', validate(manualOrderIdParams), controller.cancel);
manualOrders.post('/:id/confirm-return', validate(confirmManualReturnSchema), controller.confirmReturn);
