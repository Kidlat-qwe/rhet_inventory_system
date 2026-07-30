/**
 * Seed missing uniform variants (School Uniform, PE Uniform, Shirt)
 * with 50 stock each. Existing gender/type/size rows are skipped.
 *
 * USAGE:
 *   node scripts/seed-uniform-variants.mjs              # dry run
 *   node scripts/seed-uniform-variants.mjs --yes        # create missing rows
 *   node scripts/seed-uniform-variants.mjs --yes --price=600
 *   node scripts/seed-uniform-variants.mjs --yes --stocks=50 --top-up
 *
 * --top-up  Also STOCK_IN existing rows that are below the target stock.
 */
import { pool } from '../src/database/pool.js';

const CONFIRM = process.argv.includes('--yes');
const TOP_UP = process.argv.includes('--top-up');

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  if (!hit) return fallback;
  const raw = hit.slice(prefix.length);
  const num = Number(raw);
  return Number.isFinite(num) ? num : fallback;
}

const TARGET_STOCKS = Math.max(0, Math.trunc(argValue('stocks', 50)));
const DEFAULT_PRICE = Math.max(0, Number(argValue('price', 0)));
const LOW_STOCK_THRESHOLD = Math.max(0, Math.trunc(argValue('threshold', 10)));

const UNIFORM_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];
const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'Teen'];

const GENDER_CODES = { Male: 'M', Female: 'F', Unisex: 'U' };
const TYPE_CODES = {
  Polo: 'POLO',
  Short: 'SHORT',
  Blouse: 'BLOUSE',
  Skirt: 'SKIRT',
  Shirt: 'SHIRT',
  Pants: 'PANTS',
  'Logo 1': 'LOGO1',
  'Logo 2': 'LOGO2',
};

/** Mirrors frontend/src/constants/uniformOptions.js */
const SEED_SPECS = [
  {
    kind: 'SCHOOL_UNIFORM',
    names: ['School Uniform'],
    genders: ['Male', 'Female'],
    typesForGender: (gender) => (gender === 'Female' ? ['Blouse', 'Skirt'] : ['Polo', 'Short']),
    sizes: UNIFORM_SIZES,
  },
  {
    kind: 'PE_UNIFORM',
    names: ['PE Uniform'],
    genders: ['Unisex'],
    typesForGender: () => ['Shirt', 'Pants'],
    sizes: UNIFORM_SIZES,
  },
  {
    kind: 'LCA_SHIRT',
    names: ['Shirt', 'LCA T-Shirt', 'LCA Shirt', 'LCA Tshirt'],
    genders: ['Unisex'],
    typesForGender: () => ['Logo 1', 'Logo 2'],
    sizes: SHIRT_SIZES,
  },
];

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

function buildUniformVariation({ uniformGender, uniformType, uniformSize }) {
  return `${uniformGender} · ${uniformType} · ${uniformSize}`;
}

function categoryPrefix(categoryName = '') {
  const cleaned = categoryName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return (cleaned.slice(0, 3) || 'CAT').padEnd(3, 'X');
}

function generateSku(categoryName, gender, type, size) {
  const prefix = categoryPrefix(categoryName);
  const g = GENDER_CODES[gender] || gender.slice(0, 1).toUpperCase();
  const t = TYPE_CODES[type] || String(type).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const s = String(size).toUpperCase();
  return `${prefix}-${g}-${t}-${s}`.slice(0, 64);
}

function variantKey(gender, type, size) {
  return `${String(gender).toLowerCase()}|${String(type).toLowerCase()}|${String(size).toUpperCase()}`;
}

async function ensureCategory(client, spec) {
  const byKind = await client.query(
    `SELECT category_id, category_name, category_kind, status
     FROM categories
     WHERE category_kind = $1
     ORDER BY category_name
     LIMIT 1`,
    [spec.kind],
  );
  if (byKind.rowCount) return byKind.rows[0];

  for (const name of spec.names) {
    const byName = await client.query(
      `SELECT category_id, category_name, category_kind, status
       FROM categories
       WHERE LOWER(TRIM(category_name)) = LOWER(TRIM($1))
       LIMIT 1`,
      [name],
    );
    if (byName.rowCount) {
      const row = byName.rows[0];
      if (row.category_kind !== spec.kind) {
        await client.query(
          `UPDATE categories SET category_kind = $1, updated_at = NOW() WHERE category_id = $2`,
          [spec.kind, row.category_id],
        );
        row.category_kind = spec.kind;
      }
      return row;
    }
  }

  const preferredName = spec.names[0];
  const inserted = await client.query(
    `INSERT INTO categories (category_name, category_kind, status)
     VALUES ($1, $2, 'ACTIVE')
     RETURNING category_id, category_name, category_kind, status`,
    [preferredName, spec.kind],
  );
  console.log(`Created category: ${preferredName} (${spec.kind})`);
  return inserted.rows[0];
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

function buildDesiredVariants(category, spec) {
  const desired = [];
  const sizes = spec.sizes || UNIFORM_SIZES;
  for (const gender of spec.genders) {
    for (const type of spec.typesForGender(gender)) {
      for (const size of sizes) {
        desired.push({
          categoryId: category.category_id,
          categoryName: category.category_name,
          kind: spec.kind,
          gender,
          type,
          size,
          sku: generateSku(category.category_name, gender, type, size),
          itemName: buildUniformItemName(category.category_name, type),
          variation: buildUniformVariation({
            uniformGender: gender,
            uniformType: type,
            uniformSize: size,
          }),
          key: variantKey(gender, type, size),
        });
      }
    }
  }
  return desired;
}

async function loadExistingVariants(client, categoryId) {
  const result = await client.query(
    `SELECT inventory_id, sku, item_name, stocks, price,
            uniform_gender, uniform_type, uniform_size, variation, lifecycle_status
     FROM inventory
     WHERE category_id = $1`,
    [categoryId],
  );

  const byKey = new Map();
  for (const row of result.rows) {
    const gender = row.uniform_gender;
    const type = row.uniform_type;
    const size = row.uniform_size;
    if (!gender || !type || !size) continue;
    byKey.set(variantKey(gender, type, size), row);
  }
  return byKey;
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

async function createVariant(client, variant, adminId) {
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
      variant.categoryId,
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
      [inventoryId, TARGET_STOCKS, 'Seed uniform variant initial stock', adminId],
    );
  }

  return { inventoryId, sku };
}

async function topUpVariant(client, existing, adminId) {
  const current = Number(existing.stocks) || 0;
  const need = TARGET_STOCKS - current;
  if (need <= 0) return null;

  await client.query(
    `UPDATE inventory
     SET stocks = $1, updated_by = $2, updated_at = NOW()
     WHERE inventory_id = $3`,
    [TARGET_STOCKS, adminId, existing.inventory_id],
  );
  await client.query(
    `INSERT INTO stock_movements
      (inventory_id, movement_type, quantity, stock_delta, previous_stock, new_stock, remarks, created_by)
     VALUES ($1,'STOCK_IN',$2,$2,$3,$4,$5,$6)`,
    [
      existing.inventory_id,
      need,
      current,
      TARGET_STOCKS,
      `Seed uniform top-up to ${TARGET_STOCKS}`,
      adminId,
    ],
  );
  return need;
}

async function main() {
  const client = await pool.connect();
  try {
    const adminId = await resolveAdminId(client);
    const plan = {
      create: [],
      skip: [],
      topUp: [],
    };

    for (const spec of SEED_SPECS) {
      const category = await ensureCategory(client, spec);
      if (category.status !== 'ACTIVE') {
        console.warn(`Warning: category ${category.category_name} is ${category.status}`);
      }

      const existing = await loadExistingVariants(client, category.category_id);
      const desired = buildDesiredVariants(category, spec);

      for (const variant of desired) {
        const row = existing.get(variant.key);
        if (!row) {
          plan.create.push(variant);
          continue;
        }
        plan.skip.push({ ...variant, inventoryId: row.inventory_id, stocks: row.stocks, sku: row.sku });
        if (TOP_UP && Number(row.stocks) < TARGET_STOCKS) {
          plan.topUp.push({ ...variant, inventoryId: row.inventory_id, stocks: row.stocks, sku: row.sku });
        }
      }
    }

    console.log('Uniform seed plan');
    console.log(`  Target stocks : ${TARGET_STOCKS}`);
    console.log(`  Default price : ${DEFAULT_PRICE}`);
    console.log(`  Create        : ${plan.create.length}`);
    console.log(`  Already exist : ${plan.skip.length}`);
    console.log(`  Top-up        : ${plan.topUp.length}${TOP_UP ? '' : ' (pass --top-up to enable)'}`);

    if (plan.create.length) {
      console.log('\nWill create:');
      for (const row of plan.create.slice(0, 40)) {
        console.log(`  + [${row.kind}] ${row.sku} · ${row.variation}`);
      }
      if (plan.create.length > 40) {
        console.log(`  … and ${plan.create.length - 40} more`);
      }
    }

    if (plan.topUp.length) {
      console.log('\nWill top up:');
      for (const row of plan.topUp.slice(0, 20)) {
        console.log(`  ↑ ${row.sku} · ${row.stocks} → ${TARGET_STOCKS}`);
      }
      if (plan.topUp.length > 20) {
        console.log(`  … and ${plan.topUp.length - 20} more`);
      }
    }

    if (!CONFIRM) {
      console.log('\nDry run only. Re-run with --yes to apply.');
      return;
    }

    if (!plan.create.length && !plan.topUp.length) {
      console.log('\nNothing to do — all variants already exist at target stock.');
      return;
    }

    await client.query('BEGIN');
    let created = 0;
    let topped = 0;

    try {
      for (const variant of plan.create) {
        const saved = await createVariant(client, variant, adminId);
        created += 1;
        console.log(`Created ${saved.sku} (${variant.variation}) @ ${TARGET_STOCKS}`);
      }

      for (const row of plan.topUp) {
        const added = await topUpVariant(client, {
          inventory_id: row.inventoryId,
          stocks: row.stocks,
        }, adminId);
        if (added) {
          topped += 1;
          console.log(`Topped up ${row.sku}: +${added} → ${TARGET_STOCKS}`);
        }
      }

      await client.query('COMMIT');
      console.log(`\nDone. Created ${created} item(s), topped up ${topped} item(s).`);
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
