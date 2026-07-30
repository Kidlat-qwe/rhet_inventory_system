/**
 * Normalize PE Uniform inventory to Unisex-only gender.
 *
 * Default: keep existing Unisex Shirt/Pants × size rows; delete Male/Female PE rows
 * without merging stock (those gendered rows were usually seeded in error).
 *
 * Pass --merge to add Male/Female stocks into the matching Unisex row before delete.
 * If a size has no Unisex row, the first gendered row is converted to Unisex.
 *
 * USAGE:
 *   node scripts/normalize-pe-uniform-unisex.mjs              # dry run
 *   node scripts/normalize-pe-uniform-unisex.mjs --yes        # delete gendered PE rows
 *   node scripts/normalize-pe-uniform-unisex.mjs --yes --merge
 */
import { pool } from '../src/database/pool.js';

const CONFIRM = process.argv.includes('--yes');
const MERGE = process.argv.includes('--merge');

function variantKey(type, size) {
  return `${String(type).toLowerCase()}|${String(size).toUpperCase()}`;
}

function buildVariation(type, size) {
  return `Unisex · ${type} · ${size}`;
}

function buildUnisexSku(categoryName, type, size) {
  const cleaned = String(categoryName || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const prefix = (cleaned.slice(0, 3) || 'PEU').padEnd(3, 'X');
  const typeCode = String(type).toUpperCase() === 'PANTS' ? 'PANTS' : 'SHIRT';
  return `${prefix}-U-${typeCode}-${String(size).toUpperCase()}`.slice(0, 64);
}

async function clearInventoryRefs(client, inventoryId) {
  await client.query(
    `UPDATE online_order_items
     SET matched_inventory_id = NULL, matched_sku = NULL, line_status = 'UNMATCHED', movement_id = NULL
     WHERE matched_inventory_id = $1`,
    [inventoryId],
  );
  await client.query(
    `UPDATE stock_requests SET inventory_id = NULL, movement_id = NULL WHERE inventory_id = $1`,
    [inventoryId],
  );
  await client.query(
    `UPDATE stock_request_components SET inventory_id = NULL WHERE inventory_id = $1`,
    [inventoryId],
  );
  await client.query(
    `UPDATE channel_allocation_logs SET movement_id = NULL WHERE inventory_id = $1`,
    [inventoryId],
  );
  await client.query('DELETE FROM channel_allocation_logs WHERE inventory_id = $1', [inventoryId]);
  await client.query('DELETE FROM channel_stock_snapshots WHERE inventory_id = $1', [inventoryId]);
  await client.query('DELETE FROM channel_sku_mappings WHERE inventory_id = $1', [inventoryId]);
  await client.query(
    `DELETE FROM inventory_bundle_components
     WHERE component_inventory_id = $1 OR bundle_inventory_id = $1`,
    [inventoryId],
  );
  await client.query('DELETE FROM stock_movements WHERE inventory_id = $1', [inventoryId]);
}

async function main() {
  const client = await pool.connect();
  try {
    const categoryResult = await client.query(
      `SELECT category_id, category_name
       FROM categories
       WHERE category_kind = 'PE_UNIFORM'
          OR LOWER(TRIM(category_name)) = 'pe uniform'
       ORDER BY category_name
       LIMIT 1`,
    );
    if (!categoryResult.rowCount) {
      console.log('No PE Uniform category found.');
      return;
    }
    const category = categoryResult.rows[0];

    const items = await client.query(
      `SELECT inventory_id, sku, item_name, stocks, price, uniform_gender, uniform_type, uniform_size, variation
       FROM inventory
       WHERE category_id = $1
       ORDER BY uniform_type, uniform_size, uniform_gender`,
      [category.category_id],
    );

    const groups = new Map();
    for (const row of items.rows) {
      if (!row.uniform_type || !row.uniform_size) continue;
      const key = variantKey(row.uniform_type, row.uniform_size);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }

    const plan = [];
    for (const [, rows] of groups) {
      const unisex = rows.find((row) => String(row.uniform_gender).toLowerCase() === 'unisex');
      const gendered = rows.filter((row) => String(row.uniform_gender).toLowerCase() !== 'unisex');
      if (!gendered.length && unisex) continue;

      plan.push({
        type: rows[0].uniform_type,
        size: rows[0].uniform_size,
        keep: unisex || gendered[0],
        mergeFrom: unisex ? gendered : gendered.slice(1),
        convertKeep: !unisex,
      });
    }

    console.log(`PE Uniform category: ${category.category_name}`);
    console.log(`Stock merge mode: ${MERGE ? 'ON (--merge)' : 'OFF (discard Male/Female stock)'}`);
    console.log(`Variant groups needing normalize: ${plan.length}`);
    for (const step of plan.slice(0, 30)) {
      const mergeSkus = step.mergeFrom.map((row) => `${row.sku}(${row.stocks})`).join(', ') || '—';
      console.log(
        `  ${step.type} ${step.size}: keep ${step.keep.sku}`
        + `${step.convertKeep ? ' → Unisex' : ''}`
        + `; ${MERGE ? 'merge' : 'delete'} [${mergeSkus}]`,
      );
    }
    if (plan.length > 30) console.log(`  … and ${plan.length - 30} more`);

    if (!CONFIRM) {
      console.log('\nDry run only. Re-run with --yes to apply.');
      return;
    }

    if (!plan.length) {
      console.log('\nNothing to do — PE rows are already Unisex-only.');
      return;
    }

    const adminResult = await client.query(
      `SELECT user_id FROM users WHERE status = 'ACTIVE'
       ORDER BY CASE WHEN role = 'ADMIN' THEN 0 ELSE 1 END, created_at ASC LIMIT 1`,
    );
    const adminId = adminResult.rows[0]?.user_id;
    if (!adminId) throw new Error('No ACTIVE user for stock movements');

    await client.query('BEGIN');
    let converted = 0;
    let merged = 0;
    let deleted = 0;

    try {
      for (const step of plan) {
        let keepId = step.keep.inventory_id;
        let keepStocks = Number(step.keep.stocks) || 0;
        const type = step.type;
        const size = step.size;

        if (step.convertKeep) {
          const newSku = buildUnisexSku(category.category_name, type, size);
          const skuCheck = await client.query(
            `SELECT inventory_id FROM inventory WHERE UPPER(sku) = UPPER($1) AND inventory_id <> $2`,
            [newSku, keepId],
          );
          const finalSku = skuCheck.rowCount ? `${newSku}-U`.slice(0, 64) : newSku;
          await client.query(
            `UPDATE inventory
             SET uniform_gender = 'Unisex',
                 variation = $1,
                 sku = $2,
                 updated_by = $3,
                 updated_at = NOW()
             WHERE inventory_id = $4`,
            [buildVariation(type, size), finalSku, adminId, keepId],
          );
          converted += 1;
          console.log(`Converted ${step.keep.sku} → ${finalSku}`);
        }

        for (const source of step.mergeFrom) {
          const add = Number(source.stocks) || 0;
          if (MERGE && add > 0) {
            const previous = keepStocks;
            keepStocks += add;
            await client.query(
              `UPDATE inventory SET stocks = $1, updated_by = $2, updated_at = NOW() WHERE inventory_id = $3`,
              [keepStocks, adminId, keepId],
            );
            await client.query(
              `INSERT INTO stock_movements
                (inventory_id, movement_type, quantity, stock_delta, previous_stock, new_stock, remarks, created_by)
               VALUES ($1,'STOCK_IN',$2,$2,$3,$4,$5,$6)`,
              [
                keepId,
                add,
                previous,
                keepStocks,
                `Merged from ${source.sku} (${source.uniform_gender}) into Unisex PE`,
                adminId,
              ],
            );
            merged += 1;
          }

          await clearInventoryRefs(client, source.inventory_id);
          await client.query('DELETE FROM inventory WHERE inventory_id = $1', [source.inventory_id]);
          deleted += 1;
          console.log(
            MERGE
              ? `Removed ${source.sku} (merged ${add} into Unisex)`
              : `Removed ${source.sku} (discarded ${add} stock)`,
          );
        }
      }

      await client.query('COMMIT');
      console.log(`\nDone. Converted ${converted}, merged ${merged} stock moves, deleted ${deleted} gendered PE rows.`);
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
