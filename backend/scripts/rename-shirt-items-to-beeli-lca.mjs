/**
 * Rename existing Shirt (LCA_SHIRT) inventory labels from Logo 1 / Logo 2
 * to Beeli / LCA, including SKUs.
 *
 * WHAT IT UPDATES:
 *   - inventory.uniform_type
 *   - inventory.variation
 *   - inventory.item_name (lowercase, hyphens → underscores: shirt_beeli / shirt_lca)
 *   - inventory.sku (LOGO1 / LOG01 → BEELI, LOGO2 / LOG02 → LCA)
 *   - matched_sku copies on stock_requests / online_order_items
 *
 * WHAT IT KEEPS:
 *   - prices, stocks, remarks, and every non-shirt row
 *
 * USAGE (from backend/):
 *   node scripts/rename-shirt-items-to-beeli-lca.mjs
 *   node scripts/rename-shirt-items-to-beeli-lca.mjs --yes
 */
import { pool } from '../src/database/pool.js';

const APPLY = process.argv.includes('--yes');

const SHIRT_WHERE = `
  c.category_kind = 'LCA_SHIRT'
  OR LOWER(TRIM(c.category_name)) IN ('shirt', 'lca shirt', 'lca t-shirt', 'lca tshirt')
`;

const SELECT_SQL = `
  SELECT
    i.inventory_id,
    i.sku,
    i.item_name,
    i.uniform_type,
    i.variation,
    c.category_name,
    c.category_kind
  FROM inventory i
  JOIN categories c ON c.category_id = i.category_id
  WHERE (${SHIRT_WHERE})
  ORDER BY i.sku, i.item_name
`;

function renameItemName(value = '') {
  return String(value)
    .replace(/logo[\s\-_]*1/gi, 'beeli')
    .replace(/logo[\s\-_]*2/gi, 'lca')
    .toLowerCase()
    .replace(/[-\s]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function renameUniformType(value = '') {
  if (value === 'Logo 1') return 'Beeli';
  if (value === 'Logo 2') return 'LCA';
  return value;
}

function renameVariation(value = '') {
  return String(value)
    .replace(/Logo 1/g, 'Beeli')
    .replace(/Logo 2/g, 'LCA');
}

function renameSku(value = '') {
  return String(value)
    .replace(/LOGO1/gi, 'BEELI')
    .replace(/LOG01/gi, 'BEELI')
    .replace(/LOGO2/gi, 'LCA')
    .replace(/LOG02/gi, 'LCA');
}

async function main() {
  const client = await pool.connect();
  try {
    const result = await client.query(SELECT_SQL);
    const rows = result.rows.map((row) => ({
      ...row,
      next_sku: renameSku(row.sku || ''),
      next_item_name: renameItemName(row.item_name || ''),
      next_uniform_type: renameUniformType(row.uniform_type || ''),
      next_variation: renameVariation(row.variation || ''),
    }));

    const changed = rows.filter((row) => (
      (row.sku || '') !== row.next_sku
      || row.item_name !== row.next_item_name
      || (row.uniform_type || '') !== row.next_uniform_type
      || (row.variation || '') !== row.next_variation
    ));

    console.log(APPLY
      ? 'APPLY MODE - renaming Shirt labels and SKUs to Beeli / LCA\n'
      : 'DRY RUN - pass --yes to apply\n');

    console.log(`Matched rows: ${rows.length}`);
    console.log(`Rows needing update: ${changed.length}\n`);

    for (const row of changed.slice(0, 30)) {
      const skuLine = (row.sku || '—') === row.next_sku
        ? (row.sku || '—')
        : `${row.sku || '—'} -> ${row.next_sku}`;
      console.log(`${skuLine} | ${row.item_name} -> ${row.next_item_name}`);
      if ((row.uniform_type || '') !== row.next_uniform_type) {
        console.log(`  uniform_type: ${row.uniform_type || '—'} -> ${row.next_uniform_type}`);
      }
      if ((row.variation || '') !== row.next_variation) {
        console.log(`  variation: ${row.variation || '—'} -> ${row.next_variation || '—'}`);
      }
    }
    if (changed.length > 30) {
      console.log(`... and ${changed.length - 30} more`);
    }

    if (!APPLY) {
      console.log('\nNo changes written. Re-run with --yes to apply.');
      return;
    }

    await client.query('BEGIN');
    for (const row of changed) {
      if (row.next_sku && row.next_sku !== row.sku) {
        const clash = await client.query(
          `SELECT inventory_id FROM inventory
           WHERE UPPER(sku) = UPPER($1) AND inventory_id <> $2`,
          [row.next_sku, row.inventory_id],
        );
        if (clash.rowCount) {
          throw new Error(`SKU already exists: ${row.next_sku}`);
        }
      }
      await client.query(
        `UPDATE inventory
         SET sku = $1,
             item_name = $2,
             uniform_type = $3,
             variation = $4,
             updated_at = NOW()
         WHERE inventory_id = $5`,
        [row.next_sku, row.next_item_name, row.next_uniform_type, row.next_variation || null, row.inventory_id],
      );
      if (row.next_sku && row.next_sku !== row.sku) {
        await client.query(
          `UPDATE online_order_items SET matched_sku = $1 WHERE matched_inventory_id = $2`,
          [row.next_sku, row.inventory_id],
        );
        await client.query(
          `UPDATE stock_requests SET matched_sku = $1 WHERE inventory_id = $2`,
          [row.next_sku, row.inventory_id],
        );
        const invoiceLines = await client.query(
          `SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = 'stock_request_invoice_lines'`,
        );
        if (invoiceLines.rowCount) {
          await client.query(
            `UPDATE stock_request_invoice_lines SET sku = $1 WHERE sku = $2`,
            [row.next_sku, row.sku],
          );
        }
      }
    }
    await client.query('COMMIT');
    console.log(`\nUpdated ${changed.length} Shirt item(s), including SKUs.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
