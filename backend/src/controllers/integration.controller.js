import * as service from '../services/stock-request.service.js';
import { AppError, asyncHandler, success } from '../utils/api.js';

export const submit = asyncHandler(async (req, res) => {
  const body = req.validated.body;
  const data = await service.createStockRequestsFromPsms({
    sourceSystem: req.integration?.sourceSystem,
    requestDate: body.requestDate || new Date(),
    requestedBy: body.requestedBy,
    reason: body.reason,
    batchReference: body.batchReference,
    webhookUrl: body.webhookUrl,
    items: body.items,
  });
  success(res, data, { count: data.length }, 201);
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
