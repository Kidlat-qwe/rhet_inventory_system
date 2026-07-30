import { Router } from 'express';
import { pool } from '../database/pool.js';
import * as controller from '../controllers/inventory.controller.js';
import { dashboardSummary } from '../services/dashboard.service.js';
import { CATEGORY_KINDS, normalizeCategoryKind } from '../services/inventory.service.js';
import { asyncHandler, camelize, success } from '../utils/api.js';
import { validate } from '../middleware/validate.js';
import { requireAdminRole } from '../middleware/auth.js';
import { createInventoryBatchSchema, createInventorySchema, deleteInventorySchema, idParams, listInventorySchema, movementListSchema, movementSchema, updateInventorySchema } from '../validation/schemas.js';
import {
  createIntegrationClientSchema,
  integrationSystemCodeParams,
  updateIntegrationClientSchema,
} from '../validation/integration.schemas.js';
import {
  createUserSchema,
  updateUserRoleSchema,
  updateUserSchema,
  updateUserStatusSchema,
} from '../validation/users.schemas.js';
import * as integrationClientController from '../controllers/integration-client.controller.js';
import * as usersController from '../controllers/users.controller.js';

export const api = Router();

api.get('/me', (req, res) => success(res, camelize(req.admin)));
api.get('/dashboard', asyncHandler(async (_req, res) => success(res, await dashboardSummary())));
api.get('/categories', asyncHandler(async (_req, res) => {
  const result = await pool.query('SELECT * FROM categories ORDER BY category_name'); success(res, camelize(result.rows));
}));
api.get('/users', requireAdminRole, usersController.list);
api.post('/users', requireAdminRole, validate(createUserSchema), usersController.create);
api.patch('/users/:id', requireAdminRole, validate(updateUserSchema), usersController.update);
api.patch('/users/:id/role', requireAdminRole, validate(updateUserRoleSchema), usersController.updateRole);
api.patch('/users/:id/status', requireAdminRole, validate(updateUserStatusSchema), usersController.updateStatus);
api.get('/integration-clients', requireAdminRole, integrationClientController.list);
api.post('/integration-clients', requireAdminRole, validate(createIntegrationClientSchema), integrationClientController.create);
api.patch('/integration-clients/:systemCode', requireAdminRole, validate(updateIntegrationClientSchema), integrationClientController.update);
api.post('/integration-clients/:systemCode/regenerate-key', requireAdminRole, validate(integrationSystemCodeParams), integrationClientController.regenerateKey);
api.post('/integration-clients/:systemCode/revoke-key', requireAdminRole, validate(integrationSystemCodeParams), integrationClientController.revokeKey);
api.post('/categories', asyncHandler(async (req, res) => {
  const name = String(req.body.categoryName || '').trim();
  if (name.length < 2 || name.length > 100) {
    return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Category name must be 2–100 characters' } });
  }
  const kind = normalizeCategoryKind(req.body.categoryKind);
  if (!kind) {
    return res.status(422).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `categoryKind must be one of: ${CATEGORY_KINDS.join(', ')}`,
      },
    });
  }
  try {
    const result = await pool.query(
      'INSERT INTO categories(category_name, category_kind) VALUES($1, $2) RETURNING *',
      [name, kind],
    );
    success(res, camelize(result.rows[0]), null, 201);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        error: { code: 'CATEGORY_NAME_EXISTS', message: 'Category name already exists' },
      });
    }
    throw err;
  }
}));
api.patch('/categories/:id', requireAdminRole, validate(idParams), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const name = String(req.body.categoryName || '').trim();
  if (name.length < 2 || name.length > 100) {
    return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Category name must be 2–100 characters' } });
  }
  const hasKind = req.body.categoryKind !== undefined && req.body.categoryKind !== null && req.body.categoryKind !== '';
  const kind = hasKind ? normalizeCategoryKind(req.body.categoryKind) : null;
  if (hasKind && !kind) {
    return res.status(422).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `categoryKind must be one of: ${CATEGORY_KINDS.join(', ')}`,
      },
    });
  }
  try {
    const result = hasKind
      ? await pool.query(
        'UPDATE categories SET category_name = $1, category_kind = $2, updated_at = NOW() WHERE category_id = $3 RETURNING *',
        [name, kind, id],
      )
      : await pool.query(
        'UPDATE categories SET category_name = $1, updated_at = NOW() WHERE category_id = $2 RETURNING *',
        [name, id],
      );
    if (!result.rowCount) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Category not found' } });
    }
    success(res, camelize(result.rows[0]));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        error: { code: 'CATEGORY_NAME_EXISTS', message: 'Category name already exists' },
      });
    }
    throw err;
  }
}));
api.delete('/categories/:id', requireAdminRole, validate(idParams), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const inUse = await pool.query('SELECT 1 FROM inventory WHERE category_id = $1 LIMIT 1', [id]);
  if (inUse.rowCount) return res.status(409).json({ success:false, error:{ code:'CATEGORY_IN_USE', message:'Cannot delete a category that still has inventory items' } });
  const result = await pool.query('DELETE FROM categories WHERE category_id = $1 RETURNING category_id', [id]);
  if (!result.rowCount) return res.status(404).json({ success:false, error:{ code:'NOT_FOUND', message:'Category not found' } });
  success(res, { categoryId: id });
}));
api.get('/inventory', validate(listInventorySchema), asyncHandler(controller.list));
api.post('/inventory', validate(createInventorySchema), asyncHandler(controller.create));
api.post('/inventory/batch', validate(createInventoryBatchSchema), asyncHandler(controller.createBatch));
api.get('/inventory/:id', validate(idParams), asyncHandler(controller.get));
api.patch('/inventory/:id', validate(updateInventorySchema), asyncHandler(controller.update));
api.delete('/inventory/:id', requireAdminRole, validate(deleteInventorySchema), asyncHandler(controller.remove));
api.post('/inventory/:id/movements', validate(movementSchema), asyncHandler(controller.move));
api.get('/stock-movements', validate(movementListSchema), asyncHandler(controller.movements));
