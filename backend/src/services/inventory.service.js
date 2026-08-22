import { pool, withTransaction } from '../database/pool.js';
import { AppError, camelize } from '../utils/api.js';
import { calculateStockChange } from './stock-rules.js';

const inventorySelect = `SELECT i.*, c.category_name, c.category_kind, c.has_child_skus
  FROM inventory i JOIN categories c ON c.category_id = i.category_id`;

const componentSelect = `SELECT bc.component_row_id, bc.bundle_inventory_id,
    bc.component_category_id, bc.component_inventory_id, bc.quantity, bc.created_at,
    cat.category_name, cat.category_kind,
    i.sku, i.item_name, i.stocks, i.uniform_gender, i.uniform_type, i.uniform_size, i.variation
  FROM inventory_bundle_components bc
  JOIN categories cat ON cat.category_id = bc.component_category_id
  LEFT JOIN inventory i ON i.inventory_id = bc.component_inventory_id`;

export const CATEGORY_KINDS = Object.freeze([
  'SCHOOL_UNIFORM',
  'PE_UNIFORM',
  'LCA_SHIRT',
  'LEARNING_KIT',
  'TOOL_KIT',
  'OTHER',
]);

export const CATEGORY_TYPES = Object.freeze(['MERCHANDISE', 'SUPPLIES']);

export function isLearningKitCategoryName(categoryName = '') {
  return String(categoryName || '').trim().toLowerCase() === 'learning kit';
}

export function isToolKitCategoryName(categoryName = '') {
  return String(categoryName || '').trim().toLowerCase() === 'tool kit';
}

/** Prefer category_kind when present; fall back to exact name for legacy rows. */
export function isLearningKitCategory(category = {}) {
  if (!category) return false;
  const kind = category.categoryKind || category.category_kind;
  if (kind === 'LEARNING_KIT') return true;
  if (kind && kind !== 'OTHER') return false;
  return isLearningKitCategoryName(category.categoryName || category.category_name);
}

/** Prefer has_child_skus flag; fall back to legacy TOOL_KIT kind / name. */
export function isToolKitCategory(category = {}) {
  if (!category) return false;
  if (category.hasChildSkus === true || category.has_child_skus === true) return true;
  const kind = category.categoryKind || category.category_kind;
  if (kind === 'TOOL_KIT') return true;
  if (kind && kind !== 'OTHER') return false;
  return isToolKitCategoryName(category.categoryName || category.category_name);
}

/** Bundle / LEARNING_KIT (category slots) or Tool Kit (pinned items). */
export function isVirtualKitCategory(category = {}) {
  return isLearningKitCategory(category) || isToolKitCategory(category);
}

export function normalizeCategoryKind(value) {
  const kind = String(value || 'OTHER').trim().toUpperCase();
  return CATEGORY_KINDS.includes(kind) ? kind : null;
}

export function normalizeCategoryType(value) {
  const type = String(value || 'MERCHANDISE').trim().toUpperCase();
  return CATEGORY_TYPES.includes(type) ? type : null;
}

/** Sum ACTIVE stocks in a category (used for category-slot kit availability).
 * Excludes items that are pinned as kit raw components so Tool Kit parents
 * are not double-counted with their children.
 */
export async function sumCategoryStocks(categoryId, db = pool) {
  const result = await db.query(
    `SELECT COALESCE(SUM(i.stocks), 0)::int AS total
     FROM inventory i
     WHERE i.category_id = $1
       AND i.lifecycle_status = 'ACTIVE'
       AND NOT EXISTS (
         SELECT 1 FROM inventory_bundle_components bc
         WHERE bc.component_inventory_id = i.inventory_id
       )`,
    [categoryId],
  );
  return Number(result.rows[0].total) || 0;
}

async function loadKitComponentInventoryIds(db = pool) {
  const result = await db.query(
    `SELECT DISTINCT component_inventory_id
     FROM inventory_bundle_components
     WHERE component_inventory_id IS NOT NULL`,
  );
  return new Set(result.rows.map((row) => row.component_inventory_id));
}

/** Tool Kit raw child (pinned under a parent) — normal stocked item, not a virtual kit. */
export async function isToolKitRawComponent(inventoryId, db = pool) {
  if (!inventoryId) return false;
  const result = await db.query(
    `SELECT 1 FROM inventory_bundle_components WHERE component_inventory_id = $1 LIMIT 1`,
    [inventoryId],
  );
  return result.rowCount > 0;
}

/** Item whose stock is virtual (Bundle / LEARNING_KIT, or Tool Kit parent — not a raw child). */
export async function isVirtualKitParentItem(item, db = pool) {
  if (!item) return false;
  if (isLearningKitCategory(item)) return true;
  if (!isToolKitCategory(item)) return false;
  const inventoryId = item.inventoryId || item.inventory_id;
  if (!inventoryId) return false;
  return !(await isToolKitRawComponent(inventoryId, db));
}

/**
 * Available kits from BOM.
 * - Pinned line → that item's stocks
 * - Category-only line → sum of ACTIVE stocks in that category
 * Result = min(floor(have / qty)) across lines. Empty BOM → 0.
 */
export async function computeAvailableKits(components = [], db = pool) {
  const rows = components || [];
  if (!rows.length) return 0;

  let min = Infinity;
  for (const row of rows) {
    const need = Math.max(1, Number(row.quantity) || 1);
    let have;
    if (row.componentInventoryId || row.inventoryId || row.isPinned) {
      have = Number(row.stocks);
      if (!Number.isFinite(have)) return 0;
    } else {
      const categoryId = row.componentCategoryId || row.categoryId;
      if (!categoryId) return 0;
      have = await sumCategoryStocks(categoryId, db);
    }
    min = Math.min(min, Math.floor(have / need));
  }
  return Number.isFinite(min) ? Math.max(0, min) : 0;
}

function shapeComponent(row) {
  return {
    ...row,
    categoryId: row.componentCategoryId,
    inventoryId: row.componentInventoryId,
    isPinned: Boolean(row.componentInventoryId),
  };
}

export async function listBundleComponents(bundleInventoryId, db = pool) {
  const result = await db.query(
    `${componentSelect} WHERE bc.bundle_inventory_id = $1 ORDER BY cat.category_name, i.item_name NULLS LAST`,
    [bundleInventoryId],
  );
  return camelize(result.rows).map(shapeComponent);
}

export function deriveStockStatus({ lifecycleStatus, stocks, lowStockThreshold }) {
  if (String(lifecycleStatus || '').toUpperCase() === 'INACTIVE') return 'INACTIVE';
  const qty = Number(stocks) || 0;
  const threshold = Number(lowStockThreshold) || 0;
  if (qty <= 0) return 'OUT_OF_STOCK';
  if (qty <= threshold) return 'LOW_STOCK';
  return 'ACTIVE';
}

async function attachComponents(items, db = pool) {
  if (!items.length) return items;
  const ids = items.map((row) => row.inventoryId);
  const result = await db.query(
    `${componentSelect} WHERE bc.bundle_inventory_id = ANY($1::uuid[]) ORDER BY cat.category_name, i.item_name NULLS LAST`,
    [ids],
  );
  const byBundle = new Map();
  for (const row of camelize(result.rows).map(shapeComponent)) {
    const list = byBundle.get(row.bundleInventoryId) || [];
    list.push(row);
    byBundle.set(row.bundleInventoryId, list);
  }

  const kitChildIds = await loadKitComponentInventoryIds(db);

  const attached = [];
  for (const item of items) {
    const components = byBundle.get(item.inventoryId) || [];

    // Tool Kit raw children live in the same category but keep normal stock.
    if (isToolKitCategory(item) && kitChildIds.has(item.inventoryId)) {
      attached.push({
        ...item,
        components: [],
        kitRole: 'RAW_COMPONENT',
        stockMode: 'PHYSICAL',
      });
      continue;
    }

    if (!isVirtualKitCategory(item)) {
      attached.push({ ...item, components });
      continue;
    }

    const withCategoryTotals = [];
    for (const row of components) {
      const categoryStocks = row.isPinned
        ? Number(row.stocks) || 0
        : await sumCategoryStocks(row.categoryId || row.componentCategoryId, db);
      withCategoryTotals.push({ ...row, categoryStocks });
    }
    const computedStocks = await computeAvailableKits(components, db);
    // Status is a DB generated column from stored stocks. Virtual kits display
    // computed availability, so status must follow that same number.
    const status = deriveStockStatus({
      lifecycleStatus: item.lifecycleStatus,
      stocks: computedStocks,
      lowStockThreshold: item.lowStockThreshold,
    });

    const storedStocks = Number(item.stocks) || 0;
    if (storedStocks !== computedStocks) {
      // Keep generated status / dashboard counts aligned without writing a movement.
      await db.query(
        'UPDATE inventory SET stocks = $1, updated_at = NOW() WHERE inventory_id = $2',
        [computedStocks, item.inventoryId],
      );
    }

    attached.push({
      ...item,
      components: withCategoryTotals,
      computedStocks,
      bomComplete: components.length > 0,
      kitRole: isToolKitCategory(item) ? 'PARENT' : 'KIT',
      stockMode: 'VIRTUAL_BUNDLE',
      stocks: computedStocks,
      status,
    });
  }

  return attachUsedByParents(attached, db);
}

/** Annotate pinned kit components with which parent kits share them. */
async function attachUsedByParents(items, db = pool) {
  const childIds = [];
  for (const item of items) {
    for (const row of item.components || []) {
      const id = row.componentInventoryId || row.inventoryId;
      if (id) childIds.push(id);
    }
  }
  if (!childIds.length) return items;

  const uniqueIds = [...new Set(childIds)];
  const result = await db.query(
    `SELECT bc.component_inventory_id, i.inventory_id AS parent_inventory_id, i.item_name AS parent_item_name, i.sku AS parent_sku
     FROM inventory_bundle_components bc
     JOIN inventory i ON i.inventory_id = bc.bundle_inventory_id
     WHERE bc.component_inventory_id = ANY($1::uuid[])
     ORDER BY i.item_name`,
    [uniqueIds],
  );

  const byChild = new Map();
  for (const row of camelize(result.rows)) {
    const list = byChild.get(row.componentInventoryId) || [];
    list.push({
      inventoryId: row.parentInventoryId,
      itemName: row.parentItemName,
      sku: row.parentSku,
    });
    byChild.set(row.componentInventoryId, list);
  }

  return items.map((item) => ({
    ...item,
    components: (item.components || []).map((row) => {
      const id = row.componentInventoryId || row.inventoryId;
      return {
        ...row,
        usedBy: id ? (byChild.get(id) || []) : [],
      };
    }),
  }));
}

export async function listInventory(query) {
  const values = [];
  const where = [];
  const add = (value) => { values.push(value); return `$${values.length}`; };
  if (query.search) {
    const p = add(`%${query.search}%`);
    where.push(`(i.sku ILIKE ${p} OR i.item_name ILIKE ${p})`);
  }
  if (query.categoryId) where.push(`i.category_id = ${add(query.categoryId)}`);
  if (query.status) where.push(`i.status = ${add(query.status)}`);
  if (query.variation) where.push(`i.variation ILIKE ${add(`%${query.variation}%`)}`);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sort = { itemName: 'i.item_name', stocks: 'i.stocks', price: 'i.price', updatedAt: 'i.updated_at' }[query.sortBy];
  const count = await pool.query(`SELECT COUNT(*) FROM inventory i ${clause}`, values);
  const offset = (query.page - 1) * query.limit;
  values.push(query.limit, offset);
  const result = await pool.query(
    `${inventorySelect} ${clause} ORDER BY ${sort} ${query.order} LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  const data = await attachComponents(camelize(result.rows));
  return { data, total: Number(count.rows[0].count) };
}

export async function getInventory(id, db = pool) {
  const result = await db.query(`${inventorySelect} WHERE i.inventory_id = $1`, [id]);
  if (!result.rowCount) throw new AppError(404, 'ITEM_NOT_FOUND', 'Inventory item was not found');
  const [item] = await attachComponents([camelize(result.rows[0])], db);
  return item;
}

async function loadKitMeta(db, inventoryId) {
  const result = await db.query(
    `${inventorySelect} WHERE i.inventory_id = $1`,
    [inventoryId],
  );
  if (!result.rowCount) return null;
  return camelize(result.rows[0]);
}

/** Persist computed kit availability onto inventory.stocks (status column depends on it). */
export async function syncKitComputedStocks(bundleInventoryId, adminId, db = pool, visited = new Set()) {
  if (visited.has(bundleInventoryId)) return null;
  visited.add(bundleInventoryId);

  const meta = await loadKitMeta(db, bundleInventoryId);
  if (!meta || !isVirtualKitCategory(meta)) return null;
  if (isToolKitCategory(meta) && await isToolKitRawComponent(bundleInventoryId, db)) {
    return null;
  }

  const components = await listBundleComponents(bundleInventoryId, db);
  const computed = await computeAvailableKits(components, db);
  const previous = Number(meta.stocks) || 0;
  if (previous === computed) {
    await syncCategorySlotDependents(meta, adminId, db, visited);
    return { inventoryId: bundleInventoryId, stocks: computed, changed: false };
  }

  await db.query(
    'UPDATE inventory SET stocks = $1, updated_by = $2, updated_at = NOW() WHERE inventory_id = $3',
    [computed, adminId, bundleInventoryId],
  );

  const delta = computed - previous;
  if (delta !== 0) {
    const kitLabel = isToolKitCategory(meta) ? 'Tool Kit' : 'Bundle';
    await db.query(
      `INSERT INTO stock_movements
        (inventory_id, movement_type, quantity, stock_delta, previous_stock, new_stock, remarks, created_by)
       VALUES ($1,'ADJUSTMENT',$2,$3,$4,$5,$6,$7)`,
      [
        bundleInventoryId,
        Math.abs(delta),
        delta,
        previous,
        computed,
        `Virtual ${kitLabel} stock sync from components`,
        adminId,
      ],
    );
  }

  await syncCategorySlotDependents(meta, adminId, db, visited);

  return { inventoryId: bundleInventoryId, stocks: computed, changed: true, previous };
}

/** When a Tool Kit (or other virtual parent) stock changes, refresh kits that use its category as a slot. */
async function syncCategorySlotDependents(meta, adminId, db, visited) {
  const categoryId = meta.categoryId || meta.category_id;
  if (!categoryId) return;
  const deps = await db.query(
    `SELECT DISTINCT bc.bundle_inventory_id
     FROM inventory_bundle_components bc
     WHERE bc.component_category_id = $1
       AND bc.component_inventory_id IS NULL
       AND bc.bundle_inventory_id <> $2`,
    [categoryId, meta.inventoryId || meta.inventory_id],
  );
  for (const row of deps.rows) {
    await syncKitComputedStocks(row.bundle_inventory_id, adminId, db, visited);
  }
}

async function replaceBundleComponents(db, bundleInventoryId, components = []) {
  const meta = await loadKitMeta(db, bundleInventoryId);
  if (!meta) {
    throw new AppError(404, 'ITEM_NOT_FOUND', 'Inventory item was not found');
  }
  if (!isVirtualKitCategory(meta)) {
    throw new AppError(422, 'INVALID_COMPONENT', 'Only Bundle and Tool Kit items support a bill of materials');
  }

  const rows = components || [];
  if (!rows.length) {
    await db.query('DELETE FROM inventory_bundle_components WHERE bundle_inventory_id = $1', [bundleInventoryId]);
    return;
  }

  if (isToolKitCategory(meta)) {
    await replaceToolKitComponents(db, bundleInventoryId, rows);
    return;
  }

  await replaceLearningKitComponents(db, bundleInventoryId, rows);
}

async function replaceLearningKitComponents(db, bundleInventoryId, rows) {
  const normalized = [];
  const seenCategories = new Set();

  for (const row of rows) {
    const categoryId = row.categoryId || row.componentCategoryId;
    if (!categoryId) {
      throw new AppError(422, 'INVALID_COMPONENT', 'Each kit component requires a category');
    }

    const categoryResult = await db.query(
      'SELECT category_id, category_name, category_kind FROM categories WHERE category_id = $1',
      [categoryId],
    );
    if (!categoryResult.rowCount) {
      throw new AppError(422, 'COMPONENT_NOT_FOUND', 'One or more component categories were not found');
    }
    const categoryRow = categoryResult.rows[0];
    const categoryName = categoryRow.category_name;
    if (isLearningKitCategory(categoryRow)) {
      throw new AppError(422, 'INVALID_COMPONENT', 'A bundle cannot include another bundle');
    }
    if (seenCategories.has(categoryId)) {
      throw new AppError(422, 'INVALID_COMPONENT', `Category "${categoryName}" is already included in this kit`);
    }
    seenCategories.add(categoryId);

    const quantity = Math.max(1, Math.min(999, Math.trunc(Number(row.quantity) || 1)));
    // Category-only slots. Concrete SKUs are chosen by the external stock request.
    normalized.push({ categoryId, componentInventoryId: null, quantity });
  }

  await db.query('DELETE FROM inventory_bundle_components WHERE bundle_inventory_id = $1', [bundleInventoryId]);
  for (const row of normalized) {
    await db.query(
      `INSERT INTO inventory_bundle_components
        (bundle_inventory_id, component_category_id, component_inventory_id, quantity)
       VALUES ($1, $2, $3, $4)`,
      [bundleInventoryId, row.categoryId, row.componentInventoryId, row.quantity],
    );
  }
}

async function replaceToolKitComponents(db, bundleInventoryId, rows) {
  const normalized = [];
  const seenInventory = new Set();

  for (const row of rows) {
    const inventoryId = row.inventoryId || row.componentInventoryId;
    if (!inventoryId) {
      throw new AppError(422, 'INVALID_COMPONENT', 'Each Tool Kit component requires an inventory item');
    }
    if (inventoryId === bundleInventoryId) {
      throw new AppError(422, 'INVALID_COMPONENT', 'A Tool Kit cannot include itself as a component');
    }
    if (seenInventory.has(inventoryId)) {
      throw new AppError(422, 'INVALID_COMPONENT', 'Each raw item can only be included once in a Tool Kit');
    }

    const itemResult = await db.query(
      `${inventorySelect} WHERE i.inventory_id = $1`,
      [inventoryId],
    );
    if (!itemResult.rowCount) {
      throw new AppError(422, 'COMPONENT_NOT_FOUND', 'One or more component inventory items were not found');
    }
    const componentItem = camelize(itemResult.rows[0]);
    if (isLearningKitCategory(componentItem)) {
      throw new AppError(422, 'INVALID_COMPONENT', 'A Tool Kit cannot include a bundle as a raw item');
    }
    const nestedBom = await listBundleComponents(inventoryId, db);
    if (nestedBom.length) {
      throw new AppError(422, 'INVALID_COMPONENT', 'Cannot nest a parent Tool Kit inside another Tool Kit');
    }
    if (String(componentItem.lifecycleStatus || '').toUpperCase() === 'INACTIVE') {
      throw new AppError(422, 'INVALID_COMPONENT', `Component "${componentItem.sku}" is inactive`);
    }

    seenInventory.add(inventoryId);
    const quantity = Math.max(1, Math.min(999, Math.trunc(Number(row.quantity) || 1)));
    normalized.push({
      categoryId: componentItem.categoryId,
      componentInventoryId: inventoryId,
      quantity,
    });
  }

  await db.query('DELETE FROM inventory_bundle_components WHERE bundle_inventory_id = $1', [bundleInventoryId]);
  for (const row of normalized) {
    await db.query(
      `INSERT INTO inventory_bundle_components
        (bundle_inventory_id, component_category_id, component_inventory_id, quantity)
       VALUES ($1, $2, $3, $4)`,
      [bundleInventoryId, row.categoryId, row.componentInventoryId, row.quantity],
    );
  }
}

async function insertInventoryRow(db, input, adminId) {
  const category = await db.query(
    'SELECT category_name, category_kind FROM categories WHERE category_id = $1',
    [input.categoryId],
  );
  if (!category.rowCount) throw new AppError(422, 'CATEGORY_NOT_FOUND', 'Category was not found');
  // Tool Kit raw children are created inside a parent; they keep physical stock.
  const isKit = input.asToolKitRawChild ? false : isVirtualKitCategory(category.rows[0]);
  const initialStocks = isKit ? 0 : input.stocks;

  const result = await db.query(`INSERT INTO inventory
    (sku, item_name, stocks, category_id, variation, price, internal_selling_price, uniform_gender, uniform_type, uniform_size, remarks, low_stock_threshold, created_by, updated_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) RETURNING inventory_id`,
    [
      input.sku,
      input.itemName,
      initialStocks,
      input.categoryId,
      input.variation || null,
      input.price,
      input.internalSellingPrice,
      input.uniformGender || null,
      input.uniformType || null,
      input.uniformSize || null,
      input.remarks || null,
      input.lowStockThreshold,
      adminId,
    ]);
  const id = result.rows[0].inventory_id;

  if (!isKit && initialStocks > 0) {
    await db.query(`INSERT INTO stock_movements
      (inventory_id, movement_type, quantity, stock_delta, previous_stock, new_stock, remarks, created_by)
      VALUES ($1,'STOCK_IN',$2,$2,0,$2,'Initial stock',$3)`, [id, initialStocks, adminId]);
  }

  if (Array.isArray(input.components)) {
    await replaceBundleComponents(db, id, input.components);
  }

  if (isKit) {
    await syncKitComputedStocks(id, adminId, db);
  }

  return id;
}

export async function createInventory(input, adminId) {
  return withTransaction(async (db) => {
    const id = await insertInventoryRow(db, input, adminId);
    return getInventory(id, db);
  });
}

/**
 * Add a raw inventory item under a Tool Kit parent (create new or link existing shared SKU).
 * - input.inventoryId → pin an existing raw item (shared across kits)
 * - otherwise create a new raw row, unless forceCreate is false and a same-name raw exists
 *   (then link that shared item instead)
 */
export async function createToolKitChild(parentInventoryId, input, adminId) {
  return withTransaction(async (db) => {
    const parent = await loadKitMeta(db, parentInventoryId);
    if (!parent) throw new AppError(404, 'ITEM_NOT_FOUND', 'Tool Kit parent was not found');
    if (!isToolKitCategory(parent)) {
      throw new AppError(422, 'NOT_A_TOOL_KIT', 'Raw items can only be added under a Tool Kit parent');
    }
    if (await isToolKitRawComponent(parentInventoryId, db)) {
      throw new AppError(422, 'NOT_A_TOOL_KIT', 'Cannot add raw items under another raw item');
    }

    let childId = input.inventoryId || input.componentInventoryId || null;

    if (childId) {
      await assertLinkableToolKitRaw(db, parent, parentInventoryId, childId);
    } else {
      const itemName = String(input.itemName || '').trim();
      if (!itemName) {
        throw new AppError(422, 'INVALID_COMPONENT', 'Item name is required when creating a raw item');
      }

      const forceCreate = Boolean(input.forceCreate);
      if (!forceCreate) {
        const existing = await findSharedToolKitRawByName(db, parent.categoryId, itemName);
        if (existing) {
          childId = existing.inventoryId;
          await assertLinkableToolKitRaw(db, parent, parentInventoryId, childId);
        }
      }

      if (!childId) {
        if (!input.sku) {
          throw new AppError(422, 'INVALID_COMPONENT', 'SKU is required when creating a raw item');
        }
        childId = await insertInventoryRow(db, {
          sku: input.sku,
          itemName,
          categoryId: parent.categoryId,
          variation: input.variation || null,
          price: input.price ?? 0,
          internalSellingPrice: input.internalSellingPrice ?? 0,
          remarks: input.remarks || null,
          stocks: input.stocks ?? 0,
          lowStockThreshold: input.lowStockThreshold ?? 20,
          asToolKitRawChild: true,
        }, adminId);
      }
    }

    await db.query(
      `INSERT INTO inventory_bundle_components
        (bundle_inventory_id, component_category_id, component_inventory_id, quantity)
       VALUES ($1, $2, $3, 1)`,
      [parentInventoryId, parent.categoryId, childId],
    );

    await syncKitComputedStocks(parentInventoryId, adminId, db);
    return getInventory(parentInventoryId, db);
  });
}

async function findSharedToolKitRawByName(db, categoryId, itemName) {
  const normalized = String(itemName || '').trim().toLowerCase();
  if (!normalized) return null;

  // Prefer raw items already used as kit components (shared catalog).
  const asComponent = await db.query(
    `${inventorySelect}
     WHERE i.category_id = $1
       AND LOWER(TRIM(i.item_name)) = $2
       AND i.lifecycle_status = 'ACTIVE'
       AND EXISTS (
         SELECT 1 FROM inventory_bundle_components bc
         WHERE bc.component_inventory_id = i.inventory_id
       )
     ORDER BY i.updated_at DESC
     LIMIT 1`,
    [categoryId, normalized],
  );
  if (asComponent.rowCount) return camelize(asComponent.rows[0]);

  // Also allow matching a stocked Tool Kit-category item that is not a parent kit
  // (no BOM of its own and not already only a parent with empty BOM confusing cases).
  const anyRaw = await db.query(
    `${inventorySelect}
     WHERE i.category_id = $1
       AND LOWER(TRIM(i.item_name)) = $2
       AND i.lifecycle_status = 'ACTIVE'
       AND NOT EXISTS (
         SELECT 1 FROM inventory_bundle_components bc
         WHERE bc.bundle_inventory_id = i.inventory_id
       )
     ORDER BY i.updated_at DESC
     LIMIT 1`,
    [categoryId, normalized],
  );
  if (!anyRaw.rowCount) return null;
  const row = camelize(anyRaw.rows[0]);
  // Exclude virtual parents (Tool Kit parents have kit role when not used as component).
  if (isToolKitCategory(row) && !(await isToolKitRawComponent(row.inventoryId, db))) {
    // Empty-BOM parent with same name — do not treat as shared raw.
    return null;
  }
  return row;
}

async function assertLinkableToolKitRaw(db, parent, parentInventoryId, childId) {
  if (childId === parentInventoryId) {
    throw new AppError(422, 'INVALID_COMPONENT', 'A Tool Kit cannot include itself as a raw item');
  }

  const already = await db.query(
    `SELECT 1 FROM inventory_bundle_components
     WHERE bundle_inventory_id = $1 AND component_inventory_id = $2
     LIMIT 1`,
    [parentInventoryId, childId],
  );
  if (already.rowCount) {
    throw new AppError(409, 'COMPONENT_EXISTS', 'That raw item is already part of this Tool Kit');
  }

  const itemResult = await db.query(`${inventorySelect} WHERE i.inventory_id = $1`, [childId]);
  if (!itemResult.rowCount) {
    throw new AppError(404, 'COMPONENT_NOT_FOUND', 'Raw inventory item was not found');
  }
  const componentItem = camelize(itemResult.rows[0]);
  if (isLearningKitCategory(componentItem)) {
    throw new AppError(422, 'INVALID_COMPONENT', 'Cannot use a bundle as a Tool Kit raw item');
  }
  if (String(componentItem.lifecycleStatus || '').toUpperCase() === 'INACTIVE') {
    throw new AppError(422, 'INVALID_COMPONENT', `Raw item "${componentItem.sku}" is inactive`);
  }
  const nestedBom = await listBundleComponents(childId, db);
  if (nestedBom.length) {
    throw new AppError(422, 'INVALID_COMPONENT', 'Cannot nest a parent Tool Kit inside another Tool Kit');
  }
  if (componentItem.categoryId !== parent.categoryId) {
    throw new AppError(422, 'INVALID_COMPONENT', 'Shared raw items must belong to the same Tool Kit category');
  }
}

/**
 * Remove a raw child from a Tool Kit BOM and delete the raw inventory row
 * when it is not used by any other kit.
 */
export async function removeToolKitChild(parentInventoryId, childInventoryId, adminId) {
  return withTransaction(async (db) => {
    const parent = await loadKitMeta(db, parentInventoryId);
    if (!parent) throw new AppError(404, 'ITEM_NOT_FOUND', 'Tool Kit parent was not found');
    if (!isToolKitCategory(parent)) {
      throw new AppError(422, 'NOT_A_TOOL_KIT', 'Only Tool Kit parents support removing raw items this way');
    }

    const link = await db.query(
      `DELETE FROM inventory_bundle_components
       WHERE bundle_inventory_id = $1 AND component_inventory_id = $2
       RETURNING component_row_id`,
      [parentInventoryId, childInventoryId],
    );
    if (!link.rowCount) {
      throw new AppError(404, 'COMPONENT_NOT_FOUND', 'That raw item is not part of this Tool Kit');
    }

    const stillUsed = await db.query(
      `SELECT 1 FROM inventory_bundle_components WHERE component_inventory_id = $1 LIMIT 1`,
      [childInventoryId],
    );

    if (!stillUsed.rowCount) {
      const childMeta = await loadKitMeta(db, childInventoryId);
      if (childMeta) {
        await db.query('DELETE FROM stock_movements WHERE inventory_id = $1', [childInventoryId]);
        await db.query('DELETE FROM inventory WHERE inventory_id = $1', [childInventoryId]);
      }
    }

    await syncKitComputedStocks(parentInventoryId, adminId, db);
    return getInventory(parentInventoryId, db);
  });
}

export async function createInventoryBatch(items, adminId) {
  return withTransaction(async (db) => {
    const created = [];
    for (const item of items) {
      const id = await insertInventoryRow(db, item, adminId);
      created.push(await getInventory(id, db));
    }
    return created;
  });
}

export async function updateInventory(id, input, adminId) {
  return withTransaction(async (db) => {
    const before = await db.query(
      'SELECT sku FROM inventory WHERE inventory_id = $1 FOR UPDATE',
      [id],
    );
    if (!before.rowCount) throw new AppError(404, 'ITEM_NOT_FOUND', 'Inventory item was not found');
    const previousSku = before.rows[0].sku;

    const fields = {
      sku: 'sku', itemName: 'item_name', categoryId: 'category_id', variation: 'variation',
      price: 'price',
      internalSellingPrice: 'internal_selling_price',
      uniformGender: 'uniform_gender', uniformType: 'uniform_type', uniformSize: 'uniform_size',
      remarks: 'remarks',
      lowStockThreshold: 'low_stock_threshold', lifecycleStatus: 'lifecycle_status',
    };
    const sets = [];
    const values = [];
    for (const [key, column] of Object.entries(fields)) {
      if (Object.hasOwn(input, key)) {
        values.push(input[key]);
        sets.push(`${column} = $${values.length}`);
        if (key === 'lifecycleStatus') {
          sets.push(`archived_at = CASE WHEN $${values.length} = 'INACTIVE' THEN NOW() ELSE NULL END`);
        }
      }
    }

    if (sets.length) {
      values.push(adminId, id);
      try {
        const result = await db.query(`UPDATE inventory SET ${sets.join(', ')}, updated_by = $${values.length - 1}, updated_at = NOW()
          WHERE inventory_id = $${values.length} RETURNING inventory_id, sku`, values);
        if (!result.rowCount) throw new AppError(404, 'ITEM_NOT_FOUND', 'Inventory item was not found');

        const nextSku = result.rows[0].sku;
        if (Object.hasOwn(input, 'sku') && nextSku && nextSku !== previousSku) {
          await db.query(
            `UPDATE online_order_items SET matched_sku = $1 WHERE matched_inventory_id = $2`,
            [nextSku, id],
          );
          await db.query(
            `UPDATE stock_requests SET matched_sku = $1 WHERE inventory_id = $2`,
            [nextSku, id],
          );
        }
      } catch (error) {
        if (error?.code === '23505') {
          throw new AppError(409, 'SKU_EXISTS', 'An item with this SKU already exists');
        }
        throw error;
      }
    }

    if (Array.isArray(input.components)) {
      await replaceBundleComponents(db, id, input.components);
    }

    const meta = await loadKitMeta(db, id);
    if (meta && isVirtualKitCategory(meta)) {
      await syncKitComputedStocks(id, adminId, db);
    }

    return getInventory(id, db);
  });
}

async function assertInventoryItemDeletable(db, id, { skipKitComponentCheck = false } = {}) {
  if (!skipKitComponentCheck) {
    const asKitComponent = await db.query(
      `SELECT 1 FROM inventory_bundle_components
       WHERE component_inventory_id = $1
       LIMIT 1`,
      [id],
    );
    if (asKitComponent.rowCount) {
      throw new AppError(
        409,
        'ITEM_IN_KIT_BOM',
        'Cannot delete an item that is used as a kit component. Remove it from kit BOMs first.',
      );
    }
  }

  const orderMatches = await db.query(
    `SELECT 1 FROM online_order_item_matches WHERE inventory_id = $1 LIMIT 1`,
    [id],
  );
  if (orderMatches.rowCount) {
    throw new AppError(
      409,
      'ITEM_IN_ONLINE_ORDERS',
      'Cannot delete an item that is mapped to online order lines.',
    );
  }

  const orderLines = await db.query(
    `SELECT 1 FROM online_order_items WHERE matched_inventory_id = $1 LIMIT 1`,
    [id],
  );
  if (orderLines.rowCount) {
    throw new AppError(
      409,
      'ITEM_IN_ONLINE_ORDERS',
      'Cannot delete an item that is linked to online order lines.',
    );
  }

  const manualLines = await db.query(
    `SELECT 1 FROM manual_order_items WHERE inventory_id = $1 LIMIT 1`,
    [id],
  );
  if (manualLines.rowCount) {
    throw new AppError(
      409,
      'ITEM_IN_MANUAL_ORDERS',
      'Cannot delete an item that is linked to manual order lines.',
    );
  }

  const activeStockRequests = await db.query(
    `SELECT 1 FROM stock_requests
     WHERE inventory_id = $1
       AND status IN ('PENDING', 'SHIPPED')
     LIMIT 1`,
    [id],
  );
  if (activeStockRequests.rowCount) {
    throw new AppError(
      409,
      'ITEM_IN_STOCK_REQUESTS',
      'Cannot delete an item that still has pending or shipped stock requests.',
    );
  }
}

async function purgeInventoryItem(db, id) {
  // Preserve request history text (matched_sku) but drop the live FK so DELETE can proceed.
  await db.query(
    `UPDATE stock_requests
     SET inventory_id = NULL,
         movement_id = NULL,
         updated_at = NOW()
     WHERE inventory_id = $1`,
    [id],
  );

  await db.query('DELETE FROM channel_sku_mappings WHERE inventory_id = $1', [id]);
  await db.query('DELETE FROM channel_stock_snapshots WHERE inventory_id = $1', [id]);
  await db.query('DELETE FROM channel_allocation_logs WHERE inventory_id = $1', [id]);
  await db.query('DELETE FROM inventory_bundle_components WHERE bundle_inventory_id = $1', [id]);

  await db.query(
    `UPDATE stock_requests
     SET movement_id = NULL
     WHERE movement_id IN (SELECT movement_id FROM stock_movements WHERE inventory_id = $1)`,
    [id],
  );
  await db.query(
    `UPDATE online_order_items
     SET movement_id = NULL
     WHERE movement_id IN (SELECT movement_id FROM stock_movements WHERE inventory_id = $1)`,
    [id],
  );
  await db.query('DELETE FROM stock_movements WHERE inventory_id = $1', [id]);

  const deleted = await db.query(
    `DELETE FROM inventory WHERE inventory_id = $1
     RETURNING inventory_id, sku, item_name`,
    [id],
  );
  if (!deleted.rowCount) {
    throw new AppError(404, 'ITEM_NOT_FOUND', 'Inventory item was not found');
  }
  return deleted.rows[0];
}

/**
 * Permanently delete an inventory item (admin).
 * Requires confirmationName to match item_name exactly (trimmed).
 * Blocked when the item is tied to online-order matches, active stock requests, or another kit's BOM.
 * Completed stock requests are unlinked (inventory_id cleared; matched_sku kept).
 */
export async function deleteInventory(id, { confirmationName }, adminId) {
  return withTransaction(async (db) => {
    const itemResult = await db.query(
      `SELECT inventory_id, sku, item_name, category_id
       FROM inventory
       WHERE inventory_id = $1
       FOR UPDATE`,
      [id],
    );
    if (!itemResult.rowCount) {
      throw new AppError(404, 'ITEM_NOT_FOUND', 'Inventory item was not found');
    }

    const item = itemResult.rows[0];
    const expected = String(item.item_name || '').trim();
    const provided = String(confirmationName || '').trim();
    if (!expected || provided !== expected) {
      throw new AppError(
        422,
        'CONFIRMATION_NAME_MISMATCH',
        'Type the exact item name to confirm deletion',
      );
    }

    await assertInventoryItemDeletable(db, id);
    const deleted = await purgeInventoryItem(db, id);

    return camelize({
      ...deleted,
      deletedBy: adminId || null,
    });
  });
}

/**
 * Permanently delete a category (admin).
 * Requires confirmationName to match category_name exactly (trimmed).
 * Also deletes inventory items in the category when safe (same blockers as item delete).
 * Blocked when bundles still list this category as a BOM slot.
 */
export async function deleteCategory(id, { confirmationName }, adminId) {
  return withTransaction(async (db) => {
    const categoryResult = await db.query(
      `SELECT category_id, category_name
       FROM categories
       WHERE category_id = $1
       FOR UPDATE`,
      [id],
    );
    if (!categoryResult.rowCount) {
      throw new AppError(404, 'NOT_FOUND', 'Category not found');
    }

    const category = categoryResult.rows[0];
    const expected = String(category.category_name || '').trim();
    const provided = String(confirmationName || '').trim();
    if (!expected || provided !== expected) {
      throw new AppError(
        422,
        'CONFIRMATION_NAME_MISMATCH',
        'Type the exact category name to confirm deletion',
      );
    }

    const kitSlotUse = await db.query(
      `SELECT 1 FROM inventory_bundle_components
       WHERE component_category_id = $1
         AND component_inventory_id IS NULL
       LIMIT 1`,
      [id],
    );
    if (kitSlotUse.rowCount) {
      throw new AppError(
        409,
        'CATEGORY_IN_KIT_BOM',
        'Cannot delete a category that is still used as a bundle component slot. Remove it from kit BOMs first.',
      );
    }

    const items = await db.query(
      `SELECT inventory_id, item_name
       FROM inventory
       WHERE category_id = $1
       FOR UPDATE`,
      [id],
    );

    const externalKitUse = await db.query(
      `SELECT i.item_name
       FROM inventory_bundle_components bc
       JOIN inventory i ON i.inventory_id = bc.component_inventory_id
       JOIN inventory parent ON parent.inventory_id = bc.bundle_inventory_id
       WHERE i.category_id = $1
         AND parent.category_id <> $1
       LIMIT 1`,
      [id],
    );
    if (externalKitUse.rowCount) {
      throw new AppError(
        409,
        'ITEM_IN_KIT_BOM',
        `Cannot delete category: item "${externalKitUse.rows[0].item_name}" is used in another category's kit. Unlink it first.`,
      );
    }

    for (const item of items.rows) {
      await assertInventoryItemDeletable(db, item.inventory_id, { skipKitComponentCheck: true });
    }

    // Clear in-category kit links (parents + shared raw children) before removing items.
    await db.query(
      `DELETE FROM inventory_bundle_components
       WHERE bundle_inventory_id IN (SELECT inventory_id FROM inventory WHERE category_id = $1)
          OR component_inventory_id IN (SELECT inventory_id FROM inventory WHERE category_id = $1)`,
      [id],
    );

    for (const item of items.rows) {
      await purgeInventoryItem(db, item.inventory_id);
    }

    const deleted = await db.query(
      `DELETE FROM categories WHERE category_id = $1 RETURNING category_id, category_name`,
      [id],
    );
    if (!deleted.rowCount) {
      throw new AppError(404, 'NOT_FOUND', 'Category not found');
    }

    return camelize({
      ...deleted.rows[0],
      deletedItemCount: items.rowCount,
      deletedBy: adminId || null,
    });
  });
}

async function createMovementWithClient(db, inventoryId, input, adminId) {
  const locked = await db.query(
    `SELECT i.inventory_id, i.stocks, c.category_name, c.category_kind, c.has_child_skus
     FROM inventory i
     JOIN categories c ON c.category_id = i.category_id
     WHERE i.inventory_id = $1
     FOR UPDATE OF i`,
    [inventoryId],
  );
  if (!locked.rowCount) throw new AppError(404, 'ITEM_NOT_FOUND', 'Inventory item was not found');

  const itemRow = { ...locked.rows[0], inventory_id: locked.rows[0].inventory_id || inventoryId };
  if (await isVirtualKitParentItem(itemRow, db)) {
    const label = isToolKitCategory(locked.rows[0]) ? 'Tool Kit' : 'Bundle';
    throw new AppError(
      422,
      'VIRTUAL_KIT_STOCK',
      `${label} stock is computed from components. Adjust raw item stock instead.`,
    );
  }

  const previous = locked.rows[0].stocks;
  const { delta, next } = calculateStockChange(previous, input);

  await db.query('UPDATE inventory SET stocks = $1, updated_by = $2, updated_at = NOW() WHERE inventory_id = $3', [next, adminId, inventoryId]);
  const movement = await db.query(`INSERT INTO stock_movements
    (inventory_id, movement_type, quantity, stock_delta, previous_stock, new_stock, reference_number, remarks, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [inventoryId, input.movementType, Math.abs(delta), delta, previous, next, input.referenceNumber || null, input.remarks || null, adminId]);

  // Keep virtual kit availability in sync when a raw component moves.
  const kits = await db.query(
    `SELECT DISTINCT bundle_inventory_id
     FROM inventory_bundle_components
     WHERE component_inventory_id = $1`,
    [inventoryId],
  );
  for (const kit of kits.rows) {
    await syncKitComputedStocks(kit.bundle_inventory_id, adminId, db);
  }

  return camelize(movement.rows[0]);
}

export async function createMovement(inventoryId, input, adminId, db) {
  if (db) return createMovementWithClient(db, inventoryId, input, adminId);
  return withTransaction((client) => createMovementWithClient(client, inventoryId, input, adminId));
}

/**
 * Kit-aware stock movement (virtual kits).
 * - Bundles (LEARNING_KIT) with category-slot BOM require options.resolvedComponents
 *   (filled by the external stock request).
 * - Tool Kits with pinned child SKUs deduct those children automatically.
 */
export async function createBundleAwareMovement(inventoryId, input, adminId, db, options = {}) {
  const run = async (client) => {
    const meta = await loadKitMeta(client, inventoryId);
    if (!meta) throw new AppError(404, 'ITEM_NOT_FOUND', 'Inventory item was not found');

    const isKit = await isVirtualKitParentItem(meta, client);
    const kitLabel = isToolKitCategory(meta) ? 'Tool Kit' : 'Bundle';
    const isChannelAllocation = input.movementType === 'CHANNEL_ALLOCATION';
    const isDeduct = input.movementType === 'RELEASED'
      || input.movementType === 'ONLINE_SALE'
      || input.movementType === 'MANUAL_SALE'
      || input.movementType === 'STOCK_OUT'
      || input.movementType === 'DAMAGED'
      || (isChannelAllocation && input.direction === 'DEDUCT');
    const kitQty = Number(input.quantity) || 0;

    let toMove = [];
    if (Array.isArray(options.resolvedComponents) && options.resolvedComponents.length) {
      toMove = options.resolvedComponents.map((row) => ({
        inventoryId: row.inventoryId || row.componentInventoryId,
        quantity: Number(row.quantity || 0),
        sku: row.sku || null,
      })).filter((row) => row.inventoryId && row.quantity > 0);
    } else if (isKit) {
      const bom = await listBundleComponents(inventoryId, client);
      const pinned = bom.filter((row) => row.isPinned);
      if (pinned.length && pinned.length === bom.length) {
        toMove = pinned.map((row) => ({
          inventoryId: row.componentInventoryId,
          quantity: kitQty * Math.max(1, Number(row.quantity) || 1),
          sku: row.sku,
        }));
      } else {
        throw new AppError(
          422,
          'KIT_COMPONENTS_REQUIRED',
          `${kitLabel} movements need concrete component items from the stock request (category slots are filled by the requester).`,
        );
      }
    }

    if (isKit) {
      if (!toMove.length) {
        throw new AppError(422, 'KIT_COMPONENTS_REQUIRED', `${kitLabel} movement requires concrete component items`);
      }

      if (isDeduct) {
        for (const component of toMove) {
          const locked = await client.query(
            'SELECT stocks, sku FROM inventory WHERE inventory_id = $1 FOR UPDATE',
            [component.inventoryId],
          );
          if (!locked.rowCount) {
            throw new AppError(404, 'ITEM_NOT_FOUND', `Component ${component.sku || component.inventoryId} was not found`);
          }
          if (Number(locked.rows[0].stocks) < component.quantity) {
            throw new AppError(
              409,
              'INSUFFICIENT_STOCK',
              `Component ${locked.rows[0].sku} only has ${locked.rows[0].stocks} unit(s) available`,
            );
          }
        }
      }

      const componentMovements = [];
      for (const component of toMove) {
        const componentMeta = await loadKitMeta(client, component.inventoryId);
        let movement;
        if (componentMeta && isToolKitCategory(componentMeta)) {
          // Nested Tool Kit parent chosen as a bundle component: deduct its raw children.
          movement = await createBundleAwareMovement(
            component.inventoryId,
            {
              ...input,
              quantity: component.quantity,
              remarks: `${input.remarks || `${kitLabel} movement`} · tool kit ${component.sku || component.inventoryId}`.slice(0, 500),
            },
            adminId,
            client,
            {},
          );
        } else {
          movement = await createMovementWithClient(client, component.inventoryId, {
            ...input,
            quantity: component.quantity,
            remarks: `${input.remarks || `${kitLabel} movement`} · component ${component.sku || component.inventoryId}`.slice(0, 500),
          }, adminId);
        }
        componentMovements.push(movement);
      }

      const sync = await syncKitComputedStocks(inventoryId, adminId, client);
      return {
        primary: {
          inventoryId,
          movementType: input.movementType,
          quantity: kitQty,
          virtualKit: true,
          newStock: sync?.stocks ?? 0,
        },
        components: componentMovements,
      };
    }

    if (isDeduct && toMove.length) {
      for (const component of toMove) {
        const locked = await client.query(
          'SELECT stocks, sku FROM inventory WHERE inventory_id = $1 FOR UPDATE',
          [component.inventoryId],
        );
        if (!locked.rowCount) {
          throw new AppError(404, 'ITEM_NOT_FOUND', `Component ${component.sku || component.inventoryId} was not found`);
        }
        if (Number(locked.rows[0].stocks) < component.quantity) {
          throw new AppError(
            409,
            'INSUFFICIENT_STOCK',
            `Component ${locked.rows[0].sku} only has ${locked.rows[0].stocks} unit(s) available`,
          );
        }
      }
    }

    const primary = await createMovementWithClient(client, inventoryId, input, adminId);
    if (!toMove.length) return { primary, components: [] };

    const componentMovements = [];
    for (const component of toMove) {
      const movement = await createMovementWithClient(client, component.inventoryId, {
        ...input,
        quantity: component.quantity,
        remarks: `${input.remarks || 'Kit movement'} · component ${component.sku || component.inventoryId}`.slice(0, 500),
      }, adminId);
      componentMovements.push(movement);
    }
    return { primary, components: componentMovements };
  };

  if (db) return run(db);
  return withTransaction(run);
}

export async function listMovements(query) {
  const values = [];
  const where = [];
  const add = (value) => { values.push(value); return `$${values.length}`; };
  if (query.inventoryId) where.push(`m.inventory_id = ${add(query.inventoryId)}`);
  if (query.type) where.push(`m.movement_type = ${add(query.type)}`);
  if (query.types) {
    const types = String(query.types).split(',').map((value) => value.trim()).filter(Boolean);
    if (types.length) where.push(`m.movement_type = ANY(${add(types)}::text[])`);
  }
  if (query.excludeTypes) {
    const types = String(query.excludeTypes).split(',').map((value) => value.trim()).filter(Boolean);
    if (types.length) where.push(`NOT (m.movement_type = ANY(${add(types)}::text[]))`);
  }
  if (query.from) where.push(`m.created_at >= ${add(query.from)}`);
  if (query.to) where.push(`m.created_at < ${add(query.to)}`);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await pool.query(`SELECT COUNT(*) FROM stock_movements m ${clause}`, values);
  values.push(query.limit, (query.page - 1) * query.limit);
  const result = await pool.query(`SELECT m.*, i.sku, i.item_name, a.full_name AS created_by_name
    FROM stock_movements m JOIN inventory i ON i.inventory_id=m.inventory_id
    JOIN users a ON a.user_id=m.created_by ${clause}
    ORDER BY m.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
  return { data: camelize(result.rows), total: Number(count.rows[0].count) };
}
