import { pool, withTransaction } from '../database/pool.js';
import { AppError, camelize } from '../utils/api.js';
import { calculateStockChange } from './stock-rules.js';

const inventorySelect = `SELECT i.*, c.category_name
  FROM inventory i JOIN categories c ON c.category_id = i.category_id`;

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
  return { data: camelize(result.rows), total: Number(count.rows[0].count) };
}

export async function getInventory(id, db = pool) {
  const result = await db.query(`${inventorySelect} WHERE i.inventory_id = $1`, [id]);
  if (!result.rowCount) throw new AppError(404, 'ITEM_NOT_FOUND', 'Inventory item was not found');
  return camelize(result.rows[0]);
}

export async function createInventory(input, adminId) {
  return withTransaction(async (db) => {
    const result = await db.query(`INSERT INTO inventory
      (sku, item_name, stocks, category_id, variation, price, low_stock_threshold, created_by, updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING inventory_id`,
      [input.sku, input.itemName, input.stocks, input.categoryId, input.variation || null, input.price, input.lowStockThreshold, adminId]);
    const id = result.rows[0].inventory_id;
    if (input.stocks > 0) {
      await db.query(`INSERT INTO stock_movements
        (inventory_id, movement_type, quantity, stock_delta, previous_stock, new_stock, remarks, created_by)
        VALUES ($1,'STOCK_IN',$2,$2,0,$2,'Initial stock',$3)`, [id, input.stocks, adminId]);
    }
    return getInventory(id, db);
  });
}

export async function updateInventory(id, input, adminId) {
  const fields = {
    sku: 'sku', itemName: 'item_name', categoryId: 'category_id', variation: 'variation',
    price: 'price', lowStockThreshold: 'low_stock_threshold', lifecycleStatus: 'lifecycle_status',
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
  values.push(adminId, id);
  const result = await pool.query(`UPDATE inventory SET ${sets.join(', ')}, updated_by = $${values.length - 1}, updated_at = NOW()
    WHERE inventory_id = $${values.length} RETURNING inventory_id`, values);
  if (!result.rowCount) throw new AppError(404, 'ITEM_NOT_FOUND', 'Inventory item was not found');
  return getInventory(id);
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
