import { z } from 'zod';

const optionalText = (max) => z.string().trim().max(max).optional().nullable();

/** Scoring Shipping Management–aligned fulfillment statuses (+ RHET return flow). */
export const fulfillmentStatuses = [
  'PENDING',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'ERROR',
  'INELIGIBLE',
  'NEEDS_ATTENTION',
  'RETURN',
  'RETURN_CONFIRMED',
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
    notes: optionalText(2000),
    studentName: optionalText(150),
    programName: optionalText(180),
    paymentDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    externalReference: optionalText(120),
    sourceSystem: optionalText(40),
    webhookUrl: z.string().url().optional().nullable(),
    items: z.array(z.object({
      inventoryId: z.string().uuid(),
      quantity: z.coerce.number().int().positive(),
    })).min(0).max(50).default([]),
  }),
  query: z.any(),
  params: z.any(),
});

/** Partner ingest — header-only Manual Order from Scoring Shipping Management. */
export const integrationCreateManualOrderSchema = z.object({
  body: z.object({
    externalReference: z.string().trim().min(2).max(120),
    customerName: z.string().trim().min(2).max(150),
    customerPhone: optionalText(40),
    shippingAddress: optionalText(500),
    courierName: optionalText(100),
    trackingNumber: optionalText(100),
    notes: optionalText(2000),
    studentName: optionalText(150),
    programName: optionalText(180),
    paymentDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    webhookUrl: z.string().url().optional().nullable(),
    /** Ignored — RHET uses API key systemCode. */
    sourceSystem: optionalText(40),
    items: z.array(z.any()).max(0).optional().default([]),
  }),
  query: z.any(),
  params: z.any(),
});

export const integrationManualOrderIdParams = z.object({
  body: z.any(),
  query: z.any(),
  params: z.object({ id: z.string().uuid() }),
});

export const integrationManualOrderReferenceParams = z.object({
  body: z.any(),
  query: z.any(),
  params: z.object({ reference: z.string().trim().min(2).max(120) }),
});

/** Scoring may set Delivered (both ways). Shipped is RHET-owned only. */
export const integrationManualFulfillmentSchema = z.object({
  body: z.object({
    status: z.enum(['DELIVERED', 'ERROR']),
  }),
  query: z.any(),
  params: z.object({ id: z.string().uuid() }),
});

export const integrationManualFulfillmentByRefSchema = z.object({
  body: z.object({
    status: z.enum(['DELIVERED', 'ERROR']),
  }),
  query: z.any(),
  params: z.object({ reference: z.string().trim().min(2).max(120) }),
});

export const updateManualOrderSchema = z.object({
  body: z.object({
    customerName: z.string().trim().min(2).max(150).optional(),
    customerPhone: optionalText(40),
    shippingAddress: optionalText(500),
    courierName: optionalText(100),
    trackingNumber: optionalText(100),
    notes: optionalText(2000),
    studentName: optionalText(150),
    programName: optionalText(180),
    paymentDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  }),
  query: z.any(),
  params: z.object({ id: z.string().uuid() }),
});

export const updateManualFulfillmentSchema = z.object({
  body: z.object({
    status: z.enum([
      'PENDING',
      'PROCESSING',
      'SHIPPED',
      'DELIVERED',
      'ERROR',
      'INELIGIBLE',
      'NEEDS_ATTENTION',
      'RETURN',
      'RETURN_CONFIRMED',
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

export const replaceManualOrderItemsSchema = z.object({
  body: z.object({
    items: z.array(z.object({
      inventoryId: z.string().uuid(),
      quantity: z.coerce.number().int().positive(),
    })).min(1).max(50),
  }),
  query: z.any(),
  params: z.object({ id: z.string().uuid() }),
});
