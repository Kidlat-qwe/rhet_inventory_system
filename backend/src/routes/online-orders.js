import { Router } from 'express';
import * as controller from '../controllers/online-order.controller.js';
import { validate } from '../middleware/validate.js';
import {
  confirmReturnSchema,
  importOnlineOrdersSchema,
  manualOnlineOrderSchema,
  mappingListSchema,
  onlineOrderIdParams,
  onlineOrderItemIdParams,
  onlineOrderListSchema,
  resolveOnlineOrderItemSchema,
  updateFulfillmentStatusSchema,
} from '../validation/online-order.schemas.js';

// Authenticated ADMIN and USER staff can manage online orders (import, map, fulfill).
// Admin-only gate was removed so warehouse users can process Shopee exports too.
export const onlineOrders = Router();

onlineOrders.get('/mappings', validate(mappingListSchema), controller.mappings);
onlineOrders.get('/', validate(onlineOrderListSchema), controller.list);
onlineOrders.get('/:id', validate(onlineOrderIdParams), controller.get);
onlineOrders.post('/import/preview', validate(importOnlineOrdersSchema), controller.previewImportCsv);
onlineOrders.post('/import', validate(importOnlineOrdersSchema), controller.importCsv);
onlineOrders.post('/manual', validate(manualOnlineOrderSchema), controller.createManual);
onlineOrders.post('/items/:id/resolve', validate(resolveOnlineOrderItemSchema), controller.resolveItem);
onlineOrders.post('/items/:id/cancel', validate(onlineOrderItemIdParams), controller.cancelItem);
onlineOrders.post('/:id/cancel', validate(onlineOrderIdParams), controller.cancel);
onlineOrders.post('/:id/fulfillment-status', validate(updateFulfillmentStatusSchema), controller.updateFulfillmentStatus);
onlineOrders.post('/:id/confirm-return', validate(confirmReturnSchema), controller.confirmReturn);
