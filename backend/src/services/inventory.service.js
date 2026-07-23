import { pool, withTransaction } from '../database/pool.js';
import { AppError, camelize } from '../utils/api.js';
import { calculateStockChange } from './stock-rules.js';

const inventorySelect = `SELECT i.*, c.category_name
  FROM inventory i JOIN categories c ON c.category_id = i.category_id`;

const componentSelect = `SELECT bc.component_row_id, bc.bundle_inventory_id,
    bc.component_category_id, bc.component_inventory_id, bc.quantity, bc.created_at,
    cat.category_name,
    i.sku, i.item_name, i.stocks, i.uniform_gender, i.uniform_type, i.uniform_size
  FROM inventory_bundle_components bc
  JOIN categories cat ON cat.category_id = bc.component_category_id
  LEFT JOIN inventory i ON i.inventory_id = bc.component_inventory_id`;

export function isLearningKitCategoryName(categoryName = '') {
  return String(categoryName || '').trim().toLowerCase() === 'learning kit';
}

export async function listBundleComponents(bundleInventoryId, db = pool) {
  const result = await db.query(
    `${componentSelect} WHERE bc.bundle_inventory_id = $1 ORDER BY cat.category_name, i.item_name NULLS LAST`,
    [bundleInventoryId],
  );
  return camelize(result.rows).map((row) => ({
    ...row,
    categoryId: row.componentCategoryId,
    isPinned: Boolean(row.componentInventoryId),
  }));
}

async function attachComponents(items, db = pool) {
  if (!items.length) return items;
  const ids = items.map((row) => row.inventoryId);
  const result = await db.query(
    `${componentSelect} WHERE bc.bundle_inventory_id = ANY($1::uuid[]) ORDER BY cat.category_name, i.item_name NULLS LAST`,
    [ids],
  );
  const byBundle = new Map();
  for (const row of camelize(result.rows)) {
    const list = byBundle.get(row.bundleInventoryId) || [];
    list.push({
      ...row,
      categoryId: row.componentCategoryId,
      isPinned: Boolean(row.componentInventoryId),
    });
    byBundle.set(row.bundleInventoryId, list);
  }
  return items.map((item) => ({
    ...item,
    components: byBundle.get(item.inventoryId) || [],
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
  const result = await pool.query(`${inventorySelect} ${clause} ORDER BY ${sort} ${query.order} LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
  const data = await attachComponents(camelize(result.rows));
  return { data, total: Number(count.rows[0].count) };
}

export async function getInventory(id, db = pool) {
  const result = await db.query(`${inventorySelect} WHERE i.inventory_id = $1`, [id]);
  if (!result.rowCount) throw new AppError(404, 'ITEM_NOT_FOUND', 'Inventory item was not found');
  const [item] = await attachComponents([camelize(result.rows[0])], db);
  return item;
}

async function replaceBundleComponents(db, bundleInventoryId, components = []) {
  const rows = components || [];
  if (!rows.length) {
    await db.query('DELETE FROM inventory_bundle_components WHERE bundle_inventory_id = $1', [bundleInventoryId]);
    return;
  }

  const normalized = [];
  const seenCategories = new Set();

  for (const row of rows) {
    const categoryId = row.categoryId || row.componentCategoryId;
    if (!categoryId) {
      throw new AppError(422, 'INVALID_COMPONENT', 'Each kit component requires a category');
    }

    const categoryResult = await db.query(
      'SELECT category_id, category_name FROM categories WHERE category_id = $1',
      [categoryId],
    );
    if (!categoryResult.rowCount) {
      throw new AppError(422, 'COMPONENT_NOT_FOUND', 'One or more component categories were not found');
    }
    const categoryName = categoryResult.rows[0].category_name;
    if (isLearningKitCategoryName(categoryName)) {
      throw new AppError(422, 'INVALID_COMPONENT', 'A Learning Kit cannot include another Learning Kit');
    }
    if (seenCategories.has(categoryId)) {
      throw new AppError(422, 'INVALID_COMPONENT', `Category "${categoryName}" is already included in this kit`);
    }
    seenCategories.add(categoryId);
    // All BOM slots are category-only. Concrete SKUs are chosen on the stock request.
    normalized.push({ categoryId, componentInventoryId: null });
  }

  await db.query('DELETE FROM inventory_bundle_components WHERE bundle_inventory_id = $1', [bundleInventoryId]);
  for (const row of normalized) {
    await db.query(
      `INSERT INTO inventory_bundle_components
        (bundle_inventory_id, component_category_id, component_inventory_id, quantity)
       VALUES ($1, $2, $3, 1)`,
      [bundleInventoryId, row.categoryId, row.componentInventoryId],
    );
  }
}

async function insertInventoryRow(db, input, adminId) {
  const result = await db.query(`INSERT INTO inventory
    (sku, item_name, stocks, category_id, variation, price, uniform_gender, uniform_type, uniform_size, low_stock_threshold, created_by, updated_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING inventory_id`,
    [input.sku, input.itemName, input.stocks, input.categoryId, input.variation || null, input.price, input.uniformGender || null, input.uniformType || null, input.uniformSize || null, input.lowStockThreshold, adminId]);
  const id = result.rows[0].inventory_id;
  if (input.stocks > 0) {
    await db.query(`INSERT INTO stock_movements
      (inventory_id, movement_type, quantity, stock_delta, previous_stock, new_stock, remarks, created_by)
      VALUES ($1,'STOCK_IN',$2,$2,0,$2,'Initial stock',$3)`, [id, input.stocks, adminId]);
  }
  if (Array.isArray(input.components)) {
    await replaceBundleComponents(db, id, input.components);
  }
  return id;
}

export async function createInventory(input, adminId) {
  return withTransaction(async (db) => {
    const id = await insertInventoryRow(db, input, adminId);
    return getInventory(id, db);
  });
}

// Creates several inventory rows atomically (used for uniform sets, e.g. the
// Polo + Short pair). Any failure rolls back every row in the batch.
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
    const fields = {
      sku: 'sku', itemName: 'item_name', categoryId: 'category_id', variation: 'variation',
      price: 'price',
      uniformGender: 'uniform_gender', uniformType: 'uniform_type', uniformSize: 'uniform_size',
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
      const result = await db.query(`UPDATE inventory SET ${sets.join(', ')}, updated_by = $${values.length - 1}, updated_at = NOW()
        WHERE inventory_id = $${values.length} RETURNING inventory_id`, values);
      if (!result.rowCount) throw new AppError(404, 'ITEM_NOT_FOUND', 'Inventory item was not found');
    } else {
      const exists = await db.query('SELECT 1 FROM inventory WHERE inventory_id = $1', [id]);
      if (!exists.rowCount) throw new AppError(404, 'ITEM_NOT_FOUND', 'Inventory item was not found');
    }

    if (Array.isArray(input.components)) {
      await replaceBundleComponents(db, id, input.components);
    }

    return getInventory(id, db);
  });
}

async function createMovementWithClient(db, inventoryId, input, adminId) {
  const locked = await db.query('SELECT stocks FROM inventory WHERE inventory_id = $1 FOR UPDATE', [inventoryId]);
  if (!locked.rowCount) throw new AppError(404, 'ITEM_NOT_FOUND', 'Inventory item was not found');
  const previous = locked.rows[0].stocks;
  const { delta, next } = calculateStockChange(previous, input);

  await db.query('UPDATE inventory SET stocks = $1, updated_by = $2, updated_at = NOW() WHERE inventory_id = $3', [next, adminId, inventoryId]);
  const movement = await db.query(`INSERT INTO stock_movements
    (inventory_id, movement_type, quantity, stock_delta, previous_stock, new_stock, reference_number, remarks, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [inventoryId, input.movementType, Math.abs(delta), delta, previous, next, input.referenceNumber || null, input.remarks || null, adminId]);
  return camelize(movement.rows[0]);
}

export async function createMovement(inventoryId, input, adminId, db) {
  if (db) return createMovementWithClient(db, inventoryId, input, adminId);
  return withTransaction((client) => createMovementWithClient(client, inventoryId, input, adminId));
}

// Deducts/restores a kit plus request-resolved components.
// - options.resolvedComponents: explicit [{ inventoryId, quantity, sku? }] from stock-request approve
// - CHANNEL_ALLOCATION (Option A): kit stock only — BOM slots are category-only, so no
//   component SKUs are known at allocate time
export async function createBundleAwareMovement(inventoryId, input, adminId, db, options = {}) {
  const run = async (client) => {
    const isChannelAllocation = input.movementType === 'CHANNEL_ALLOCATION';
    const isDeduct = input.movementType === 'RELEASED'
      || input.movementType === 'ONLINE_SALE'
      || input.movementType === 'STOCK_OUT'
      || input.movementType === 'DAMAGED'
      || (isChannelAllocation && input.direction === 'DEDUCT');

    let toMove = [];
    if (Array.isArray(options.resolvedComponents)) {
      toMove = options.resolvedComponents.map((row) => ({
        inventoryId: row.inventoryId || row.componentInventoryId,
        quantity: Number(row.quantity || 0),
        sku: row.sku || null,
      })).filter((row) => row.inventoryId && row.quantity > 0);
    }
    // CHANNEL_ALLOCATION and any path without resolvedComponents: kit row only.

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
