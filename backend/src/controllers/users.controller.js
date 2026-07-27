import * as service from '../services/users.service.js';
import { asyncHandler, success } from '../utils/api.js';

export const list = asyncHandler(async (_req, res) => {
  success(res, await service.listUsers());
});

export const create = asyncHandler(async (req, res) => {
  success(res, await service.createUser(req.validated.body), null, 201);
});

export const updateRole = asyncHandler(async (req, res) => {
  success(
    res,
    await service.updateUserRole(
      req.validated.params.id,
      req.validated.body.role,
      req.admin.user_id,
    ),
  );
});

export const updateStatus = asyncHandler(async (req, res) => {
  success(
    res,
    await service.updateUserStatus(
      req.validated.params.id,
      req.validated.body.status,
      req.admin.user_id,
    ),
  );
});

export const update = asyncHandler(async (req, res) => {
  success(
    res,
    await service.updateUser(
      req.validated.params.id,
      req.validated.body,
      req.admin.user_id,
    ),
  );
});
