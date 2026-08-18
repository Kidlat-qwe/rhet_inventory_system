/**
 * Update internal selling prices for selected uniform variants.
 *
 * Targets:
 *   - Shirt (LCA_SHIRT / Shirt category)  → ₱156  (all sizes / logos)
 *   - PE Uniform type Pants               → ₱336
 *   - School Uniform type Set             → ₱540
 *
 * USAGE (from backend/):
 *   node scripts/update-uniform-internal-prices.mjs         # dry run
 *   node scripts/update-uniform-internal-prices.mjs --yes   # apply updates
 */
import { pool } from '../src/database/pool.js';

const CONFIRM = process.argv.includes('--yes');

const RULES = [
  {
    key: 'shirt',
    label: 'Shirt (LCA_SHIRT) — all items',
    price: 156,
    sql: `
      SELECT i.inventory_id, i.sku, i.item_name, i.uniform_type, i.uniform_size,
             i.internal_selling_price, c.category_name, c.category_kind
      FROM inventory i
      JOIN categories c ON c.category_id = i.category_id
      WHERE c.category_kind = 'LCA_SHIRT'
         OR LOWER(TRIM(c.category_name)) IN ('shirt', 'lca shirt', 'lca t-shirt', 'lca tshirt')
      ORDER BY c.category_name, i.sku
    `,
  },
  {
    key: 'pe-pants',
    label: 'PE Uniform — Pants only',
    price: 336,
    sql: `
      SELECT i.inventory_id, i.sku, i.item_name, i.uniform_type, i.uniform_size,
             i.internal_selling_price, c.category_name, c.category_kind
      FROM inventory i
      JOIN categories c ON c.category_id = i.category_id
      WHERE (
          c.category_kind = 'PE_UNIFORM'
          OR LOWER(TRIM(c.category_name)) = 'pe uniform'
        )
        AND (
          LOWER(TRIM(COALESCE(i.uniform_type, ''))) = 'pants'
          OR LOWER(COALESCE(i.variation, '')) LIKE '%pants%'
        )
      ORDER BY i.sku
    `,
  },
  {
    key: 'school-set',
    label: 'School Uniform — Set only',
    price: 540,
    sql: `
      SELECT i.inventory_id, i.sku, i.item_name, i.uniform_type, i.uniform_size,
             i.internal_selling_price, c.category_name, c.category_kind
      FROM inventory i
      JOIN categories c ON c.category_id = i.category_id
      WHERE (
          c.category_kind = 'SCHOOL_UNIFORM'
          OR LOWER(TRIM(c.category_name)) = 'school uniform'
        )
        AND (
          LOWER(TRIM(COALESCE(i.uniform_type, ''))) = 'set'
          OR i.sku ILIKE '%-SET-%'
          OR i.sku ILIKE '%SET'
          OR LOWER(COALESCE(i.variation, '')) LIKE '% · set · %'
          OR LOWER(COALESCE(i.variation, '')) LIKE '%set%'
            AND LOWER(TRIM(COALESCE(i.uniform_type, ''))) = 'set'
        )
      ORDER BY i.sku
    `,
  },
];

function money(value) {
  return Number(value || 0).toFixed(2);
}

async function main() {
  const client = await pool.connect();
  try {
    console.log(CONFIRM ? 'APPLY MODE — updating internal_selling_price\n' : 'DRY RUN — pass --yes to apply\n');

    let totalMatched = 0;
    let totalChanged = 0;

    for (const rule of RULES) {
      const result = await client.query(rule.sql);
      const rows = result.rows;
      const needingChange = rows.filter((row) => Number(row.internal_selling_price) !== rule.price);

      console.log(`=== ${rule.label} → ₱${rule.price} ===`);
      console.log(`Matched: ${rows.length}  |  Need update: ${needingChange.length}`);

      if (!rows.length) {
        console.log('(no rows)\n');
        continue;
      }

      for (const row of rows.slice(0, 25)) {
        const current = money(row.internal_selling_price);
        const mark = Number(row.internal_selling_price) === rule.price ? '=' : '→';
        console.log(
          `  ${mark} ${row.sku || '—'} | ${row.uniform_type || '—'} / ${row.uniform_size || '—'} | ${current} ${mark === '→' ? `→ ${money(rule.price)}` : ''}`,
        );
      }
      if (rows.length > 25) console.log(`  … and ${rows.length - 25} more`);

      totalMatched += rows.length;

      if (CONFIRM && needingChange.length) {
        const ids = needingChange.map((row) => row.inventory_id);
        const updated = await client.query(
          `UPDATE inventory
           SET internal_selling_price = $1,
               updated_at = NOW()
           WHERE inventory_id = ANY($2::uuid[])
           RETURNING inventory_id`,
          [rule.price, ids],
        );
        totalChanged += updated.rowCount;
        console.log(`Updated: ${updated.rowCount}`);
      }

      console.log('');
    }

    console.log('---');
    console.log(`Total matched: ${totalMatched}`);
    if (CONFIRM) {
      console.log(`Total updated: ${totalChanged}`);
    } else {
      console.log('No changes written. Re-run with --yes to apply.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
