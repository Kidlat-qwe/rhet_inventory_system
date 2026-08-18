/**
 * Purge operational history from the PRODUCTION database.
 * Keeps categories, inventory (including BOM / child SKUs), users, settings,
 * and API keys. Inventory stock quantities are left as they are now.
 *
 * Clears:
 *   - Stock Requests (including components and shipment invoices)
 *   - Online Orders (orders, lines, matches)
 *   - Manual Orders (operational; not a catalog table)
 *   - Release Logs (derived from the above + sale/return movements)
 *   - Stock Movements
 *   - Channel allocation logs / stock snapshots (they reference movements)
 *
 * USAGE (from backend/):
 *   node scripts/purge-operational-data.mjs
 *     Dry run: connect to inventsys_prod, print counts, delete nothing.
 *
 *   node scripts/purge-operational-data.mjs --production --yes
 *     Apply the purge on the production database only.
 */
import 'dotenv/config';
import pg from 'pg';

const APPLY = process.argv.includes('--yes');
const ALLOW_PRODUCTION = process.argv.includes('--production');

const PURGE_TABLES = [
  'stock_request_invoice_lines',
  'stock_request_invoices',
  'stock_request_components',
  'stock_requests',
  'online_order_item_matches',
  'online_order_items',
  'online_orders',
  'manual_order_items',
  'manual_orders',
  'channel_allocation_logs',
  'channel_stock_snapshots',
  'stock_movements',
];

const KEEP_TABLES = [
  'categories',
  'inventory',
  'inventory_bundle_components',
  'users',
  'system_settings',
  'integration_clients',
  'channel_sku_mappings',
];

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`Missing ${name} in backend/.env`);
  }
  return value;
}

function productionPool() {
  const host = requireEnv('DB_HOST_PRODUCTION');
  const port = process.env.DB_PORT_PRODUCTION || '5432';
  const database = requireEnv('DB_NAME_PRODUCTION');
  const user = requireEnv('DB_USER_PRODUCTION');
  const password = requireEnv('DB_PASSWORD_PRODUCTION');
  const ssl = String(process.env.DB_SSL_PRODUCTION || 'true') === 'true';
  const connectionString = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}?sslmode=${ssl ? 'require' : 'disable'}`;
  return {
    expectedDatabase: database,
    pool: new pg.Pool({
      connectionString,
      ssl: ssl ? { rejectUnauthorized: false } : false,
      max: 4,
    }),
  };
}

async function existingTables(client, names) {
  const result = await client.query(
    `SELECT tablename
     FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename = ANY($1::text[])`,
    [names],
  );
  return result.rows.map((row) => row.tablename);
}

async function countTable(client, table) {
  const result = await client.query(`SELECT COUNT(*)::int AS n FROM public.${table}`);
  return result.rows[0].n;
}

async function snapshot(client, tables) {
  const rows = {};
  for (const table of tables) {
    rows[table] = await countTable(client, table);
  }
  return rows;
}

const { expectedDatabase, pool } = productionPool();
const client = await pool.connect();

try {
  await client.query('CREATE SCHEMA IF NOT EXISTS public');
  await client.query('SET search_path TO public');

  const actual = (await client.query('SELECT current_database() AS name')).rows[0].name;
  if (actual !== expectedDatabase) {
    throw new Error(`Refusing to continue: connected to "${actual}", expected "${expectedDatabase}"`);
  }

  const purgeTables = await existingTables(client, PURGE_TABLES);
  const keepTables = await existingTables(client, KEEP_TABLES);

  console.log(`Target database: ${actual}`);
  console.log('\nWill keep (catalog / config):');
  console.table(await snapshot(client, keepTables));
  console.log('\nWill delete (operational history):');
  console.table(await snapshot(client, purgeTables));

  if (!APPLY) {
    console.log('\nDry run only. Nothing was deleted.');
    console.log('To apply on production: node scripts/purge-operational-data.mjs --production --yes');
    process.exit(0);
  }

  if (!ALLOW_PRODUCTION) {
    throw new Error('Refusing to delete. Pass both --production and --yes.');
  }

  await client.query('BEGIN');
  await client.query(`TRUNCATE TABLE ${purgeTables.map((name) => `public.${name}`).join(', ')} RESTART IDENTITY`);
  try {
    await client.query('ALTER SEQUENCE IF EXISTS stock_request_invoice_number_seq RESTART WITH 1');
  } catch (error) {
    console.warn(`Could not reset invoice sequence: ${error.message}`);
  }
  await client.query('COMMIT');

  console.log('\nPurge complete.');
  console.log('\nKept:');
  console.table(await snapshot(client, keepTables));
  console.log('\nOperational tables (should be 0):');
  console.table(await snapshot(client, purgeTables));
} catch (error) {
  try {
    await client.query('ROLLBACK');
  } catch {
    /* no open transaction */
  }
  console.error(error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
