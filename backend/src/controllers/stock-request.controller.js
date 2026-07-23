import * as service from '../services/stock-request.service.js';
import { asyncHandler, success } from '../utils/api.js';

export async function list(req, res) {
  const result = await service.listStockRequests(req.validated.query);
  const q = req.validated.query;
  success(res, result.data, {
    page: q.page,
    limit: q.limit,
    total: result.total,
    totalPages: Math.ceil(result.total / q.limit),
  });
}

export async function get(req, res) {
  success(res, await service.getStockRequest(req.validated.params.id));
}

export async function approve(req, res) {
  success(res, await service.approveStockRequest(req.validated.params.id, req.admin));
}

export async function reject(req, res) {
  success(res, await service.rejectStockRequest(
    req.validated.params.id,
    req.admin,
    req.validated.body.rejectionReason,
  ));
}
