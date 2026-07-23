import * as service from '../services/channel-allocation.service.js';
import { asyncHandler, success } from '../utils/api.js';

export const list = asyncHandler(async (req, res) => {
  success(res, await service.listAllocations(req.validated.query));
});

export const allocate = asyncHandler(async (req, res) => {
  success(res, await service.allocate(req.validated.body, req.admin), null, 201);
});

export const deallocate = asyncHandler(async (req, res) => {
  success(res, await service.deallocate(req.validated.body, req.admin), null, 201);
});
