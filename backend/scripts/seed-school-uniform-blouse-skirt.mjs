/**
 * Seed School Uniform Blouse + Skirt per-piece rows (same gender/size).
 * Defaults match the Add School Uniform modal (Female · 4XL).
 *
 * USAGE (from backend/):
 *   node scripts/seed-school-uniform-blouse-skirt.mjs
 *   node scripts/seed-school-uniform-blouse-skirt.mjs --yes
 *   node scripts/seed-school-uniform-blouse-skirt.mjs --yes --gender=Female --size=4XL
 */
import { pool } from '../src/database/pool.js';

const APPLY = process.argv.includes('--yes');
const UPDATE_EXISTING = process.argv.includes('--update-existing');

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

const GENDER = String(argValue('gender', 'Female')).trim();
const SIZE = String(argValue('size', '4XL')).trim().toUpperCase();
const THRESHOLD = Math.max(0, Math.trunc(argNumber('threshold', 20)));
const STOCKS = Math.max(0, Math.trunc(argNumber('stocks', 100)));
const PRICE = Math.max(0, argNumber('price', 0));

const GENDER_CODES = { Male: 'M', Female: 'F', Unisex: 'U' };
const TYPE_CODES = { Blouse: 'BLOUSE', Skirt: 'SKIRT' };

const SCHOOL_UNIFORM_WHERE = `
  c.category_kind = 'SCHOOL_UNIFORM'
  OR LOWER(TRIM(c.category_name)) = 'school uniform'
`;

/** Mirrors frontend normalizeInventoryText with trimEdges. */
function normalizeInventoryText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[-\s]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_+$/g, '');
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

function buildUniformVariation({ uniformGender, uniformType, uniformSize }) {
  return `${uniformGender} · ${uniformType} · ${uniformSize}`;
}

function categoryPrefix(categoryName = '') {
  const cleaned = String(categoryName).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return (cleaned.slice(0, 3) || 'SCH').padEnd(3, 'X');
}

function generateSku(categoryName, gender, type, size) {
  const prefix = categoryPrefix(categoryName);
  const g = GENDER_CODES[gender] || gender.slice(0, 1).toUpperCase();
  const t = TYPE_CODES[type] || String(type).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return `${prefix}-${g}-${t}-${String(size).toUpperCase()}`.slice(0, 64);
}

function variantKey(gender, type, size) {
  return `${String(gender).toLowerCase()}|${String(type).toLowerCase()}|${String(size).toUpperCase()}`;
}

/** Default internal selling prices from the Add School Uniform modal. */
const PIECE_SPECS = [
  {
    type: 'Blouse',
    internalSellingPrice: argNumber('blouse-internal', 300),
    itemNameOverride: argValue('blouse-name', null),
  },
  {
    type: 'Skirt',
    internalSellingPrice: argNumber('skirt-internal', 240),
    itemNameOverride: argValue('skirt-name', null),
  },
];

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
  const client = await pool.connect();
  try {
    const categoryResult = await client.query(
      `SELECT c.category_id, c.category_name
       FROM categories c
       WHERE ${SCHOOL_UNIFORM_WHERE}
       ORDER BY CASE WHEN c.category_kind = 'SCHOOL_UNIFORM' THEN 0 ELSE 1 END, c.category_name
       LIMIT 1`,
    );
    if (!categoryResult.rowCount) {
      throw new Error('No School Uniform category found. Create it first in Inventory.');
    }
    const category = categoryResult.rows[0];

    const existingResult = await client.query(
      `SELECT inventory_id, sku, item_name, uniform_gender, uniform_type, uniform_size,
              stocks, price, internal_selling_price, low_stock_threshold
       FROM inventory
       WHERE category_id = $1
         AND LOWER(TRIM(uniform_gender)) = LOWER(TRIM($2))
         AND UPPER(TRIM(uniform_size)) = UPPER(TRIM($3))
         AND LOWER(TRIM(uniform_type)) IN ('blouse', 'skirt')`,
      [category.category_id, GENDER, SIZE],
    );

    const existingByKey = new Map();
    for (const row of existingResult.rows) {
      existingByKey.set(variantKey(row.uniform_gender, row.uniform_type, row.uniform_size), row);
    }

    const toCreate = [];
    const skipped = [];
    const toUpdate = [];

    for (const spec of PIECE_SPECS) {
      const key = variantKey(GENDER, spec.type, SIZE);
      const existing = existingByKey.get(key);
      const itemName = spec.itemNameOverride
        || buildUniformItemName(category.category_name, spec.type);

      if (existing) {
        const needsUpdate = UPDATE_EXISTING && (
          String(existing.item_name || '') !== itemName
          || Number(existing.stocks) !== STOCKS
          || Number(existing.price) !== PRICE
          || Number(existing.internal_selling_price) !== spec.internalSellingPrice
          || Number(existing.low_stock_threshold) !== THRESHOLD
        );
        if (needsUpdate) {
          toUpdate.push({
            ...spec,
            itemName,
            inventoryId: existing.inventory_id,
            sku: existing.sku,
            previousStocks: Number(existing.stocks) || 0,
          });
        } else {
          skipped.push({ ...spec, sku: existing.sku, inventoryId: existing.inventory_id });
        }
        continue;
      }

      toCreate.push({
        type: spec.type,
        sku: generateSku(category.category_name, GENDER, spec.type, SIZE),
        itemName,
        variation: buildUniformVariation({
          uniformGender: GENDER,
          uniformType: spec.type,
          uniformSize: SIZE,
        }),
        internalSellingPrice: spec.internalSellingPrice,
      });
    }

    console.log(APPLY
      ? `APPLY MODE — seed School Uniform Blouse + Skirt\n`
      : `DRY RUN — pass --yes to create rows\n`);
    console.log(`Category : ${category.category_name} (${category.category_id})`);
    console.log(`Gender   : ${GENDER}`);
    console.log(`Size     : ${SIZE}`);
    console.log(`Stocks   : ${STOCKS}`);
    console.log(`Price    : ${PRICE}`);
    console.log(`Threshold: ${THRESHOLD}\n`);

    if (skipped.length) {
      console.log(`Already exist (skipped): ${skipped.length}`);
      for (const row of skipped) {
        console.log(`  SKIP ${row.type} | ${row.sku}`);
      }
      console.log('');
    }

    console.log(`To create: ${toCreate.length}`);
    for (const row of toCreate) {
      console.log(
        `  CREATE ${row.sku} | ${row.itemName} | internal ₱${row.internalSellingPrice} | ${row.variation}`,
      );
    }

    if (toUpdate.length) {
      console.log(`\nTo update${UPDATE_EXISTING ? '' : ' (pass --update-existing with --yes)'}: ${toUpdate.length}`);
      for (const row of toUpdate) {
        console.log(
          `  UPDATE ${row.sku} | ${row.itemName} | internal ₱${row.internalSellingPrice} | stocks ${row.previousStocks} → ${STOCKS}`,
        );
      }
    }

    if (!toCreate.length && !toUpdate.length) {
      console.log('\nNothing to do — Blouse and Skirt already match for this gender/size.');
      return;
    }

    if (!APPLY) {
      console.log('\nNo changes written. Re-run with --yes to apply.');
      if (toUpdate.length && !UPDATE_EXISTING) {
        console.log('Add --update-existing to sync existing rows to the target values.');
      }
      return;
    }

    if (toUpdate.length && !UPDATE_EXISTING) {
      console.log('\nSkipped updates — pass --update-existing to sync existing rows.');
    }

    const adminId = await resolveAdminId(client);
    await client.query('BEGIN');
    try {
      let created = 0;
      let updated = 0;

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
            STOCKS,
            category.category_id,
            variant.variation,
            PRICE,
            variant.internalSellingPrice,
            GENDER,
            variant.type,
            SIZE,
            THRESHOLD,
            adminId,
          ],
        );

        const inventoryId = insert.rows[0].inventory_id;
        if (STOCKS > 0) {
          await client.query(
            `INSERT INTO stock_movements
              (inventory_id, movement_type, quantity, stock_delta, previous_stock, new_stock, remarks, created_by)
             VALUES ($1,'STOCK_IN',$2,$2,0,$2,$3,$4)`,
            [inventoryId, STOCKS, `Seed School Uniform ${variant.type} initial stock`, adminId],
          );
        }

        created += 1;
        console.log(`Created ${sku} (${variant.variation})`);
      }

      for (const variant of toUpdate) {
        await client.query(
          `UPDATE inventory
           SET item_name = $1,
               stocks = $2,
               price = $3,
               internal_selling_price = $4,
               low_stock_threshold = $5,
               updated_by = $6,
               updated_at = NOW()
           WHERE inventory_id = $7`,
          [
            variant.itemName,
            STOCKS,
            PRICE,
            variant.internalSellingPrice,
            THRESHOLD,
            adminId,
            variant.inventoryId,
          ],
        );

        const stockDelta = STOCKS - variant.previousStocks;
        if (stockDelta !== 0) {
          await client.query(
            `INSERT INTO stock_movements
              (inventory_id, movement_type, quantity, stock_delta, previous_stock, new_stock, remarks, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              variant.inventoryId,
              stockDelta > 0 ? 'STOCK_IN' : 'STOCK_OUT',
              Math.abs(stockDelta),
              stockDelta,
              variant.previousStocks,
              STOCKS,
              `Seed School Uniform ${variant.type} stock sync`,
              adminId,
            ],
          );
        }

        updated += 1;
        console.log(`Updated ${variant.sku} (${variant.type})`);
      }

      await client.query('COMMIT');
      console.log(`\nDone. Created ${created} piece(s), updated ${updated} piece(s).`);
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
