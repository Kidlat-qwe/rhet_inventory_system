import * as service from '../services/manual-order.service.js';
import { asyncHandler, success } from '../utils/api.js';

export const list = asyncHandler(async (req, res) => {
  const result = await service.listManualOrders(req.validated.query);
  const q = req.validated.query;
  success(res, result.data, {
    page: q.page,
    limit: q.limit,
    total: result.total,
    totalPages: Math.ceil(result.total / q.limit),
  });
});

export const get = asyncHandler(async (req, res) => {
  success(res, await service.getManualOrder(req.validated.params.id));
});

export const create = asyncHandler(async (req, res) => {
  success(res, await service.createManualOrder(req.validated.body, req.admin), {}, 201);
});

export const update = asyncHandler(async (req, res) => {
  success(res, await service.updateManualOrder(req.validated.params.id, req.validated.body));
});

export const replaceItems = asyncHandler(async (req, res) => {
  success(res, await service.replaceManualOrderItems(
    req.validated.params.id,
    req.validated.body.items,
  ));
});

export const updateFulfillmentStatus = asyncHandler(async (req, res) => {
  success(res, await service.updateFulfillmentStatus(
    req.validated.params.id,
    req.validated.body.status,
    req.admin,
  ));
});

export const cancel = asyncHandler(async (req, res) => {
  success(res, await service.cancelManualOrder(req.validated.params.id, req.admin));
});

export const confirmReturn = asyncHandler(async (req, res) => {
  success(res, await service.confirmReturn(
    req.validated.params.id,
    req.validated.body,
    req.admin,
  ));
});
