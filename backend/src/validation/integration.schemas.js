import { z } from 'zod';

const optionalText = (max) => z.string().trim().max(max).optional().nullable();
const expirationEnum = z.enum(['7d', '1m', 'none']).default('none');

export const createIntegrationClientSchema = z.object({
  body: z.object({
    systemCode: z.string().trim().min(2).max(50).regex(/^[A-Za-z0-9_-]+$/, 'System code must be letters, numbers, underscore, or hyphen'),
    displayName: z.string().trim().min(2).max(100),
    description: optionalText(500),
    webhookUrl: z.string().url().optional().nullable(),
    expiration: expirationEnum,
  }),
  query: z.any(),
  params: z.any(),
});

export const integrationSystemCodeParams = z.object({
  body: z.any(),
  query: z.any(),
  params: z.object({
    systemCode: z.string().trim().min(2).max(50),
  }),
});

export const updateIntegrationClientSchema = z.object({
  body: z.object({
    displayName: z.string().trim().min(2).max(100).optional(),
    description: optionalText(500),
    webhookUrl: z.string().url().optional().nullable(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  }).refine((body) => Object.keys(body).length > 0, 'At least one field is required'),
  query: z.any(),
  params: z.object({
    systemCode: z.string().trim().min(2).max(50),
  }),
});
