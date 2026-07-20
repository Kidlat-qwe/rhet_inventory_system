import * as service from '../services/online-order.service.js';
import { asyncHandler, success } from '../utils/api.js';

export const list = asyncHandler(async (req, res) => {
  const result = await service.listOrders(req.validated.query);
  const q = req.validated.query;
  success(res, result.data, {
    page: q.page,
    limit: q.limit,
    total: result.total,
    totalPages: Math.ceil(result.total / q.limit),
  });
});

export const get = asyncHandler(async (req, res) => {
  success(res, await service.getOrder(req.validated.params.id));
});

export const importCsv = asyncHandler(async (req, res) => {
  const { csvText, channel } = req.validated.body;
  const data = await service.importOrdersFromCsv(csvText, req.admin.user_id, channel);
  success(res, data, { count: data.length }, 201);
});

export const createManual = asyncHandler(async (req, res) => {
  const data = await service.createManualOrder(req.validated.body, req.admin.user_id);
  success(res, data, null, 201);
});

export const resolveItem = asyncHandler(async (req, res) => {
  success(res, await service.resolveOrderItem(
    req.validated.params.id,
    req.validated.body.inventoryId,
    req.admin,
  ));
});

export const cancelItem = asyncHandler(async (req, res) => {
  success(res, await service.cancelOrderItem(req.validated.params.id, req.admin));
});

export const cancel = asyncHandler(async (req, res) => {
  success(res, await service.cancelOrder(req.validated.params.id, req.admin));
});

export const mappings = asyncHandler(async (req, res) => {
  success(res, await service.listMappings(req.validated.query));
});
