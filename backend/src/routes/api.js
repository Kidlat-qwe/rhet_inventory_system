import { Router } from 'express';
import { pool } from '../database/pool.js';
import * as controller from '../controllers/inventory.controller.js';
import { dashboardSummary } from '../services/dashboard.service.js';
import { AppError, asyncHandler, camelize, success } from '../utils/api.js';
import { validate } from '../middleware/validate.js';
import { requireAdminRole } from '../middleware/auth.js';
import { createInventorySchema, idParams, listInventorySchema, movementListSchema, movementSchema, updateInventorySchema } from '../validation/schemas.js';
import {
  createIntegrationClientSchema,
  integrationSystemCodeParams,
  updateIntegrationClientSchema,
} from '../validation/integration.schemas.js';
import * as integrationClientController from '../controllers/integration-client.controller.js';

export const api = Router();

api.get('/me', (req, res) => success(res, camelize(req.admin)));
api.get('/dashboard', asyncHandler(async (_req, res) => success(res, await dashboardSummary())));
api.get('/categories', asyncHandler(async (_req, res) => {
  const result = await pool.query('SELECT * FROM categories ORDER BY category_name'); success(res, camelize(result.rows));
}));
api.get('/users', requireAdminRole, asyncHandler(async (_req, res) => {
  const result = await pool.query(
    'SELECT user_id, firebase_uid, email, full_name, role, status, created_at, updated_at FROM users ORDER BY full_name',
  );
  success(res, camelize(result.rows));
}));
api.patch('/users/:id/role', requireAdminRole, asyncHandler(async (req, res) => {
  const role = String(req.body.role || '').toUpperCase();
  if (!['ADMIN', 'USER'].includes(role)) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Role must be ADMIN or USER');
  }
  if (req.params.id === req.admin.user_id && role !== 'ADMIN') {
    throw new AppError(422, 'VALIDATION_ERROR', 'You cannot remove your own administrator role');
  }
  const result = await pool.query(
    `UPDATE users
     SET role = $1, updated_at = NOW()
     WHERE user_id = $2
     RETURNING user_id, firebase_uid, email, full_name, role, status, created_at, updated_at`,
    [role, req.params.id],
  );
  if (!result.rowCount) throw new AppError(404, 'USER_NOT_FOUND', 'User was not found');
  success(res, camelize(result.rows[0]));
}));
api.get('/integration-clients', requireAdminRole, integrationClientController.list);
api.post('/integration-clients', requireAdminRole, validate(createIntegrationClientSchema), integrationClientController.create);
api.patch('/integration-clients/:systemCode', requireAdminRole, validate(updateIntegrationClientSchema), integrationClientController.update);
api.post('/integration-clients/:systemCode/regenerate-key', requireAdminRole, validate(integrationSystemCodeParams), integrationClientController.regenerateKey);
api.post('/integration-clients/:systemCode/revoke-key', requireAdminRole, validate(integrationSystemCodeParams), integrationClientController.revokeKey);
api.post('/categories', asyncHandler(async (req, res) => {
  const name = String(req.body.categoryName || '').trim();
  if (name.length < 2 || name.length > 100) return res.status(422).json({ success:false, error:{ code:'VALIDATION_ERROR', message:'Category name must be 2–100 characters' } });
  const result = await pool.query('INSERT INTO categories(category_name) VALUES($1) RETURNING *', [name]); success(res, camelize(result.rows[0]), null, 201);
}));
api.get('/inventory', validate(listInventorySchema), asyncHandler(controller.list));
api.post('/inventory', validate(createInventorySchema), asyncHandler(controller.create));
api.get('/inventory/:id', validate(idParams), asyncHandler(controller.get));
api.patch('/inventory/:id', validate(updateInventorySchema), asyncHandler(controller.update));
api.post('/inventory/:id/movements', validate(movementSchema), asyncHandler(controller.move));
api.get('/stock-movements', validate(movementListSchema), asyncHandler(controller.movements));

api.get('/reports/inventory.csv', asyncHandler(async (_req, res) => {
  const result = await pool.query(`SELECT i.sku,i.item_name,c.category_name,i.variation,i.stocks,i.low_stock_threshold,i.price,i.status,
    (i.stocks*i.price) inventory_value,i.updated_at FROM inventory i JOIN categories c ON c.category_id=i.category_id ORDER BY i.item_name`);
  const columns = Object.keys(result.rows[0] || { sku:'', item_name:'', category_name:'', variation:'', stocks:'', price:'', status:'' });
  const escape = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const csv = [columns.join(','), ...result.rows.map((row) => columns.map((key) => escape(row[key])).join(','))].join('\n');
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="inventory-report.csv"' }).send(csv);
}));
