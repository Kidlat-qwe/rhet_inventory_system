import { z } from 'zod';

const optionalText = (max) => z.string().trim().max(max).optional().nullable();

const kitComponentSpec = z.object({
  categoryName: z.string().trim().min(2).max(100),
  gender: optionalText(20),
  type: optionalText(50),
  size: optionalText(20),
  itemName: optionalText(180),
  sku: optionalText(64),
  quantity: z.coerce.number().int().positive(),
});

export const psmsStockRequestSchema = z.object({
  body: z.object({
    requestDate: z.coerce.date().optional(),
    requestedBy: z.string().trim().min(2).max(150),
    // CMS branch / campus display name (required so RHET staff know which site requested stock).
    branchName: z.string().trim().min(2).max(150),
    reason: z.string().trim().min(5).max(500),
    batchReference: optionalText(100),
    webhookUrl: z.string().url().optional().nullable(),
    items: z.array(z.object({
      categoryName: z.string().trim().min(2).max(100),
      gender: optionalText(20),
      type: optionalText(50),
      size: optionalText(20),
      itemName: optionalText(180),
      sku: optionalText(64),
      quantity: z.coerce.number().int().positive(),
      externalReference: optionalText(100),
      // Bundle / LEARNING_KIT: concrete component choices (uniforms need gender/type/size).
      components: z.array(kitComponentSpec).max(50).optional(),
    })).min(1).max(50),
  }),
  query: z.any(),
  params: z.any(),
});

const returnItemSchema = z.object({
  categoryName: z.string().trim().min(2).max(100),
  gender: optionalText(20),
  type: optionalText(50),
  size: optionalText(20),
  itemName: optionalText(180),
  sku: optionalText(64),
  quantity: z.coerce.number().int().positive(),
  externalReference: optionalText(100),
});

/** CMS Return Stock → POST /integrations/stock-returns */
export const psmsStockReturnSchema = z.object({
  body: z.object({
    requestDate: z.coerce.date().optional(),
    requestedBy: z.string().trim().min(2).max(150),
    branchName: z.string().trim().min(2).max(150),
    reason: z.string().trim().min(5).max(500),
    requestType: z.enum(['RETURN']).optional(),
    batchReference: optionalText(100),
    webhookUrl: z.string().url().optional().nullable(),
    items: z.array(returnItemSchema).min(1).max(50),
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
    status: z.enum(['PENDING', 'SHIPPED', 'DELIVERED', 'RETURNED', 'REJECTED']).optional(),
    sourceSystem: z.string().trim().max(50).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(500).default(20),
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

/** RHET staff adjusts a pending line qty before ship (notifies CMS via webhook). */
export const adjustStockRequestQuantitySchema = z.object({
  body: z.object({
    quantity: z.coerce.number().int().positive(),
    remarks: z.string().trim().min(3).max(500),
  }),
  query: z.any(),
  params: z.object({ id: z.string().uuid() }),
});

export const returnStockRequestSchema = z.object({
  body: z.object({
    // Default true keeps older callers (always restocked). Online-orders pattern.
    reusable: z.coerce.boolean().optional().default(true),
    notes: optionalText(500),
  }).default({}),
  query: z.any(),
  params: z.object({ id: z.string().uuid() }),
});

export const stockRequestInvoicePreviewSchema = z.object({
  body: z.object({
    requestIds: z.array(z.string().uuid()).min(1).max(50),
  }),
  query: z.any(),
  params: z.any(),
});

export const stockRequestInvoiceListSchema = z.object({
  body: z.any(),
  params: z.any(),
  query: z.object({
    // Empty/missing batchReference returns [] (see listInvoices controller).
    batchReference: z.string().trim().max(100).optional(),
    sourceSystem: z.string().trim().max(50).optional(),
  }),
});

export const stockRequestInvoiceIdParams = z.object({
  body: z.any(),
  query: z.any(),
  params: z.object({ invoiceId: z.string().uuid() }),
});

/** CMS branch confirm receipt — also used by RHET staff manual deliver override. */
export const deliverStockRequestSchema = z.object({
  body: z.object({
    confirmedBy: optionalText(150),
    branchName: optionalText(150),
    notes: optionalText(500),
  }).default({}),
  query: z.any(),
  params: z.object({ id: z.string().uuid() }),
});
