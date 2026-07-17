import { z } from 'zod';

const optionalText = (max) => z.string().trim().max(max).optional().nullable();

export const psmsStockRequestSchema = z.object({
  body: z.object({
    requestDate: z.coerce.date().optional(),
    requestedBy: z.string().trim().min(2).max(150),
    reason: z.string().trim().min(5).max(500),
    batchReference: optionalText(100),
    webhookUrl: z.string().url().optional().nullable(),
    items: z.array(z.object({
      categoryName: z.string().trim().min(2).max(100),
      gender: optionalText(20),
      type: optionalText(50),
      size: optionalText(20),
      itemName: optionalText(180),
      quantity: z.coerce.number().int().positive(),
      externalReference: optionalText(100),
    })).min(1).max(50),
  }),
  query: z.any(),
  params: z.any(),
});

export const availabilityQuerySchema = z.object({
  body: z.any(),
  params: z.any(),
  query: z.object({
    categoryName: z.string().trim().min(2).max(100),
    gender: optionalText(20),
    type: optionalText(50),
    size: optionalText(20),
    itemName: optionalText(180),
  }),
});

export const stockRequestListSchema = z.object({
  body: z.any(),
  params: z.any(),
  query: z.object({
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'FULFILLED', 'FAILED']).optional(),
    sourceSystem: z.string().trim().max(50).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export const stockRequestIdParams = z.object({
  body: z.any(),
  query: z.any(),
  params: z.object({ id: z.string().uuid() }),
});

export const rejectStockRequestSchema = z.object({
  body: z.object({
    rejectionReason: z.string().trim().min(3).max(500),
  }),
  query: z.any(),
  params: z.object({ id: z.string().uuid() }),
});
