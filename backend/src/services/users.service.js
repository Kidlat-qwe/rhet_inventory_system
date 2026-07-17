import { firebaseAuth } from '../config/firebase.js';
import { pool } from '../database/pool.js';
import { AppError, camelize } from '../utils/api.js';

export async function listUsers() {
  const result = await pool.query(
    `SELECT user_id, firebase_uid, email, full_name, role, status, created_at, updated_at
     FROM users
     ORDER BY full_name`,
  );
  return camelize(result.rows);
}

export async function createUser(input) {
  const email = String(input.email || '').trim().toLowerCase();
  const fullName = String(input.fullName || '').trim();
  const password = String(input.password || '');
  const role = String(input.role || 'USER').toUpperCase() === 'ADMIN' ? 'ADMIN' : 'USER';

  const existing = await pool.query(
    'SELECT user_id FROM users WHERE LOWER(email) = LOWER($1)',
    [email],
  );
  if (existing.rowCount) {
    throw new AppError(409, 'USER_EXISTS', 'A user with this email already exists');
  }

  let firebaseUser;
  try {
    firebaseUser = await firebaseAuth().createUser({
      email,
      password,
      displayName: fullName,
      emailVerified: false,
      disabled: false,
    });
  } catch (error) {
    if (error?.code === 'auth/email-already-exists') {
      throw new AppError(409, 'USER_EXISTS', 'This email is already registered in Firebase Auth');
    }
    if (error?.code === 'auth/invalid-password' || error?.code === 'auth/weak-password') {
      throw new AppError(422, 'VALIDATION_ERROR', 'Password must be at least 6 characters');
    }
    console.error('Firebase createUser failed', error.code || '', error.message);
    throw new AppError(502, 'FIREBASE_USER_CREATE_FAILED', 'Unable to create the Firebase account');
  }

  try {
    const result = await pool.query(
      `INSERT INTO users (firebase_uid, email, full_name, role, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE')
       RETURNING user_id, firebase_uid, email, full_name, role, status, created_at, updated_at`,
      [firebaseUser.uid, email, fullName, role],
    );
    return camelize(result.rows[0]);
  } catch (error) {
    // Roll back Firebase user if DB insert fails.
    try {
      await firebaseAuth().deleteUser(firebaseUser.uid);
    } catch (cleanupError) {
      console.error('Failed to clean up Firebase user after DB error', cleanupError.message);
    }
    if (error.code === '23505') {
      throw new AppError(409, 'USER_EXISTS', 'A user with this email already exists');
    }
    throw error;
  }
}

export async function updateUserRole(userId, role, currentAdminId) {
  const normalized = String(role || '').toUpperCase();
  if (!['ADMIN', 'USER'].includes(normalized)) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Role must be ADMIN or USER');
  }
  if (userId === currentAdminId && normalized !== 'ADMIN') {
    throw new AppError(422, 'VALIDATION_ERROR', 'You cannot remove your own administrator role');
  }

  const result = await pool.query(
    `UPDATE users
     SET role = $1, updated_at = NOW()
     WHERE user_id = $2
     RETURNING user_id, firebase_uid, email, full_name, role, status, created_at, updated_at`,
    [normalized, userId],
  );
  if (!result.rowCount) throw new AppError(404, 'USER_NOT_FOUND', 'User was not found');
  return camelize(result.rows[0]);
}
