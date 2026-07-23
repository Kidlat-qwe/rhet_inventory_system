import { z } from 'zod';

const uuid = z.string().uuid();

export const listAllocationsSchema = z.object({
  body: z.any(),
  params: z.any(),
  query: z.object({
    channel: z.string().trim().max(50).optional(),
  }),
});

export const allocateSchema = z.object({
  body: z.object({
    inventoryId: uuid,
    channel: z.string().trim().max(50).default('SHOPEE'),
    quantity: z.coerce.number().int().positive(),
    remarks: z.string().trim().max(500).optional().nullable(),
  }),
  query: z.any(),
  params: z.any(),
});

export const deallocateSchema = allocateSchema;
