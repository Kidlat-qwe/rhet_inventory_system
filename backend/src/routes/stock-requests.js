import { Router } from 'express';
import * as controller from '../controllers/stock-request.controller.js';
import { validate } from '../middleware/validate.js';
import {
  rejectStockRequestSchema,
  returnStockRequestSchema,
  deliverStockRequestSchema,
  stockRequestIdParams,
  stockRequestListSchema,
} from '../validation/stock-request.schemas.js';

export const stockRequests = Router();

stockRequests.get('/', validate(stockRequestListSchema), controller.list);
stockRequests.get('/:id', validate(stockRequestIdParams), controller.get);
stockRequests.post('/:id/ship', validate(stockRequestIdParams), controller.ship);
stockRequests.post('/:id/deliver', validate(deliverStockRequestSchema), controller.deliver);
stockRequests.post('/:id/return', validate(returnStockRequestSchema), controller.markReturned);
stockRequests.post('/:id/reject', validate(rejectStockRequestSchema), controller.reject);
// Legacy alias — same as /ship (deduct + SHIPPED).
stockRequests.post('/:id/approve', validate(stockRequestIdParams), controller.approve);
