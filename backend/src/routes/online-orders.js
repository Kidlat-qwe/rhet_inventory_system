import { Router } from 'express';
import * as controller from '../controllers/online-order.controller.js';
import { requireAdminRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  importOnlineOrdersSchema,
  manualOnlineOrderSchema,
  mappingListSchema,
  onlineOrderIdParams,
  onlineOrderItemIdParams,
  onlineOrderListSchema,
  resolveOnlineOrderItemSchema,
} from '../validation/online-order.schemas.js';

export const onlineOrders = Router();

onlineOrders.get('/mappings', validate(mappingListSchema), controller.mappings);
onlineOrders.get('/', validate(onlineOrderListSchema), controller.list);
onlineOrders.get('/:id', validate(onlineOrderIdParams), controller.get);
onlineOrders.post('/import', requireAdminRole, validate(importOnlineOrdersSchema), controller.importCsv);
onlineOrders.post('/manual', requireAdminRole, validate(manualOnlineOrderSchema), controller.createManual);
onlineOrders.post('/items/:id/resolve', requireAdminRole, validate(resolveOnlineOrderItemSchema), controller.resolveItem);
onlineOrders.post('/items/:id/cancel', requireAdminRole, validate(onlineOrderItemIdParams), controller.cancelItem);
onlineOrders.post('/:id/cancel', requireAdminRole, validate(onlineOrderIdParams), controller.cancel);
