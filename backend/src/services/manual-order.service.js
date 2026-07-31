import { pool, withTransaction } from '../database/pool.js';
import { AppError, camelize } from '../utils/api.js';
import * as inventory from './inventory.service.js';

export const FULFILLMENT_RANK = {
  PROCESSING: 0,
  READY_TO_SHIP: 1,
  SHIPPED: 2,
  RECEIVED: 3,
  RETURN: 4,
  RETURN_CONFIRMED: 5,
  CANCELLED: -1,
};

export const FULFILLMENT_TRANSITIONS = {
  PROCESSING: ['READY_TO_SHIP', 'CANCELLED'],
  READY_TO_SHIP: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['RECEIVED', 'RETURN'],
  RECEIVED: ['RETURN'],
  RETURN: ['RETURN_CONFIRMED'],
  RETURN_CONFIRMED: [],
  CANCELLED: [],
};

export function shipmentRequiresDeduction(fromStatus, toStatus) {
  if (toStatus === 'CANCELLED' || toStatus === 'RETURN' || toStatus === 'RETURN_CONFIRMED') return false;
  const fromRank = FULFILLMENT_RANK[fromStatus] ?? -1;
  const toRank = FULFILLMENT_RANK[toStatus];
  if (toRank == null) return false;
  return toRank >= FULFILLMENT_RANK.SHIPPED && fromRank < FULFILLMENT_RANK.SHIPPED;
}

async function nextOrderNumber(db = pool) {
  const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const prefix = `MO-${day}-`;
  const result = await db.query(
    `SELECT order_number FROM manual_orders
     WHERE order_number LIKE $1
     ORDER BY order_number DESC
     LIMIT 1`,
    [`${prefix}%`],
  );
  let seq = 1;
  if (result.rowCount) {
    const last = String(result.rows[0].order_number || '');
    const part = last.slice(prefix.length);
    const n = Number.parseInt(part, 10);
    if (Number.isFinite(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

async function loadOrderItems(orderId, db = pool) {
  const result = await db.query(
    `SELECT moi.*, i.stocks AS current_stocks, i.status AS inventory_status
     FROM manual_order_items moi
     LEFT JOIN inventory i ON i.inventory_id = moi.inventory_id
     WHERE moi.order_id = $1
     ORDER BY moi.created_at ASC`,
    [orderId],
  );
  return result.rows;
}

async function loadOrderBundle(orderId, db = pool) {
  const orderResult = await db.query('SELECT * FROM manual_orders WHERE order_id = $1', [orderId]);
  if (!orderResult.rowCount) throw new AppError(404, 'ORDER_NOT_FOUND', 'Manual order was not found');
  const items = await loadOrderItems(orderId, db);
  return camelize({
    ...orderResult.rows[0],
    items,
  });
}

async function assertShipmentStock(db, orderId) {
  const items = await loadOrderItems(orderId, db);
  const active = items.filter((row) => row.line_status !== 'CANCELLED');
  if (!active.length) {
    throw new AppError(409, 'NO_ITEMS', 'Cannot mark shipped — this order has no active line items');
  }

  const shortages = [];
  for (const item of active) {
    if (item.line_status === 'DEDUCTED') continue;
    const locked = await db.query(
      'SELECT inventory_id, sku, item_name, stocks FROM inventory WHERE inventory_id = $1 FOR UPDATE',
      [item.inventory_id],
    );
    if (!locked.rowCount) {
      shortages.push({
        inventoryId: item.inventory_id,
        sku: item.sku,
        required: item.quantity,
        available: 0,
      });
      continue;
    }
    const available = Number(locked.rows[0].stocks) || 0;
    if (available < item.quantity) {
      shortages.push({
        inventoryId: item.inventory_id,
        sku: locked.rows[0].sku,
        itemName: locked.rows[0].item_name,
        required: item.quantity,
        available,
      });
    }
  }

  if (shortages.length) {
    const summary = shortages
      .map((row) => `${row.sku || 'item'}: need ${row.required}, have ${row.available}`)
      .join('; ');
    throw new AppError(
      409,
      'INSUFFICIENT_STOCK',
      `Cannot mark shipped — insufficient stock (${summary})`,
      { shortages },
    );
  }

  return active;
}

async function deductOrderForShipment(db, order, actorId) {
  const items = await assertShipmentStock(db, order.order_id);

  for (const item of items) {
    if (item.line_status === 'CANCELLED' || item.line_status === 'DEDUCTED') continue;

    const movement = await inventory.createMovement(
      item.inventory_id,
      {
        movementType: 'MANUAL_SALE',
        quantity: item.quantity,
        referenceNumber: order.order_number,
        remarks: `Manual order ${order.order_number} · ${order.courier_name || 'HQ courier'}`.trim(),
      },
      actorId,
      db,
    );

    await db.query(
      `UPDATE manual_order_items
       SET line_status = 'DEDUCTED',
           movement_id = $1,
           updated_at = NOW()
       WHERE order_item_id = $2`,
      [movement.movementId, item.order_item_id],
    );
  }
}

export async function listManualOrders(query = {}) {
  const values = [];
  const where = [];
  const add = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (query.fulfillmentStatus) {
    where.push(`fulfillment_status = ${add(query.fulfillmentStatus)}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Number(query.limit) || 20;
  const page = Number(query.page) || 1;
  const offset = (page - 1) * limit;

  const count = await pool.query(
    `SELECT COUNT(*)::int AS total FROM manual_orders ${whereSql}`,
    values,
  );
  const list = await pool.query(
    `SELECT * FROM manual_orders ${whereSql}
     ORDER BY created_at DESC
     LIMIT ${add(limit)} OFFSET ${add(offset)}`,
    values,
  );

  const orders = camelize(list.rows);
  if (!orders.length) {
    return { data: [], total: count.rows[0].total };
  }

  const ids = orders.map((row) => row.orderId);
  const itemsResult = await pool.query(
    `SELECT moi.*, i.stocks AS current_stocks
     FROM manual_order_items moi
     LEFT JOIN inventory i ON i.inventory_id = moi.inventory_id
     WHERE moi.order_id = ANY($1::uuid[])
     ORDER BY moi.created_at ASC`,
    [ids],
  );
  const itemsByOrder = new Map();
  for (const row of camelize(itemsResult.rows)) {
    const listForOrder = itemsByOrder.get(row.orderId) || [];
    listForOrder.push(row);
    itemsByOrder.set(row.orderId, listForOrder);
  }

  return {
    data: orders.map((order) => ({
      ...order,
      items: itemsByOrder.get(order.orderId) || [],
    })),
    total: count.rows[0].total,
  };
}

export async function getManualOrder(orderId) {
  return loadOrderBundle(orderId);
}

export async function createManualOrder(input, admin) {
  const adminId = typeof admin === 'object' ? admin.user_id : admin;

  return withTransaction(async (db) => {
    const orderNumber = await nextOrderNumber(db);
    const orderResult = await db.query(
      `INSERT INTO manual_orders (
        order_number, customer_name, customer_phone, shipping_address,
        courier_name, tracking_number, notes, fulfillment_status, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'PROCESSING',$8)
      RETURNING *`,
      [
        orderNumber,
        input.customerName,
        input.customerPhone || null,
        input.shippingAddress || null,
        input.courierName || null,
        input.trackingNumber || null,
        input.notes || null,
        adminId || null,
      ],
    );

    const order = orderResult.rows[0];

    for (const line of input.items) {
      const inv = await db.query(
        `SELECT inventory_id, sku, item_name, status
         FROM inventory WHERE inventory_id = $1`,
        [line.inventoryId],
      );
      if (!inv.rowCount) {
        throw new AppError(404, 'ITEM_NOT_FOUND', `Inventory item ${line.inventoryId} was not found`);
      }
      if (String(inv.rows[0].status).toUpperCase() === 'INACTIVE') {
        throw new AppError(409, 'ITEM_INACTIVE', `Inventory item ${inv.rows[0].sku} is inactive`);
      }

      await db.query(
        `INSERT INTO manual_order_items (
          order_id, inventory_id, sku, item_name, quantity, line_status
        ) VALUES ($1,$2,$3,$4,$5,'MATCHED')`,
        [
          order.order_id,
          inv.rows[0].inventory_id,
          inv.rows[0].sku,
          inv.rows[0].item_name,
          line.quantity,
        ],
      );
    }

    return loadOrderBundle(order.order_id, db);
  });
}

export async function updateManualOrder(orderId, input) {
  return withTransaction(async (db) => {
    const existing = await db.query(
      'SELECT * FROM manual_orders WHERE order_id = $1 FOR UPDATE',
      [orderId],
    );
    if (!existing.rowCount) throw new AppError(404, 'ORDER_NOT_FOUND', 'Manual order was not found');

    const order = existing.rows[0];
    if (order.fulfillment_status === 'CANCELLED') {
      throw new AppError(409, 'ORDER_CANCELLED', 'A cancelled order cannot be edited');
    }

    const shipped = FULFILLMENT_RANK[order.fulfillment_status] >= FULFILLMENT_RANK.SHIPPED;
    if (shipped && (input.customerName || input.customerPhone !== undefined || input.shippingAddress !== undefined)) {
      throw new AppError(
        409,
        'ORDER_SHIPPED',
        'After shipping, only courier, tracking, and notes can be updated',
      );
    }

    await db.query(
      `UPDATE manual_orders SET
        customer_name = COALESCE($1, customer_name),
        customer_phone = CASE WHEN $2::boolean THEN $3 ELSE customer_phone END,
        shipping_address = CASE WHEN $4::boolean THEN $5 ELSE shipping_address END,
        courier_name = CASE WHEN $6::boolean THEN $7 ELSE courier_name END,
        tracking_number = CASE WHEN $8::boolean THEN $9 ELSE tracking_number END,
        notes = CASE WHEN $10::boolean THEN $11 ELSE notes END,
        updated_at = NOW()
       WHERE order_id = $12`,
      [
        input.customerName || null,
        input.customerPhone !== undefined,
        input.customerPhone !== undefined ? input.customerPhone : null,
        input.shippingAddress !== undefined,
        input.shippingAddress !== undefined ? input.shippingAddress : null,
        input.courierName !== undefined,
        input.courierName !== undefined ? input.courierName : null,
        input.trackingNumber !== undefined,
        input.trackingNumber !== undefined ? input.trackingNumber : null,
        input.notes !== undefined,
        input.notes !== undefined ? input.notes : null,
        orderId,
      ],
    );

    return loadOrderBundle(orderId, db);
  });
}

export async function updateFulfillmentStatus(orderId, targetStatus, admin) {
  const adminId = typeof admin === 'object' ? admin.user_id : admin;

  return withTransaction(async (db) => {
    const orderResult = await db.query(
      'SELECT * FROM manual_orders WHERE order_id = $1 FOR UPDATE',
      [orderId],
    );
    if (!orderResult.rowCount) throw new AppError(404, 'ORDER_NOT_FOUND', 'Manual order was not found');

    const order = orderResult.rows[0];
    if (order.fulfillment_status === 'CANCELLED') {
      throw new AppError(409, 'ORDER_CANCELLED', 'A cancelled order cannot move through fulfillment');
    }

    const allowed = FULFILLMENT_TRANSITIONS[order.fulfillment_status] || [];
    if (!allowed.includes(targetStatus)) {
      throw new AppError(
        409,
        'INVALID_FULFILLMENT_TRANSITION',
        `Cannot move from ${order.fulfillment_status} to ${targetStatus}`,
      );
    }

    if (shipmentRequiresDeduction(order.fulfillment_status, targetStatus)) {
      await deductOrderForShipment(db, order, adminId);
    }

    await db.query(
      `UPDATE manual_orders
       SET fulfillment_status = $1,
           shipped_at = CASE WHEN $1 = 'SHIPPED' THEN COALESCE(shipped_at, NOW()) ELSE shipped_at END,
           updated_at = NOW()
       WHERE order_id = $2`,
      [targetStatus, orderId],
    );

    return loadOrderBundle(orderId, db);
  });
}

export async function cancelManualOrder(orderId) {
  return withTransaction(async (db) => {
    const orderResult = await db.query(
      'SELECT * FROM manual_orders WHERE order_id = $1 FOR UPDATE',
      [orderId],
    );
    if (!orderResult.rowCount) throw new AppError(404, 'ORDER_NOT_FOUND', 'Manual order was not found');

    const order = orderResult.rows[0];
    if (order.fulfillment_status === 'CANCELLED') {
      return loadOrderBundle(orderId, db);
    }
    if (FULFILLMENT_RANK[order.fulfillment_status] >= FULFILLMENT_RANK.SHIPPED) {
      throw new AppError(
        409,
        'ALREADY_SHIPPED',
        'Shipped orders cannot be cancelled — use the return flow instead',
      );
    }

    await db.query(
      `UPDATE manual_orders SET fulfillment_status = 'CANCELLED', updated_at = NOW() WHERE order_id = $1`,
      [orderId],
    );
    await db.query(
      `UPDATE manual_order_items
       SET line_status = 'CANCELLED', updated_at = NOW()
       WHERE order_id = $1 AND line_status <> 'DEDUCTED'`,
      [orderId],
    );

    return loadOrderBundle(orderId, db);
  });
}

export async function confirmReturn(orderId, { reusable, notes }, admin) {
  const adminId = typeof admin === 'object' ? admin.user_id : admin;

  return withTransaction(async (db) => {
    const orderResult = await db.query(
      'SELECT * FROM manual_orders WHERE order_id = $1 FOR UPDATE',
      [orderId],
    );
    if (!orderResult.rowCount) throw new AppError(404, 'ORDER_NOT_FOUND', 'Manual order was not found');

    const order = orderResult.rows[0];
    if (order.fulfillment_status !== 'RETURN') {
      throw new AppError(409, 'ORDER_NOT_IN_RETURN', 'This order is not currently in the return column');
    }

    const items = await loadOrderItems(orderId, db);
    const restorable = items.filter((item) => item.line_status === 'DEDUCTED');

    if (reusable) {
      for (const item of restorable) {
        await inventory.createMovement(
          item.inventory_id,
          {
            movementType: 'RETURN',
            quantity: item.quantity,
            referenceNumber: order.order_number,
            remarks: notes
              || `Reusable return confirmed for manual order ${order.order_number}`,
          },
          adminId,
          db,
        );
      }
    }

    await db.query(
      `UPDATE manual_orders
       SET fulfillment_status = 'RETURN_CONFIRMED',
           notes = CASE
             WHEN $1::text IS NULL OR $1 = '' THEN notes
             WHEN notes IS NULL OR notes = '' THEN $1
             ELSE notes || ' | ' || $1
           END,
           updated_at = NOW()
       WHERE order_id = $2`,
      [notes || null, orderId],
    );

    return loadOrderBundle(orderId, db);
  });
}
