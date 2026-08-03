import { z } from 'zod';

const optionalText = (max) => z.string().trim().max(max).optional().nullable();

const orderItemSchema = z.object({
  externalSku: z.string().trim().min(1).max(120),
  externalItemName: optionalText(255),
  externalVariation: optionalText(255),
  quantity: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().min(0).default(0),
});

export const FULFILLMENT_STATUSES = [
  'PROCESSING',
  'READY_TO_SHIP',
  'SHIPPED',
  'DELIVERED',
  'RETURNED',
  'CANCELLED',
];

export const onlineOrderListSchema = z.object({
  body: z.any(),
  params: z.any(),
  query: z.object({
    status: z.enum(['RECEIVED', 'NEEDS_ATTENTION', 'FULFILLED', 'CANCELLED']).optional(),
    fulfillmentStatus: z.enum(FULFILLMENT_STATUSES).optional(),
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
    csvText: z.string().max(2_000_000).optional(),
    fileBase64: z.string().min(1).max(12_000_000).optional(),
    fileName: z.string().trim().max(255).optional(),
    channel: z.string().trim().max(50).default('SHOPEE'),
  }).superRefine((body, ctx) => {
    const hasCsv = Boolean(body.csvText && String(body.csvText).trim());
    const hasFile = Boolean(body.fileBase64 && String(body.fileBase64).trim());
    if (!hasCsv && !hasFile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide csvText or fileBase64',
        path: ['csvText'],
      });
    }
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
    inventoryId: z.string().uuid().optional(),
    quantity: z.coerce.number().int().positive().max(10000).optional(),
    matches: z.array(z.object({
      inventoryId: z.string().uuid(),
      quantity: z.coerce.number().int().positive().max(10000),
    })).min(1).max(30).optional(),
  }).superRefine((body, ctx) => {
    if (!body.matches?.length && !body.inventoryId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide matches[] or inventoryId',
        path: ['matches'],
      });
    }
    if (body.matches?.length) {
      const ids = body.matches.map((row) => row.inventoryId);
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Each inventory item may only appear once in matches',
          path: ['matches'],
        });
      }
    }
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

export const updateFulfillmentStatusSchema = z.object({
  body: z.object({
    status: z.enum(['READY_TO_SHIP', 'SHIPPED', 'DELIVERED']),
  }),
  query: z.any(),
  params: z.object({ id: z.string().uuid() }),
});

export const confirmReturnSchema = z.object({
  body: z.object({
    reusable: z.coerce.boolean(),
    notes: optionalText(500),
  }),
  query: z.any(),
  params: z.object({ id: z.string().uuid() }),
});
