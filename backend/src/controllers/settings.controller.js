import * as service from '../services/settings.service.js';
import { asyncHandler, success } from '../utils/api.js';

export const get = asyncHandler(async (_req, res) => {
  success(res, await service.getSettings());
});

export const update = asyncHandler(async (req, res) => {
  success(res, await service.updateSettings(req.validated.body, req.admin.user_id));
});

export const addShirtLogo = asyncHandler(async (req, res) => {
  success(res, await service.addShirtLogo(req.validated.body.name, req.admin.user_id));
});
