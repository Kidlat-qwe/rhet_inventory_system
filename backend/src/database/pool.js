import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

const poolConfig = env.database
  ? {
      host: env.database.host,
      port: env.database.port,
      database: env.database.database,
      user: env.database.user,
      password: env.database.password,
      ssl: env.databaseSsl ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    }
  : {
      connectionString: env.databaseUrl,
      ssl: env.databaseSsl ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    };

export const pool = new Pool(poolConfig);

pool.on('error', (error) => console.error('Unexpected PostgreSQL pool error', error));

export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
