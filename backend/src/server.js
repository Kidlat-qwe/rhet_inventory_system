import { app } from './app.js';
import { env } from './config/env.js';
import { pool } from './database/pool.js';

const server = app.listen(env.PORT, async () => {
  const expected = env.database?.database || 'DATABASE_URL';
  console.log(`Inventory API listening on http://localhost:${env.PORT}`);
  try {
    const result = await pool.query('SELECT current_database() AS database');
    const actual = result.rows[0].database;
    console.log(`Database: ${actual}  NODE_ENV=${env.NODE_ENV}`);
    if (env.database && actual !== env.database.database) {
      console.error(`WARNING: expected ${expected} but connected to ${actual}. Check DB_NAME_${env.NODE_ENV.toUpperCase()}.`);
    }
  } catch (error) {
    console.error(`Database "${expected}" is not reachable: ${error.message}`);
  }
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => { await pool.end(); process.exit(0); });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
