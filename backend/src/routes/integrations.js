import { Router } from 'express';
import * as controller from '../controllers/integration.controller.js';
import { validate } from '../middleware/validate.js';
import {
  availabilityQuerySchema,
  deliverStockRequestSchema,
  psmsStockRequestSchema,
  stockRequestIdParams,
} from '../validation/stock-request.schemas.js';
import {
  integrationCreateManualOrderSchema,
  integrationManualFulfillmentByRefSchema,
  integrationManualFulfillmentSchema,
  integrationManualOrderIdParams,
  integrationManualOrderReferenceParams,
} from '../validation/manual-order.schemas.js';

export const integrations = Router();

integrations.get('/catalog', controller.catalog);
integrations.get('/availability', validate(availabilityQuerySchema), controller.availability);
integrations.post('/stock-requests', validate(psmsStockRequestSchema), controller.submit);
integrations.get('/stock-requests/:id', validate(stockRequestIdParams), controller.get);
integrations.post('/stock-requests/:id/deliver', validate(deliverStockRequestSchema), controller.deliver);

// Scoring Shipping Management → Manual Orders (non-Shopee courier)
integrations.post('/manual-orders', validate(integrationCreateManualOrderSchema), controller.createManualOrder);
integrations.get(
  '/manual-orders/by-reference/:reference',
  validate(integrationManualOrderReferenceParams),
  controller.getManualOrderByReference,
);
integrations.post(
  '/manual-orders/by-reference/:reference/fulfillment-status',
  validate(integrationManualFulfillmentByRefSchema),
  controller.updateManualOrderFulfillmentByReference,
);
integrations.get('/manual-orders/:id', validate(integrationManualOrderIdParams), controller.getManualOrder);
integrations.post(
  '/manual-orders/:id/fulfillment-status',
  validate(integrationManualFulfillmentSchema),
  controller.updateManualOrderFulfillment,
);
