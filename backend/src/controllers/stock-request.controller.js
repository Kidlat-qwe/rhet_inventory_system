import * as service from '../services/stock-request.service.js';
import * as invoiceService from '../services/stock-request-invoice.service.js';
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

export async function ship(req, res) {
  success(res, await service.shipStockRequest(req.validated.params.id, req.admin));
}

/** @deprecated Prefer POST /:id/ship */
export async function approve(req, res) {
  success(res, await service.shipStockRequest(req.validated.params.id, req.admin));
}

export async function deliver(req, res) {
  success(res, await service.deliverStockRequest(req.validated.params.id, {
    admin: req.admin,
    confirmedBy: req.validated.body?.confirmedBy,
    branchName: req.validated.body?.branchName,
    notes: req.validated.body?.notes,
  }));
}

export async function markReturned(req, res) {
  success(res, await service.returnStockRequest(
    req.validated.params.id,
    req.admin,
    req.validated.body?.notes || null,
  ));
}

export async function reject(req, res) {
  success(res, await service.rejectStockRequest(
    req.validated.params.id,
    req.admin,
    req.validated.body.rejectionReason,
  ));
}

export async function previewInvoice(req, res) {
  success(res, await invoiceService.previewStockRequestInvoice(req.validated.body.requestIds));
}

export async function issueInvoiceAndShip(req, res) {
  success(res, await invoiceService.issueStockRequestInvoiceAndShip(
    req.validated.body.requestIds,
    req.admin,
  ));
}

export async function listInvoices(req, res) {
  success(res, await invoiceService.listStockRequestInvoices({
    batchReference: req.validated.query.batchReference,
    sourceSystem: req.validated.query.sourceSystem || 'PSMS',
  }));
}

export async function getInvoice(req, res) {
  success(res, await invoiceService.getStockRequestInvoice(req.validated.params.invoiceId));
}
