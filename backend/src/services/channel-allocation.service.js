import { pool, withTransaction } from '../database/pool.js';
import { AppError, camelize } from '../utils/api.js';
import * as inventory from './inventory.service.js';

export const DEFAULT_CHANNEL = 'SHOPEE';

const listSelect = `SELECT s.*, i.sku, i.item_name, i.stocks AS rhet_stocks, i.lifecycle_status
  FROM channel_stock_snapshots s
  JOIN inventory i ON i.inventory_id = s.inventory_id`;

export async function listAllocations(query = {}) {
  const values = [];
  const where = [];
  const add = (value) => { values.push(value); return `$${values.length}`; };

  where.push(`s.channel = ${add(query.channel || DEFAULT_CHANNEL)}`);
  const clause = `WHERE ${where.join(' AND ')}`;

  const result = await pool.query(
    `${listSelect} ${clause} ORDER BY i.item_name ASC`,
    values,
  );
  return camelize(result.rows);
}

async function upsertSnapshot(db, channel, inventoryId, delta) {
  const result = await db.query(
    `INSERT INTO channel_stock_snapshots (channel, inventory_id, allocated_qty, last_synced_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (channel, inventory_id) DO UPDATE SET
       allocated_qty = channel_stock_snapshots.allocated_qty + $3,
       last_synced_at = NOW(),
       updated_at = NOW()
     RETURNING *`,
    [channel, inventoryId, delta],
  );
  return result.rows[0];
}

async function logAllocation(db, { channel, inventoryId, direction, quantity, movementId, actorId }) {
  await db.query(
    `INSERT INTO channel_allocation_logs (channel, inventory_id, direction, quantity, movement_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [channel, inventoryId, direction, quantity, movementId, actorId],
  );
}

export async function allocate({ inventoryId, channel = DEFAULT_CHANNEL, quantity, remarks }, admin) {
  const actorId = typeof admin === 'object' ? admin.user_id : admin;

  return withTransaction(async (db) => {
    const result = await inventory.createBundleAwareMovement(
      inventoryId,
      {
        movementType: 'CHANNEL_ALLOCATION',
        quantity,
        direction: 'DEDUCT',
        referenceNumber: channel,
        remarks: remarks || `Allocated ${quantity} unit(s) to ${channel}`,
      },
      actorId,
      db,
    );

    const movement = result.primary || result;
    const movementId = movement.movementId || movement.movement_id;
    const snapshot = await upsertSnapshot(db, channel, inventoryId, quantity);
    await logAllocation(db, { channel, inventoryId, direction: 'ALLOCATE', quantity, movementId, actorId });

    // Mirror allocation qty onto each kit component so channel stock stays consistent.
    for (const componentMovement of result.components || []) {
      const componentId = componentMovement.inventoryId || componentMovement.inventory_id;
      const componentQty = componentMovement.quantity;
      await upsertSnapshot(db, channel, componentId, componentQty);
      await logAllocation(db, {
        channel,
        inventoryId: componentId,
        direction: 'ALLOCATE',
        quantity: componentQty,
        movementId: componentMovement.movementId || componentMovement.movement_id,
        actorId,
      });
    }

    return camelize(snapshot);
  });
}

export async function deallocate({ inventoryId, channel = DEFAULT_CHANNEL, quantity, remarks }, admin) {
  const actorId = typeof admin === 'object' ? admin.user_id : admin;

  return withTransaction(async (db) => {
    const snapshotResult = await db.query(
      `SELECT * FROM channel_stock_snapshots WHERE channel = $1 AND inventory_id = $2 FOR UPDATE`,
      [channel, inventoryId],
    );
    const current = snapshotResult.rows[0];
    if (!current || current.allocated_qty < quantity) {
      throw new AppError(
        409,
        'INSUFFICIENT_ALLOCATION',
        `Only ${current?.allocated_qty ?? 0} unit(s) are currently allocated to ${channel}`,
      );
    }

    const result = await inventory.createBundleAwareMovement(
      inventoryId,
      {
        movementType: 'CHANNEL_ALLOCATION',
        quantity,
        direction: 'ADD',
        referenceNumber: channel,
        remarks: remarks || `Deallocated ${quantity} unit(s) from ${channel} back to warehouse`,
      },
      actorId,
      db,
    );

    const movement = result.primary || result;
    const movementId = movement.movementId || movement.movement_id;
    const snapshot = await upsertSnapshot(db, channel, inventoryId, -quantity);
    await logAllocation(db, { channel, inventoryId, direction: 'DEALLOCATE', quantity, movementId, actorId });

    for (const componentMovement of result.components || []) {
      const componentId = componentMovement.inventoryId || componentMovement.inventory_id;
      const componentQty = componentMovement.quantity;
      await upsertSnapshot(db, channel, componentId, -componentQty);
      await logAllocation(db, {
        channel,
        inventoryId: componentId,
        direction: 'DEALLOCATE',
        quantity: componentQty,
        movementId: componentMovement.movementId || componentMovement.movement_id,
        actorId,
      });
    }

    return camelize(snapshot);
  });
}
