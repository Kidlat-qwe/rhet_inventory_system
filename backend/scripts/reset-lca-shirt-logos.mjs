/**
 * Reset Shirt (LCA_SHIRT) inventory to Unisex × Logo 1 / Logo 2 × XS–XL + Teen.
 *
 * Removes ALL existing items in the Shirt / LCA T-Shirt category, renames the
 * category to "Shirt", then creates 12 target variants (2 logos × 6 sizes).
 *
 * USAGE:
 *   node scripts/reset-lca-shirt-logos.mjs                 # dry run
 *   node scripts/reset-lca-shirt-logos.mjs --yes           # apply
 *   node scripts/reset-lca-shirt-logos.mjs --yes --stocks=50 --price=350 --threshold=10
 */
import { pool } from '../src/database/pool.js';

const CONFIRM = process.argv.includes('--yes');

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  if (!hit) return fallback;
  const raw = hit.slice(prefix.length);
  const num = Number(raw);
  return Number.isFinite(num) ? num : fallback;
}

const TARGET_STOCKS = Math.max(0, Math.trunc(argValue('stocks', 0)));
const DEFAULT_PRICE = Math.max(0, Number(argValue('price', 0)));
const LOW_STOCK_THRESHOLD = Math.max(0, Math.trunc(argValue('threshold', 10)));

const TARGET_CATEGORY_NAME = 'Shirt';
const GENDER = 'Unisex';
const TYPES = ['Logo 1', 'Logo 2'];
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'Teen'];

const TYPE_CODES = {
  'Logo 1': 'LOGO1',
  'Logo 2': 'LOGO2',
};

function normalizeInventoryText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function buildUniformItemName(categoryName, type) {
  const name = String(categoryName || '').trim();
  const typeLabel = String(type || '').trim();
  if (!typeLabel) return normalizeInventoryText(name).slice(0, 180);
  if (name.toLowerCase().includes(typeLabel.toLowerCase())) {
    return normalizeInventoryText(name).slice(0, 180);
  }
  return normalizeInventoryText(`${name} ${typeLabel}`).slice(0, 180);
}

function buildVariation(type, size) {
  return `${GENDER} · ${type} · ${size}`;
}

function categoryPrefix(categoryName = '') {
  const cleaned = String(categoryName).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return (cleaned.slice(0, 3) || 'LCA').padEnd(3, 'X');
}

function generateSku(categoryName, type, size) {
  const prefix = categoryPrefix(categoryName);
  const typeCode = TYPE_CODES[type] || String(type).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return `${prefix}-U-${typeCode}-${String(size).toUpperCase()}`.slice(0, 64);
}

async function clearInventoryRefs(client, inventoryId) {
  await client.query('DELETE FROM online_order_item_matches WHERE inventory_id = $1', [inventoryId]);
  await client.query(
    `UPDATE online_order_items
     SET matched_inventory_id = NULL,
         matched_sku = NULL,
         line_status = CASE
           WHEN line_status IN ('CANCELLED', 'DEDUCTED') THEN line_status
           ELSE 'UNMATCHED'
         END,
         movement_id = NULL,
         failure_reason = CASE
           WHEN line_status IN ('CANCELLED', 'DEDUCTED') THEN failure_reason
           ELSE 'Mapped inventory was removed during LCA logo reset'
         END,
         updated_at = NOW()
     WHERE matched_inventory_id = $1`,
    [inventoryId],
  );
  await client.query(
    `UPDATE stock_requests
     SET inventory_id = NULL, movement_id = NULL, updated_at = NOW()
     WHERE inventory_id = $1`,
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
  await client.query(
    `UPDATE stock_requests
     SET movement_id = NULL
     WHERE movement_id IN (SELECT movement_id FROM stock_movements WHERE inventory_id = $1)`,
    [inventoryId],
  );
  await client.query(
    `UPDATE online_order_items
     SET movement_id = NULL
     WHERE movement_id IN (SELECT movement_id FROM stock_movements WHERE inventory_id = $1)`,
    [inventoryId],
  );
  await client.query('DELETE FROM stock_movements WHERE inventory_id = $1', [inventoryId]);
}

async function uniqueSku(client, baseSku) {
  const taken = await client.query(
    `SELECT UPPER(sku) AS sku FROM inventory WHERE UPPER(sku) = UPPER($1) OR UPPER(sku) LIKE UPPER($2)`,
    [baseSku, `${baseSku}-%`],
  );
  const set = new Set(taken.rows.map((row) => row.sku));
  if (!set.has(baseSku.toUpperCase())) return baseSku;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${baseSku}-${suffix}`.slice(0, 64);
    if (!set.has(candidate.toUpperCase())) return candidate;
  }
  throw new Error(`Could not allocate unique SKU for ${baseSku}`);
}

async function main() {
  const client = await pool.connect();
  try {
    const categoryResult = await client.query(
      `SELECT category_id, category_name, category_kind
       FROM categories
       WHERE category_kind = 'LCA_SHIRT'
          OR LOWER(TRIM(category_name)) IN ('lca t-shirt', 'lca shirt', 'lca tshirt')
       ORDER BY
         CASE WHEN category_kind = 'LCA_SHIRT' THEN 0 ELSE 1 END,
         category_name
       LIMIT 1`,
    );
    if (!categoryResult.rowCount) {
      console.log('No LCA T-Shirt category found.');
      return;
    }
    const category = categoryResult.rows[0];
    if (category.category_kind !== 'LCA_SHIRT') {
      if (CONFIRM) {
        await client.query(
          `UPDATE categories SET category_kind = 'LCA_SHIRT', updated_at = NOW() WHERE category_id = $1`,
          [category.category_id],
        );
      }
      category.category_kind = 'LCA_SHIRT';
      console.log('Will set category_kind = LCA_SHIRT');
    }

    const currentName = String(category.category_name || '').trim();
    const shouldRename = currentName.toLowerCase() !== TARGET_CATEGORY_NAME.toLowerCase();
    if (shouldRename) {
      console.log(`Will rename category ${currentName} → ${TARGET_CATEGORY_NAME}`);
    }
    // Desired SKUs / item names use the target display name.
    category.category_name = TARGET_CATEGORY_NAME;

    const existing = await client.query(
      `SELECT inventory_id, sku, item_name, stocks, uniform_gender, uniform_type, uniform_size
       FROM inventory
       WHERE category_id = $1
       ORDER BY sku`,
      [category.category_id],
    );

    const desired = [];
    for (const type of TYPES) {
      for (const size of SIZES) {
        desired.push({
          gender: GENDER,
          type,
          size,
          sku: generateSku(category.category_name, type, size),
          itemName: buildUniformItemName(category.category_name, type),
          variation: buildVariation(type, size),
        });
      }
    }

    console.log(`Shirt category: ${TARGET_CATEGORY_NAME} (${category.category_id})`);
    console.log(`Existing items to remove: ${existing.rowCount}`);
    for (const row of existing.rows.slice(0, 40)) {
      console.log(
        `  DELETE ${row.sku} | ${row.uniform_gender || '—'} · ${row.uniform_type || '—'} · ${row.uniform_size || '—'} | stock=${row.stocks}`,
      );
    }
    if (existing.rowCount > 40) console.log(`  … and ${existing.rowCount - 40} more`);

    console.log(`\nNew variants to create: ${desired.length} (Unisex × Logo 1/2 × XS–XL + Teen)`);
    console.log(`Default stocks=${TARGET_STOCKS}, price=${DEFAULT_PRICE}, threshold=${LOW_STOCK_THRESHOLD}`);
    for (const row of desired) {
      console.log(`  CREATE ${row.sku} | ${row.variation}`);
    }

    if (!CONFIRM) {
      console.log('\nDry run only. Re-run with --yes to apply.');
      return;
    }

    const adminResult = await client.query(
      `SELECT user_id FROM users
       WHERE status = 'ACTIVE'
       ORDER BY CASE WHEN role = 'ADMIN' THEN 0 ELSE 1 END, created_at ASC
       LIMIT 1`,
    );
    if (!adminResult.rowCount) {
      throw new Error('No ACTIVE user found to use as created_by. Create an admin first.');
    }
    const adminId = adminResult.rows[0].user_id;

    await client.query('BEGIN');
    let deleted = 0;
    let created = 0;

    try {
      if (shouldRename) {
        const clash = await client.query(
          `SELECT 1 FROM categories
           WHERE LOWER(TRIM(category_name)) = LOWER(TRIM($1))
             AND category_id <> $2`,
          [TARGET_CATEGORY_NAME, category.category_id],
        );
        if (clash.rowCount) {
          throw new Error(`Cannot rename to "${TARGET_CATEGORY_NAME}" — another category already uses that name.`);
        }
        await client.query(
          `UPDATE categories
           SET category_name = $1, category_kind = 'LCA_SHIRT', updated_at = NOW()
           WHERE category_id = $2`,
          [TARGET_CATEGORY_NAME, category.category_id],
        );
        console.log(`Renamed category → ${TARGET_CATEGORY_NAME}`);
      } else {
        await client.query(
          `UPDATE categories SET category_kind = 'LCA_SHIRT', updated_at = NOW() WHERE category_id = $1`,
          [category.category_id],
        );
      }

      for (const row of existing.rows) {
        await clearInventoryRefs(client, row.inventory_id);
        await client.query('DELETE FROM inventory WHERE inventory_id = $1', [row.inventory_id]);
        deleted += 1;
        console.log(`Removed ${row.sku}`);
      }

      for (const variant of desired) {
        const sku = await uniqueSku(client, variant.sku);
        const insert = await client.query(
          `INSERT INTO inventory (
            sku, item_name, stocks, category_id, variation, price,
            uniform_gender, uniform_type, uniform_size, low_stock_threshold,
            created_by, updated_by
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
          RETURNING inventory_id`,
          [
            sku,
            variant.itemName,
            TARGET_STOCKS,
            category.category_id,
            variant.variation,
            DEFAULT_PRICE,
            variant.gender,
            variant.type,
            variant.size,
            LOW_STOCK_THRESHOLD,
            adminId,
          ],
        );
        const inventoryId = insert.rows[0].inventory_id;
        if (TARGET_STOCKS > 0) {
          await client.query(
            `INSERT INTO stock_movements
              (inventory_id, movement_type, quantity, stock_delta, previous_stock, new_stock, remarks, created_by)
             VALUES ($1,'STOCK_IN',$2,$2,0,$2,$3,$4)`,
            [inventoryId, TARGET_STOCKS, 'Shirt logo reset initial stock', adminId],
          );
        }
        created += 1;
        console.log(`Created ${sku}`);
      }

      await client.query('COMMIT');
      console.log(`\nDone. Deleted ${deleted}, created ${created}.`);
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
