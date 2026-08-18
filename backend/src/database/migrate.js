import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../../database/migrations');

function quoteIdent(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe database name: ${name}`);
  }
  return `"${name}"`;
}

try {
  await pool.query('CREATE SCHEMA IF NOT EXISTS public');
  await pool.query('SET search_path TO public');
  const dbName = (await pool.query('SELECT current_database() AS name')).rows[0].name;
  try {
    await pool.query(`ALTER DATABASE ${quoteIdent(dbName)} SET search_path TO public`);
  } catch (error) {
    console.warn(`Could not persist search_path on ${dbName}: ${error.message}`);
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const files = (await fs.readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
  for (const filename of files) {
    const exists = await pool.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [filename]);
    if (exists.rowCount) continue;
    const sql = await fs.readFile(path.join(migrationsDir, filename), 'utf8');
    await pool.query(sql);
    await pool.query('INSERT INTO schema_migrations(filename) VALUES($1)', [filename]);
    console.log(`Applied ${filename}`);
  }
} finally {
  await pool.end();
}
