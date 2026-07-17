import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  AUTH_BYPASS: z.enum(['true', 'false']).default('false'),
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  // Prefer discrete DB_*_<ENV> vars; DATABASE_URL remains a fallback.
  DATABASE_URL: z.string().optional(),
  DATABASE_SSL: z.enum(['true', 'false']).optional(),
  DB_HOST_DEVELOPMENT: z.string().optional(),
  DB_PORT_DEVELOPMENT: z.coerce.number().int().positive().optional(),
  DB_NAME_DEVELOPMENT: z.string().optional(),
  DB_USER_DEVELOPMENT: z.string().optional(),
  DB_PASSWORD_DEVELOPMENT: z.string().optional(),
  DB_SSL_DEVELOPMENT: z.enum(['true', 'false']).optional(),
  DB_HOST_TEST: z.string().optional(),
  DB_PORT_TEST: z.coerce.number().int().positive().optional(),
  DB_NAME_TEST: z.string().optional(),
  DB_USER_TEST: z.string().optional(),
  DB_PASSWORD_TEST: z.string().optional(),
  DB_SSL_TEST: z.enum(['true', 'false']).optional(),
  DB_HOST_PRODUCTION: z.string().optional(),
  DB_PORT_PRODUCTION: z.coerce.number().int().positive().optional(),
  DB_NAME_PRODUCTION: z.string().optional(),
  DB_USER_PRODUCTION: z.string().optional(),
  DB_PASSWORD_PRODUCTION: z.string().optional(),
  DB_SSL_PRODUCTION: z.enum(['true', 'false']).optional(),
  PSMS_INTEGRATION_KEY: z.string().optional(),
  PSMS_WEBHOOK_URL: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const config = parsed.data;
const envSuffix = config.NODE_ENV.toUpperCase();

function dbVar(name) {
  return config[`${name}_${envSuffix}`];
}

const discreteHost = dbVar('DB_HOST');
const discreteUser = dbVar('DB_USER');
const discretePassword = dbVar('DB_PASSWORD');
const discreteName = dbVar('DB_NAME');
const hasDiscreteDb = Boolean(discreteHost && discreteUser && discretePassword && discreteName);

if (!hasDiscreteDb && !config.DATABASE_URL) {
  console.error(
    `Missing database configuration. Provide DB_HOST_${envSuffix}, DB_PORT_${envSuffix}, DB_NAME_${envSuffix}, DB_USER_${envSuffix}, DB_PASSWORD_${envSuffix} (and DB_SSL_${envSuffix}) or DATABASE_URL.`,
  );
  process.exit(1);
}

const databaseSslFlag = hasDiscreteDb
  ? (dbVar('DB_SSL') ?? 'true')
  : (config.DATABASE_SSL ?? 'false');

export const env = {
  ...config,
  database: hasDiscreteDb
    ? {
        host: discreteHost,
        port: dbVar('DB_PORT') || 5432,
        database: discreteName,
        user: discreteUser,
        password: discretePassword,
      }
    : null,
  databaseUrl: hasDiscreteDb ? null : config.DATABASE_URL,
  databaseSsl: databaseSslFlag === 'true',
  authBypass: config.AUTH_BYPASS === 'true' && config.NODE_ENV !== 'production',
};
