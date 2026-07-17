import { firebaseAuth } from '../config/firebase.js';
import { env } from '../config/env.js';
import { pool } from '../database/pool.js';
import { AppError } from '../utils/api.js';

function normalizeRole(role) {
  return String(role || 'ADMIN').toUpperCase() === 'USER' ? 'USER' : 'ADMIN';
}

async function developmentUser() {
  const result = await pool.query(`
    INSERT INTO users(firebase_uid, email, full_name, role)
    VALUES ('local-development-admin', 'admin@local.test', 'Local Administrator', 'ADMIN')
    ON CONFLICT (firebase_uid) DO UPDATE SET status = 'ACTIVE', role = 'ADMIN', updated_at = NOW()
    RETURNING *`);
  return result.rows[0];
}

export async function requireAuth(req, _res, next) {
  try {
    if (env.authBypass) {
      req.user = { uid: 'local-development-admin', email: 'admin@local.test', admin: true };
      req.admin = await developmentUser();
      return next();
    }

    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw new AppError(401, 'AUTH_REQUIRED', 'A Firebase bearer token is required');

    const decoded = await firebaseAuth().verifyIdToken(token, true);
    let account = await pool.query('SELECT * FROM users WHERE firebase_uid = $1', [decoded.uid]);

    if (!account.rowCount && decoded.email) {
      const byEmail = await pool.query(
        'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
        [decoded.email],
      );
      if (byEmail.rowCount) {
        await pool.query(
          'UPDATE users SET firebase_uid = $1, status = $2, updated_at = NOW() WHERE user_id = $3',
          [decoded.uid, 'ACTIVE', byEmail.rows[0].user_id],
        );
        account = await pool.query('SELECT * FROM users WHERE firebase_uid = $1', [decoded.uid]);
      }
    }

    if (!account.rowCount && decoded.admin === true) {
      account = await pool.query(`
        INSERT INTO users(firebase_uid, email, full_name, role)
        VALUES ($1, $2, $3, 'ADMIN') RETURNING *`,
        [decoded.uid, decoded.email, decoded.name || decoded.email?.split('@')[0] || 'Administrator']);
    }
    if (!account.rowCount || account.rows[0].status !== 'ACTIVE') {
      throw new AppError(403, 'ACCESS_REQUIRED', 'This account is not an active system user');
    }
    req.user = decoded;
    req.admin = account.rows[0];
    next();
  } catch (error) {
    if (error instanceof AppError) return next(error);
    console.error('Authentication failed', error.code || '', error.message);
    if (error.code === '28000' || error.code === '57P01' || /SSL|insecure|ECONNREFUSED|timeout/i.test(error.message || '')) {
      return next(new AppError(503, 'DATABASE_UNAVAILABLE', 'Unable to reach the database. Check DB host/SSL settings.'));
    }
    // Coolify often mangles FIREBASE_PRIVATE_KEY — surface that as 503, not a fake "invalid token".
    if (
      /private.?key|DECODER|PEM|credential|FIREBASE|Failed to parse|invalid_grant/i.test(error.message || '')
      || ['app/invalid-credential', 'auth/invalid-credential', 'app/invalid-app-options'].includes(error.code)
    ) {
      return next(new AppError(
        503,
        'FIREBASE_ADMIN_MISCONFIGURED',
        'Firebase Admin cannot verify tokens. Check FIREBASE_PRIVATE_KEY or FIREBASE_PRIVATE_KEY_BASE64 on the server.',
      ));
    }
    next(new AppError(401, 'INVALID_TOKEN', 'The Firebase token is invalid, expired, or revoked'));
  }
}

export function requireAdminRole(req, _res, next) {
  const role = normalizeRole(req.admin?.role);
  if (role !== 'ADMIN') {
    return next(new AppError(403, 'ADMIN_ROLE_REQUIRED', 'Only administrators can access this resource'));
  }
  return next();
}

export function getAccountRole(adminRow) {
  return normalizeRole(adminRow?.role);
}
