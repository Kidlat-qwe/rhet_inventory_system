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
  // Learning Kit: categoryId required (slot). Tool Kit: inventoryId/componentInventoryId required (pinned).
  categoryId: uuid.optional(),
  inventoryId: uuid.optional(),
  componentInventoryId: uuid.optional().nullable(),
  quantity: z.coerce.number().int().positive().default(1).refine((v) => v === 1, 'Component quantity must be 1'),
}).superRefine((row, ctx) => {
  const pinnedId = row.inventoryId || row.componentInventoryId;
  if (!row.categoryId && !pinnedId) {
    ctx.addIssue({
      code: 'custom',
      message: 'Each component requires categoryId (Learning Kit) or inventoryId (Tool Kit)',
      path: ['categoryId'],
    });
  }
});

export const inventoryItemBody = z.object({
  sku: z.string().trim().min(2).max(64).transform((v) => v.toUpperCase()),
  itemName: z.string().trim().min(2).max(180), categoryId: uuid,
  variation: optionalText(180), price: money, internalSellingPrice: money,
  uniformGender: optionalText(10), uniformType: optionalText(20), uniformSize: optionalText(10),
  remarks: optionalText(500),
  stocks: z.coerce.number().int().min(0).default(0),
  lowStockThreshold: z.coerce.number().int().min(0).max(1000000).default(20),
  components: z.array(bundleComponentBody).max(50).optional(),
});

export const createInventorySchema = z.object({ body: inventoryItemBody, query: z.any(), params: z.any() });

/** Create a new raw child SKU under a Tool Kit parent, or link an existing shared raw item.
 * - Pass inventoryId to link an existing raw SKU.
 * - Or pass itemName (+ sku/stocks…). Same-name raw items are auto-linked unless forceCreate=true.
 */
export const createToolKitChildSchema = z.object({
  body: z.object({
    inventoryId: uuid.optional(),
    componentInventoryId: uuid.optional(),
    forceCreate: z.boolean().optional().default(false),
    sku: z.string().trim().min(2).max(64).transform((v) => v.toUpperCase()).optional(),
    itemName: z.string().trim().min(2).max(180).optional(),
    variation: optionalText(180),
    price: money.default(0),
    internalSellingPrice: money.default(0),
    remarks: optionalText(500),
    stocks: z.coerce.number().int().min(0).default(0),
    lowStockThreshold: z.coerce.number().int().min(0).max(1000000).default(20),
  }).superRefine((body, ctx) => {
    if (body.inventoryId || body.componentInventoryId) return;
    if (!body.itemName) {
      ctx.addIssue({ code: 'custom', message: 'itemName is required when inventoryId is not provided', path: ['itemName'] });
    }
    if (body.forceCreate && !body.sku) {
      ctx.addIssue({ code: 'custom', message: 'sku is required when creating a new raw item', path: ['sku'] });
    }
    // New create path (no existing match handled server-side) still needs sku from client.
    if (!body.forceCreate && !body.sku && body.itemName) {
      // sku optional when server may auto-link by name; required only if creating
    }
  }),
  query: z.any(),
  params: z.object({ id: uuid }),
});

export const removeToolKitChildSchema = z.object({
  body: z.any(),
  query: z.any(),
  params: z.object({ id: uuid, childId: uuid }),
});

// Transactional creation of a uniform set: the two paired type rows (e.g. Polo
// and Short) are inserted together so a half-created pair can never persist.
export const createInventoryBatchSchema = z.object({ body: z.object({
  items: z.array(inventoryItemBody).min(1).max(10),
}), query: z.any(), params: z.any() });

export const updateInventorySchema = z.object({ body: z.object({
  sku: z.string().trim().min(2).max(64).transform((v) => v.toUpperCase()).optional(),
  itemName: z.string().trim().min(2).max(180).optional(), categoryId: uuid.optional(),
  variation: optionalText(180), price: money.optional(), internalSellingPrice: money.optional(),
  uniformGender: optionalText(10), uniformType: optionalText(20), uniformSize: optionalText(10),
  remarks: optionalText(500),
  lowStockThreshold: z.coerce.number().int().min(0).max(1000000).optional(),
  lifecycleStatus: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  components: z.array(bundleComponentBody).max(50).optional(),
}).refine((body) => Object.keys(body).length > 0, 'At least one field is required'), query: z.any(), params: z.object({ id: uuid }) });

/** Admin hard-delete: body must repeat the exact item name. */
export const deleteInventorySchema = z.object({
  body: z.object({
    confirmationName: z.string().trim().min(1).max(180),
  }),
  query: z.any(),
  params: z.object({ id: uuid }),
});

/** Admin hard-delete category: body must repeat the exact category name. */
export const deleteCategorySchema = z.object({
  body: z.object({
    confirmationName: z.string().trim().min(1).max(100),
  }),
  query: z.any(),
  params: z.object({ id: uuid }),
});

export const movementSchema = z.object({ body: z.object({
  movementType: z.enum(['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'RETURN', 'DAMAGED', 'RELEASED', 'CANCELLED', 'ONLINE_SALE', 'CHANNEL_ALLOCATION', 'MANUAL_SALE']),
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
  inventoryId: uuid.optional(),
  type: z.string().optional(),
  types: z.string().optional(), // comma-separated, e.g. ONLINE_SALE,CANCELLED
  excludeTypes: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}) });
