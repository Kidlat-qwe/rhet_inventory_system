import * as service from '../services/stock-request.service.js';
import * as stockReturnService from '../services/stock-return.service.js';
import * as manualOrderService from '../services/manual-order.service.js';
import { AppError, asyncHandler, success } from '../utils/api.js';

export const submit = asyncHandler(async (req, res) => {
  const body = req.validated.body;
  const data = await service.createStockRequestsFromPsms({
    sourceSystem: req.integration?.sourceSystem,
    requestDate: body.requestDate || new Date(),
    requestedBy: body.requestedBy,
    branchName: body.branchName,
    reason: body.reason,
    batchReference: body.batchReference,
    webhookUrl: body.webhookUrl,
    items: body.items,
  });
  success(res, data, { count: data.length }, 201);
});

export const submitReturns = asyncHandler(async (req, res) => {
  const body = req.validated.body;
  const result = await stockReturnService.createStockReturnsFromPsms({
    sourceSystem: req.integration?.sourceSystem,
    requestDate: body.requestDate || new Date(),
    requestedBy: body.requestedBy,
    branchName: body.branchName,
    reason: body.reason,
    batchReference: body.batchReference,
    webhookUrl: body.webhookUrl,
    items: body.items,
  });
  success(res, result.data, { count: result.data.length, replayed: !result.created }, result.created ? 201 : 200);
});

export const get = asyncHandler(async (req, res) => {
  success(res, await service.getStockRequest(req.validated.params.id));
});

export const getByReference = asyncHandler(async (req, res) => {
  try {
    success(res, await service.getStockRequestByReference(req.validated.params.reference));
  } catch (error) {
    if (error instanceof AppError && error.status === 404) throw error;
    throw error;
  }
});

export const availability = asyncHandler(async (req, res) => {
  success(res, await service.getAvailability(req.validated.query));
});

export const catalog = asyncHandler(async (_req, res) => {
  success(res, await service.getIntegrationCatalog());
});

/** CMS branch admin confirms physical receipt → SHIPPED → DELIVERED (no re-deduct). */
export const deliver = asyncHandler(async (req, res) => {
  const body = req.validated.body || {};
  success(res, await service.deliverStockRequest(req.validated.params.id, {
    confirmedBy: body.confirmedBy,
    branchName: body.branchName,
    notes: body.notes,
  }));
});

/** Scoring Shipping Management → Manual Orders (header-only). */
export const createManualOrder = asyncHandler(async (req, res) => {
  const body = req.validated.body;
  const data = await manualOrderService.createManualOrderFromIntegration({
    ...body,
    items: [],
    sourceSystem: req.integration.sourceSystem,
    webhookUrl: body.webhookUrl || req.integration.webhookUrl || null,
  });
  success(res, data, {}, 201);
});

export const getManualOrder = asyncHandler(async (req, res) => {
  const order = await manualOrderService.getManualOrder(req.validated.params.id);
  if (order.sourceSystem) {
    const owner = String(order.sourceSystem).toUpperCase();
    const caller = String(req.integration.sourceSystem || '').toUpperCase();
    if (owner !== caller) {
      throw new AppError(403, 'ORDER_FORBIDDEN', 'This manual order belongs to a different integration system');
    }
  } else {
    throw new AppError(403, 'ORDER_NOT_INTEGRATION', 'This manual order was not created by an integration partner');
  }
  success(res, order);
});

export const getManualOrderByReference = asyncHandler(async (req, res) => {
  success(res, await manualOrderService.getManualOrderByExternalReference(
    req.validated.params.reference,
    req.integration.sourceSystem,
  ));
});

export const updateManualOrderFulfillment = asyncHandler(async (req, res) => {
  success(res, await manualOrderService.updateFulfillmentFromIntegration(
    req.validated.params.id,
    req.validated.body.status,
    req.integration.sourceSystem,
  ));
});

export const updateManualOrderFulfillmentByReference = asyncHandler(async (req, res) => {
  success(res, await manualOrderService.updateFulfillmentFromIntegrationByReference(
    req.validated.params.reference,
    req.validated.body.status,
    req.integration.sourceSystem,
  ));
});
