/**
 * Seed missing Shirt sizes for a custom logo (e.g. ACC).
 * Skips sizes that already exist for that logo. Uses an existing row as the
 * template for item name, prices, stock, and threshold when available.
 *
 * USAGE (from backend/):
 *   node scripts/seed-shirt-logo-sizes.mjs --logo=ACC
 *   node scripts/seed-shirt-logo-sizes.mjs --logo=ACC --yes
 *   node scripts/seed-shirt-logo-sizes.mjs --logo=ACC --yes --stocks=50 --threshold=10
 */
import { pool } from '../src/database/pool.js';

const APPLY = process.argv.includes('--yes');

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  if (!hit) return fallback;
  return hit.slice(prefix.length);
}

function argNumber(name, fallback) {
  const raw = argValue(name, null);
  if (raw === null || raw === '') return fallback;
  const num = Number(raw);
  return Number.isFinite(num) ? num : fallback;
}

const LOGO = String(argValue('logo', 'ACC')).trim();
const OVERRIDE_STOCKS = argNumber('stocks', null);
const OVERRIDE_PRICE = argNumber('price', null);
const OVERRIDE_INTERNAL_PRICE = argNumber('internal-price', null);
const OVERRIDE_THRESHOLD = argNumber('threshold', null);

const GENDER = 'Unisex';
const GENDER_CODE = 'U';
const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'Teen'];

const TYPE_CODES = {
  Beeli: 'BEELI',
  LCA: 'LCA',
  'Logo 1': 'LOGO1',
  'Logo 2': 'LOGO2',
};

const SHIRT_WHERE = `
  c.category_kind = 'LCA_SHIRT'
  OR LOWER(TRIM(c.category_name)) IN ('shirt', 'lca shirt', 'lca t-shirt', 'lca tshirt')
`;

function normalizeInventoryText(value = '', { trimEdges = true } = {}) {
  let next = String(value)
    .toLowerCase()
    .replace(/[-\s]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_/g, '');
  if (trimEdges) next = next.replace(/_+$/g, '');
  return next;
}

function buildItemName(categoryName, logo) {
  const categorySlug = normalizeInventoryText(categoryName);
  const logoSlug = normalizeInventoryText(logo);
  if (!logoSlug) return categorySlug.slice(0, 180);
  if (categorySlug.includes(logoSlug)) return categorySlug.slice(0, 180);
  return `${categorySlug}_${logoSlug}`.slice(0, 180);
}

function buildVariation(logo, size) {
  return `${GENDER} · ${logo} · ${size}`;
}

function categoryPrefix(categoryName = '') {
  const cleaned = String(categoryName).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return (cleaned.slice(0, 3) || 'SHI').padEnd(3, 'X');
}

function typeCode(logo) {
  return TYPE_CODES[logo] || String(logo).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function generateSku(categoryName, logo, size) {
  const prefix = categoryPrefix(categoryName);
  return `${prefix}-${GENDER_CODE}-${typeCode(logo)}-${String(size).toUpperCase()}`.slice(0, 64);
}

function sizeKey(logo, size) {
  return `${String(logo).toLowerCase()}|${String(size).toUpperCase()}`;
}

async function resolveAdminId(client) {
  const result = await client.query(
    `SELECT user_id FROM users
     WHERE status = 'ACTIVE'
     ORDER BY CASE WHEN role = 'ADMIN' THEN 0 ELSE 1 END, created_at ASC
     LIMIT 1`,
  );
  if (!result.rowCount) {
    throw new Error('No ACTIVE user found to use as created_by. Create an admin first.');
  }
  return result.rows[0].user_id;
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
  if (!LOGO) {
    throw new Error('Logo is required. Example: --logo=ACC');
  }

  const client = await pool.connect();
  try {
    const categoryResult = await client.query(
      `SELECT c.category_id, c.category_name
       FROM categories c
       WHERE ${SHIRT_WHERE}
       ORDER BY CASE WHEN c.category_kind = 'LCA_SHIRT' THEN 0 ELSE 1 END, c.category_name
       LIMIT 1`,
    );
    if (!categoryResult.rowCount) {
      console.log('No Shirt category found.');
      return;
    }
    const category = categoryResult.rows[0];

    const existingResult = await client.query(
      `SELECT i.inventory_id, i.sku, i.item_name, i.uniform_type, i.uniform_size,
              i.stocks, i.price, i.internal_selling_price, i.low_stock_threshold, i.variation
       FROM inventory i
       WHERE i.category_id = $1
         AND LOWER(TRIM(i.uniform_type)) = LOWER(TRIM($2))
       ORDER BY i.uniform_size`,
      [category.category_id, LOGO],
    );

    const existingBySize = new Map();
    for (const row of existingResult.rows) {
      if (!row.uniform_size) continue;
      existingBySize.set(String(row.uniform_size).toUpperCase(), row);
    }

    const template = existingResult.rows[0] || null;
    const itemName = template?.item_name || buildItemName(category.category_name, LOGO);
    const price = OVERRIDE_PRICE ?? Number(template?.price ?? 0);
    const internalSellingPrice = OVERRIDE_INTERNAL_PRICE ?? Number(template?.internal_selling_price ?? 156);
    const stocks = OVERRIDE_STOCKS ?? Number(template?.stocks ?? 50);
    const lowStockThreshold = OVERRIDE_THRESHOLD ?? Number(template?.low_stock_threshold ?? 10);

    const toCreate = [];
    const skipped = [];

    for (const size of SHIRT_SIZES) {
      const existing = existingBySize.get(size.toUpperCase());
      if (existing) {
        skipped.push({ size, sku: existing.sku });
        continue;
      }
      toCreate.push({
        size,
        sku: generateSku(category.category_name, LOGO, size),
        itemName,
        variation: buildVariation(LOGO, size),
        key: sizeKey(LOGO, size),
      });
    }

    console.log(APPLY
      ? `APPLY MODE - seed missing Shirt sizes for logo "${LOGO}"\n`
      : `DRY RUN - pass --yes to create rows\n`);
    console.log(`Category: ${category.category_name} (${category.category_id})`);
    console.log(`Template row: ${template ? `${template.sku} (${template.uniform_size})` : 'none — using defaults'}`);
    console.log(`Item name: ${itemName}`);
    console.log(`Defaults: stocks=${stocks}, price=${price}, internal=${internalSellingPrice}, threshold=${lowStockThreshold}\n`);

    if (skipped.length) {
      console.log(`Existing sizes (skipped): ${skipped.length}`);
      for (const row of skipped) {
        console.log(`  SKIP ${row.size} | ${row.sku}`);
      }
      console.log('');
    }

    console.log(`Sizes to create: ${toCreate.length}`);
    for (const row of toCreate) {
      console.log(`  CREATE ${row.sku} | ${row.variation}`);
    }

    if (!toCreate.length) {
      console.log('\nNothing to create — all shirt sizes already exist for this logo.');
      return;
    }

    if (!APPLY) {
      console.log('\nNo changes written. Re-run with --yes to apply.');
      return;
    }

    const adminId = await resolveAdminId(client);
    await client.query('BEGIN');
    try {
      let created = 0;
      for (const variant of toCreate) {
        const sku = await uniqueSku(client, variant.sku);
        const insert = await client.query(
          `INSERT INTO inventory (
            sku, item_name, stocks, category_id, variation, price, internal_selling_price,
            uniform_gender, uniform_type, uniform_size, low_stock_threshold,
            created_by, updated_by
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
          RETURNING inventory_id`,
          [
            sku,
            variant.itemName,
            stocks,
            category.category_id,
            variant.variation,
            price,
            internalSellingPrice,
            GENDER,
            LOGO,
            variant.size,
            lowStockThreshold,
            adminId,
          ],
        );

        const inventoryId = insert.rows[0].inventory_id;
        if (stocks > 0) {
          await client.query(
            `INSERT INTO stock_movements
              (inventory_id, movement_type, quantity, stock_delta, previous_stock, new_stock, remarks, created_by)
             VALUES ($1,'STOCK_IN',$2,$2,0,$2,$3,$4)`,
            [inventoryId, stocks, `Seed Shirt logo ${LOGO} initial stock`, adminId],
          );
        }

        created += 1;
        console.log(`Created ${sku}`);
      }

      await client.query('COMMIT');
      console.log(`\nDone. Created ${created} Shirt size(s) for logo "${LOGO}".`);
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
  process.exitCode = 1;
});
