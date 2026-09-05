import { z } from 'zod';

const stringList = z.array(z.string().trim().min(1).max(60)).max(40);

export const updateSettingsSchema = z.object({
  body: z.object({
    organizationName: z.string().trim().min(2).max(120).optional(),
    timezone: z.enum(['Asia/Manila', 'Asia/Singapore', 'UTC']).optional(),
    defaultLowStockThreshold: z.coerce.number().int().min(0).max(999999).optional(),
    courierPresets: stringList.min(1).optional(),
    uniformSizes: z.array(z.string().trim().min(1).max(20)).min(1).max(30).optional(),
    shirtSizes: z.array(z.string().trim().min(1).max(20)).min(1).max(30).optional(),
    shirtLogos: z.array(z.string().trim().min(1).max(20)).min(1).max(30).optional(),
    helpAssistantEnabled: z.boolean().optional(),
    snowfallEnabled: z.boolean().optional(),
  }).refine(
    (body) => Object.keys(body).length > 0,
    { message: 'Provide at least one settings field to update' },
  ),
  query: z.any(),
  params: z.any(),
});

export const addShirtLogoSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(20),
  }),
  query: z.any(),
  params: z.any(),
});
