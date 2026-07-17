import * as service from '../services/integration-client.service.js';
import { asyncHandler, success } from '../utils/api.js';

export const list = asyncHandler(async (_req, res) => {
  success(res, await service.listIntegrationClients());
});

export const create = asyncHandler(async (req, res) => {
  const result = await service.createIntegrationClient({
    ...req.validated.body,
    systemCode: req.validated.body.systemCode.toUpperCase(),
  });
  success(res, result, null, 201);
});

export const update = asyncHandler(async (req, res) => {
  success(res, await service.updateIntegrationClient(req.validated.params.systemCode, req.validated.body));
});

export const regenerateKey = asyncHandler(async (req, res) => {
  const result = await service.regenerateIntegrationApiKey(req.validated.params.systemCode);
  success(res, result);
});

export const revokeKey = asyncHandler(async (req, res) => {
  success(res, await service.revokeIntegrationApiKey(req.validated.params.systemCode));
});
