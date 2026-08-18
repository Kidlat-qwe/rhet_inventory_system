import { Router } from 'express';
import { pool } from '../database/pool.js';
import * as controller from '../controllers/inventory.controller.js';
import { dashboardSummary } from '../services/dashboard.service.js';
import {
  CATEGORY_KINDS,
  CATEGORY_TYPES,
  deleteCategory,
  normalizeCategoryKind,
  normalizeCategoryType,
} from '../services/inventory.service.js';
import { asyncHandler, camelize, success } from '../utils/api.js';
import { validate } from '../middleware/validate.js';
import { requireAdminRole } from '../middleware/auth.js';
import { createInventoryBatchSchema, createInventorySchema, createToolKitChildSchema, deleteCategorySchema, deleteInventorySchema, idParams, listInventorySchema, movementListSchema, movementSchema, removeToolKitChildSchema, updateInventorySchema } from '../validation/schemas.js';
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
import * as settingsController from '../controllers/settings.controller.js';
import { addShirtLogoSchema, updateSettingsSchema } from '../validation/settings.schemas.js';

export const api = Router();

api.get('/me', (req, res) => success(res, camelize(req.admin)));
api.get('/dashboard', asyncHandler(async (_req, res) => success(res, await dashboardSummary())));
api.get('/settings', settingsController.get);
api.patch('/settings', requireAdminRole, validate(updateSettingsSchema), settingsController.update);
api.post('/settings/shirt-logos', validate(addShirtLogoSchema), settingsController.addShirtLogo);
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
  const hasChildSkus = kind === 'OTHER'
    ? Boolean(req.body.hasChildSkus ?? req.body.has_child_skus)
    : false;
  if (hasChildSkus && kind !== 'OTHER') {
    return res.status(422).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Parent items with child SKUs are only available for Others categories' },
    });
  }
  const type = normalizeCategoryType(req.body.categoryType ?? req.body.category_type);
  if (!type) {
    return res.status(422).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `categoryType must be one of: ${CATEGORY_TYPES.join(', ')}`,
      },
    });
  }
  try {
    const result = await pool.query(
      'INSERT INTO categories(category_name, category_kind, has_child_skus, category_type) VALUES($1, $2, $3, $4) RETURNING *',
      [name, kind, hasChildSkus, type],
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
  const hasChildFlag = req.body.hasChildSkus !== undefined || req.body.has_child_skus !== undefined;
  const hasChildSkus = hasChildFlag
    ? Boolean(req.body.hasChildSkus ?? req.body.has_child_skus)
    : null;
  const hasType = (
    (req.body.categoryType !== undefined && req.body.categoryType !== null && req.body.categoryType !== '')
    || (req.body.category_type !== undefined && req.body.category_type !== null && req.body.category_type !== '')
  );
  const type = hasType ? normalizeCategoryType(req.body.categoryType ?? req.body.category_type) : null;
  if (hasType && !type) {
    return res.status(422).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `categoryType must be one of: ${CATEGORY_TYPES.join(', ')}`,
      },
    });
  }

  try {
    const current = await pool.query(
      'SELECT category_id, category_kind, has_child_skus, category_type FROM categories WHERE category_id = $1',
      [id],
    );
    if (!current.rowCount) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Category not found' } });
    }
    const nextKind = kind || current.rows[0].category_kind;
    const nextType = type || current.rows[0].category_type;
    let nextHasChild = hasChildSkus;
    if (nextHasChild === null) {
      nextHasChild = Boolean(current.rows[0].has_child_skus);
    }
    if (nextKind !== 'OTHER') nextHasChild = false;
    if (nextHasChild === false && Boolean(current.rows[0].has_child_skus)) {
      const bom = await pool.query(
        `SELECT 1
         FROM inventory_bundle_components bc
         JOIN inventory i ON i.inventory_id = bc.bundle_inventory_id
         WHERE i.category_id = $1
         LIMIT 1`,
        [id],
      );
      if (bom.rowCount) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'CATEGORY_HAS_CHILD_SKUS',
            message: 'Turn off “Parent items with child SKUs” only after removing all parent/child BOM links in this category',
          },
        });
      }
    }

    const result = await pool.query(
      `UPDATE categories
       SET category_name = $1,
           category_kind = $2,
           has_child_skus = $3,
           category_type = $4,
           updated_at = NOW()
       WHERE category_id = $5
       RETURNING *`,
      [name, nextKind, nextHasChild, nextType, id],
    );
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
api.delete('/categories/:id', requireAdminRole, validate(deleteCategorySchema), asyncHandler(async (req, res) => {
  const result = await deleteCategory(req.params.id, {
    confirmationName: req.body.confirmationName,
  }, req.admin.user_id);
  success(res, result);
}));
api.get('/inventory', validate(listInventorySchema), asyncHandler(controller.list));
api.post('/inventory', validate(createInventorySchema), asyncHandler(controller.create));
api.post('/inventory/batch', validate(createInventoryBatchSchema), asyncHandler(controller.createBatch));
api.post('/inventory/:id/tool-kit-children', validate(createToolKitChildSchema), asyncHandler(controller.createToolKitChild));
api.delete('/inventory/:id/tool-kit-children/:childId', validate(removeToolKitChildSchema), asyncHandler(controller.removeToolKitChild));
api.get('/inventory/:id', validate(idParams), asyncHandler(controller.get));
api.patch('/inventory/:id', validate(updateInventorySchema), asyncHandler(controller.update));
api.delete('/inventory/:id', requireAdminRole, validate(deleteInventorySchema), asyncHandler(controller.remove));
api.post('/inventory/:id/movements', validate(movementSchema), asyncHandler(controller.move));
api.get('/stock-movements', validate(movementListSchema), asyncHandler(controller.movements));
