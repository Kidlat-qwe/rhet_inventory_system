import { Router } from 'express';
import * as controller from '../controllers/stock-request.controller.js';
import { validate } from '../middleware/validate.js';
import {
  rejectStockRequestSchema,
  stockRequestIdParams,
  stockRequestListSchema,
} from '../validation/stock-request.schemas.js';

export const stockRequests = Router();

stockRequests.get('/', validate(stockRequestListSchema), controller.list);
stockRequests.get('/:id', validate(stockRequestIdParams), controller.get);
stockRequests.post('/:id/approve', validate(stockRequestIdParams), controller.approve);
stockRequests.post('/:id/reject', validate(rejectStockRequestSchema), controller.reject);
