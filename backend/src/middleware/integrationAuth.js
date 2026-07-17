import { AppError } from '../utils/api.js';
import { findClientByApiKey, recordIntegrationActivity } from '../services/integration-client.service.js';

export async function requireIntegrationAuth(req, _res, next) {
  const headerKey = req.headers['x-integration-key'];
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  const apiKey = headerKey || bearer;

  if (!apiKey) {
    return next(new AppError(401, 'INTEGRATION_UNAUTHORIZED', 'A valid integration API key is required'));
  }

  const client = await findClientByApiKey(apiKey);
  if (!client) {
    return next(new AppError(401, 'INTEGRATION_UNAUTHORIZED', 'The integration API key is invalid or inactive'));
  }

  req.integration = { sourceSystem: client.system_code, clientId: client.client_id };

  try {
    await recordIntegrationActivity(client.system_code);
  } catch (error) {
    console.error('Failed to record integration activity', error.message);
  }

  next();
}
