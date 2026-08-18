import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

function discreteConnectionString(database) {
  const user = encodeURIComponent(database.user);
  const password = encodeURIComponent(database.password);
  const name = encodeURIComponent(database.database);
  const sslMode = env.databaseSsl ? 'require' : 'disable';
  // Neon pooler routes by the path database name. Discrete host+database
  // options can land on the role default DB, so both "envs" look the same.
  // pg_restore can leave search_path empty, which makes public.users "not exist".
  return `postgresql://${user}:${password}@${database.host}:${database.port}/${name}?sslmode=${sslMode}`;
}

const poolConfig = env.database
  ? {
      connectionString: discreteConnectionString(env.database),
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
