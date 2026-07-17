import { Router } from 'express';
import * as controller from '../controllers/integration.controller.js';
import { validate } from '../middleware/validate.js';
import {
  availabilityQuerySchema,
  psmsStockRequestSchema,
  stockRequestIdParams,
} from '../validation/stock-request.schemas.js';

export const integrations = Router();

integrations.get('/catalog', controller.catalog);
integrations.get('/availability', validate(availabilityQuerySchema), controller.availability);
integrations.post('/stock-requests', validate(psmsStockRequestSchema), controller.submit);
integrations.get('/stock-requests/:id', validate(stockRequestIdParams), controller.get);
