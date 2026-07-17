import * as inventory from '../services/inventory.service.js';
import { success } from '../utils/api.js';

export async function list(req, res) {
  const result = await inventory.listInventory(req.validated.query);
  const q = req.validated.query;
  success(res, result.data, { page: q.page, limit: q.limit, total: result.total, totalPages: Math.ceil(result.total / q.limit) });
}
export async function get(req, res) { success(res, await inventory.getInventory(req.validated.params.id)); }
export async function create(req, res) { success(res, await inventory.createInventory(req.validated.body, req.admin.user_id), null, 201); }
export async function update(req, res) { success(res, await inventory.updateInventory(req.validated.params.id, req.validated.body, req.admin.user_id)); }
export async function move(req, res) { success(res, await inventory.createMovement(req.validated.params.id, req.validated.body, req.admin.user_id), null, 201); }
export async function movements(req, res) {
  const result = await inventory.listMovements(req.validated.query); const q = req.validated.query;
  success(res, result.data, { page: q.page, limit: q.limit, total: result.total, totalPages: Math.ceil(result.total / q.limit) });
}
