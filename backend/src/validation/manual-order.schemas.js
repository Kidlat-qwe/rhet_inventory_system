import { z } from 'zod';

const optionalText = (max) => z.string().trim().max(max).optional().nullable();

const fulfillmentStatuses = [
  'PROCESSING',
  'READY_TO_SHIP',
  'SHIPPED',
  'RECEIVED',
  'RETURN',
  'RETURN_CONFIRMED',
  'CANCELLED',
];

export const manualOrderListSchema = z.object({
  body: z.any(),
  params: z.any(),
  query: z.object({
    fulfillmentStatus: z.enum(fulfillmentStatuses).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export const manualOrderIdParams = z.object({
  body: z.any(),
  query: z.any(),
  params: z.object({ id: z.string().uuid() }),
});

export const createManualOrderSchema = z.object({
  body: z.object({
    customerName: z.string().trim().min(2).max(150),
    customerPhone: optionalText(40),
    shippingAddress: optionalText(500),
    courierName: optionalText(100),
    trackingNumber: optionalText(100),
    notes: optionalText(500),
    items: z.array(z.object({
      inventoryId: z.string().uuid(),
      quantity: z.coerce.number().int().positive(),
    })).min(1).max(50),
  }),
  query: z.any(),
  params: z.any(),
});

export const updateManualOrderSchema = z.object({
  body: z.object({
    customerName: z.string().trim().min(2).max(150).optional(),
    customerPhone: optionalText(40),
    shippingAddress: optionalText(500),
    courierName: optionalText(100),
    trackingNumber: optionalText(100),
    notes: optionalText(500),
  }),
  query: z.any(),
  params: z.object({ id: z.string().uuid() }),
});

export const updateManualFulfillmentSchema = z.object({
  body: z.object({
    status: z.enum([
      'READY_TO_SHIP',
      'SHIPPED',
      'RECEIVED',
      'RETURN',
      'RETURN_CONFIRMED',
      'CANCELLED',
    ]),
  }),
  query: z.any(),
  params: z.object({ id: z.string().uuid() }),
});

export const confirmManualReturnSchema = z.object({
  body: z.object({
    reusable: z.boolean(),
    notes: optionalText(500),
  }),
  query: z.any(),
  params: z.object({ id: z.string().uuid() }),
});
