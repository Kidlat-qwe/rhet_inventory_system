import { z } from 'zod';

const optionalText = (max) => z.string().trim().max(max).optional().nullable();

const orderItemSchema = z.object({
  externalSku: z.string().trim().min(1).max(120),
  externalItemName: optionalText(255),
  externalVariation: optionalText(255),
  quantity: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().min(0).default(0),
});

export const onlineOrderListSchema = z.object({
  body: z.any(),
  params: z.any(),
  query: z.object({
    status: z.enum(['RECEIVED', 'NEEDS_ATTENTION', 'FULFILLED', 'CANCELLED']).optional(),
    channel: z.string().trim().max(50).optional(),
    search: z.string().trim().max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export const onlineOrderIdParams = z.object({
  body: z.any(),
  query: z.any(),
  params: z.object({ id: z.string().uuid() }),
});

export const onlineOrderItemIdParams = z.object({
  body: z.any(),
  query: z.any(),
  params: z.object({ id: z.string().uuid() }),
});

export const importOnlineOrdersSchema = z.object({
  body: z.object({
    csvText: z.string().trim().min(1).max(2_000_000),
    channel: z.string().trim().max(50).default('SHOPEE'),
  }),
  query: z.any(),
  params: z.any(),
});

export const manualOnlineOrderSchema = z.object({
  body: z.object({
    channel: z.string().trim().max(50).default('SHOPEE'),
    externalOrderId: z.string().trim().min(2).max(100),
    buyerName: optionalText(150),
    orderPlacedAt: z.coerce.date().optional().nullable(),
    totalAmount: z.coerce.number().min(0).default(0),
    notes: optionalText(500),
    items: z.array(orderItemSchema).min(1).max(50),
  }),
  query: z.any(),
  params: z.any(),
});

export const resolveOnlineOrderItemSchema = z.object({
  body: z.object({
    inventoryId: z.string().uuid(),
  }),
  query: z.any(),
  params: z.object({ id: z.string().uuid() }),
});

export const mappingListSchema = z.object({
  body: z.any(),
  params: z.any(),
  query: z.object({
    channel: z.string().trim().max(50).optional(),
  }),
});
