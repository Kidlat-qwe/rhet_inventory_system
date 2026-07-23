/**
 * Reset the inventory catalogue so you can start over adding items/stocks.
 *
 * WHAT IT DOES (inside a single transaction):
 *   1. Un-links online order lines from inventory / movements (records kept, but
 *      matched_inventory_id / movement_id set NULL and lines reset to UNMATCHED).
 *   2. Deletes ALL stock requests (this also clears the Release Logs, which are
 *      the FULFILLED stock requests).
 *   3. Deletes channel allocation logs, channel stock snapshots and channel SKU
 *      mappings (they reference inventory with NOT NULL).
 *   4. Deletes all stock movements.
 *   5. Deletes all inventory items.
 *
 * WHAT IT KEEPS: categories, users, integration clients, and online orders
 * (order records are only un-linked, not removed).
 *
 * USAGE:
 *   node scripts/reset-inventory.mjs           # dry run: prints current counts only
 *   node scripts/reset-inventory.mjs --yes     # actually performs the reset
 */
import { pool } from '../src/database/pool.js';

const CONFIRM = process.argv.includes('--yes');

async function counts() {
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM inventory)                AS inventory,
      (SELECT COUNT(*) FROM stock_movements)          AS stock_movements,
      (SELECT COUNT(*) FROM channel_allocation_logs)  AS channel_allocation_logs,
      (SELECT COUNT(*) FROM channel_stock_snapshots)  AS channel_stock_snapshots,
      (SELECT COUNT(*) FROM channel_sku_mappings)     AS channel_sku_mappings,
      (SELECT COUNT(*) FROM stock_requests)           AS stock_requests,
      (SELECT COUNT(*) FROM stock_requests WHERE status = 'FULFILLED') AS release_logs,
      (SELECT COUNT(*) FROM online_order_items WHERE matched_inventory_id IS NOT NULL) AS linked_order_items
  `);
  return rows[0];
}

try {
  const before = await counts();
  console.log('Current data:');
  console.table(before);

  if (!CONFIRM) {
    console.log('\nDry run only. Re-run with --yes to delete all inventory items and their stock data.');
    process.exit(0);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Un-link online order lines (records kept) so movements can be deleted.
    await client.query(`UPDATE online_order_items
      SET matched_inventory_id = NULL, matched_sku = NULL, movement_id = NULL, line_status = 'UNMATCHED'
      WHERE matched_inventory_id IS NOT NULL OR movement_id IS NOT NULL`);

    // 2. Stock requests (this also clears Release Logs = FULFILLED requests).
    const removedRequests = await client.query('DELETE FROM stock_requests');

    // 3. Channel data referencing inventory (NOT NULL FKs).
    await client.query('DELETE FROM channel_allocation_logs');
    await client.query('DELETE FROM channel_stock_snapshots');
    await client.query('DELETE FROM channel_sku_mappings');

    // 4. Movements, then the inventory items themselves.
    await client.query('DELETE FROM stock_movements');
    const removed = await client.query('DELETE FROM inventory');

    await client.query('COMMIT');
    console.log(`\nReset complete. Removed ${removed.rowCount} inventory item(s) and ${removedRequests.rowCount} stock request(s).`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  console.log('\nData after reset:');
  console.table(await counts());
} finally {
  await pool.end();
}
