import { z } from 'zod';

const uuid = z.string().uuid();
const optionalText = (max) => z.string().trim().max(max).optional().nullable();

export const idParams = z.object({ body: z.any(), query: z.any(), params: z.object({ id: uuid }) });

export const listInventorySchema = z.object({
  body: z.any(), params: z.any(),
  query: z.object({
    search: z.string().trim().max(100).optional(), categoryId: uuid.optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'LOW_STOCK', 'OUT_OF_STOCK']).optional(),
    variation: z.string().trim().max(100).optional(),
    sortBy: z.enum(['itemName', 'stocks', 'price', 'updatedAt']).default('updatedAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

const money = z.coerce.number().min(0).max(9999999999.99);

const bundleComponentBody = z.object({
  categoryId: uuid,
  // Ignored on save — all BOM slots are category-only; concrete SKUs come from the request.
  componentInventoryId: uuid.optional().nullable(),
  quantity: z.coerce.number().int().positive().default(1).refine((v) => v === 1, 'Component quantity must be 1'),
});

export const inventoryItemBody = z.object({
  sku: z.string().trim().min(2).max(64).transform((v) => v.toUpperCase()),
  itemName: z.string().trim().min(2).max(180), categoryId: uuid,
  variation: optionalText(180), price: money,
  uniformGender: optionalText(10), uniformType: optionalText(20), uniformSize: optionalText(10),
  stocks: z.coerce.number().int().min(0).default(0),
  lowStockThreshold: z.coerce.number().int().min(0).max(1000000).default(20),
  components: z.array(bundleComponentBody).max(50).optional(),
});

export const createInventorySchema = z.object({ body: inventoryItemBody, query: z.any(), params: z.any() });

// Transactional creation of a uniform set: the two paired type rows (e.g. Polo
// and Short) are inserted together so a half-created pair can never persist.
export const createInventoryBatchSchema = z.object({ body: z.object({
  items: z.array(inventoryItemBody).min(1).max(10),
}), query: z.any(), params: z.any() });

export const updateInventorySchema = z.object({ body: z.object({
  sku: z.string().trim().min(2).max(64).transform((v) => v.toUpperCase()).optional(),
  itemName: z.string().trim().min(2).max(180).optional(), categoryId: uuid.optional(),
  variation: optionalText(180), price: money.optional(),
  uniformGender: optionalText(10), uniformType: optionalText(20), uniformSize: optionalText(10),
  lowStockThreshold: z.coerce.number().int().min(0).max(1000000).optional(),
  lifecycleStatus: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  components: z.array(bundleComponentBody).max(50).optional(),
}).refine((body) => Object.keys(body).length > 0, 'At least one field is required'), query: z.any(), params: z.object({ id: uuid }) });

export const movementSchema = z.object({ body: z.object({
  movementType: z.enum(['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'RETURN', 'DAMAGED', 'RELEASED', 'CANCELLED', 'ONLINE_SALE', 'CHANNEL_ALLOCATION']),
  quantity: z.coerce.number().int().positive().optional(),
  newStock: z.coerce.number().int().min(0).optional(),
  direction: z.enum(['ADD', 'DEDUCT']).optional(),
  referenceNumber: optionalText(100), remarks: optionalText(500),
}).superRefine((body, ctx) => {
  if (body.movementType === 'ADJUSTMENT' && body.newStock === undefined) ctx.addIssue({ code: 'custom', message: 'newStock is required for adjustments', path: ['newStock'] });
  if (body.movementType !== 'ADJUSTMENT' && !body.quantity) ctx.addIssue({ code: 'custom', message: 'quantity is required', path: ['quantity'] });
  if (['CANCELLED', 'CHANNEL_ALLOCATION'].includes(body.movementType) && !body.direction) ctx.addIssue({ code: 'custom', message: 'direction is required for this transaction type', path: ['direction'] });
}), query: z.any(), params: z.object({ id: uuid }) });

export const movementListSchema = z.object({ body: z.any(), params: z.any(), query: z.object({
  inventoryId: uuid.optional(), type: z.string().optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20),
}) });
