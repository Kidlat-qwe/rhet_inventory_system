/**
 * Rename Shirt inventory SKU prefixes from LCA- to SHI- (category name "Shirt").
 *
 * USAGE:
 *   node scripts/rename-shirt-skus-to-shi.mjs          # dry run
 *   node scripts/rename-shirt-skus-to-shi.mjs --yes    # apply
 */
import { pool } from '../src/database/pool.js';

const CONFIRM = process.argv.includes('--yes');

async function main() {
  const client = await pool.connect();
  try {
    const categoryResult = await client.query(
      `SELECT category_id, category_name
       FROM categories
       WHERE category_kind = 'LCA_SHIRT'
          OR LOWER(TRIM(category_name)) IN ('shirt', 'lca t-shirt', 'lca shirt', 'lca tshirt')
       ORDER BY CASE WHEN category_kind = 'LCA_SHIRT' THEN 0 ELSE 1 END, category_name
       LIMIT 1`,
    );
    if (!categoryResult.rowCount) {
      console.log('No Shirt category found.');
      return;
    }
    const category = categoryResult.rows[0];

    const items = await client.query(
      `SELECT inventory_id, sku, uniform_type, uniform_size
       FROM inventory
       WHERE category_id = $1
       ORDER BY sku`,
      [category.category_id],
    );

    const plan = [];
    for (const row of items.rows) {
      const oldSku = String(row.sku || '');
      if (!/^LCA-/i.test(oldSku)) continue;
      const newSku = `SHI-${oldSku.slice(4)}`.slice(0, 64);
      plan.push({ ...row, oldSku, newSku });
    }

    console.log(`Category: ${category.category_name} (${category.category_id})`);
    console.log(`SKU renames: ${plan.length}`);
    for (const row of plan) {
      console.log(`  ${row.oldSku} → ${row.newSku}`);
    }

    if (!CONFIRM) {
      console.log('\nDry run only. Re-run with --yes to apply.');
      return;
    }

    if (!plan.length) {
      console.log('\nNothing to rename.');
      return;
    }

    await client.query('BEGIN');
    try {
      for (const row of plan) {
        const clash = await client.query(
          `SELECT inventory_id FROM inventory
           WHERE UPPER(sku) = UPPER($1) AND inventory_id <> $2`,
          [row.newSku, row.inventory_id],
        );
        if (clash.rowCount) {
          throw new Error(`SKU already exists: ${row.newSku}`);
        }
        await client.query(
          `UPDATE inventory SET sku = $1, updated_at = NOW() WHERE inventory_id = $2`,
          [row.newSku, row.inventory_id],
        );
        await client.query(
          `UPDATE online_order_items SET matched_sku = $1 WHERE matched_inventory_id = $2`,
          [row.newSku, row.inventory_id],
        );
        await client.query(
          `UPDATE stock_requests SET matched_sku = $1 WHERE inventory_id = $2`,
          [row.newSku, row.inventory_id],
        );
        console.log(`Renamed ${row.oldSku} → ${row.newSku}`);
      }
      await client.query('COMMIT');
      console.log(`\nDone. Renamed ${plan.length} SKUs.`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
