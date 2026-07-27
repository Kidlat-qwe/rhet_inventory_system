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

async function getUserOrThrow(userId) {
  const result = await pool.query(
    `SELECT user_id, firebase_uid, email, full_name, role, status, created_at, updated_at
     FROM users WHERE user_id = $1`,
    [userId],
  );
  if (!result.rowCount) throw new AppError(404, 'USER_NOT_FOUND', 'User was not found');
  return result.rows[0];
}

async function syncFirebaseDisabled(firebaseUid, disabled) {
  if (!firebaseUid || String(firebaseUid).startsWith('local-')) return;
  try {
    await firebaseAuth().updateUser(firebaseUid, { disabled: Boolean(disabled) });
  } catch (error) {
    console.error('Firebase updateUser failed', error.code || '', error.message);
    throw new AppError(502, 'FIREBASE_USER_UPDATE_FAILED', 'Unable to update the Firebase account status');
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

export async function updateUserStatus(userId, status, currentAdminId) {
  const normalized = String(status || '').toUpperCase();
  if (!['ACTIVE', 'INACTIVE'].includes(normalized)) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Status must be ACTIVE or INACTIVE');
  }
  if (userId === currentAdminId && normalized === 'INACTIVE') {
    throw new AppError(422, 'VALIDATION_ERROR', 'You cannot deactivate your own account');
  }

  const existing = await getUserOrThrow(userId);
  await syncFirebaseDisabled(existing.firebase_uid, normalized === 'INACTIVE');

  const result = await pool.query(
    `UPDATE users
     SET status = $1, updated_at = NOW()
     WHERE user_id = $2
     RETURNING user_id, firebase_uid, email, full_name, role, status, created_at, updated_at`,
    [normalized, userId],
  );
  return camelize(result.rows[0]);
}

export async function updateUser(userId, input, currentAdminId) {
  const existing = await getUserOrThrow(userId);
  const updates = {};

  if (input.fullName !== undefined) {
    updates.fullName = String(input.fullName || '').trim();
    if (updates.fullName.length < 2) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Full name must be at least 2 characters');
    }
  }

  if (input.role !== undefined) {
    updates.role = String(input.role || '').toUpperCase();
    if (!['ADMIN', 'USER'].includes(updates.role)) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Role must be ADMIN or USER');
    }
    if (userId === currentAdminId && updates.role !== 'ADMIN') {
      throw new AppError(422, 'VALIDATION_ERROR', 'You cannot remove your own administrator role');
    }
  }

  if (input.status !== undefined) {
    updates.status = String(input.status || '').toUpperCase();
    if (!['ACTIVE', 'INACTIVE'].includes(updates.status)) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Status must be ACTIVE or INACTIVE');
    }
    if (userId === currentAdminId && updates.status === 'INACTIVE') {
      throw new AppError(422, 'VALIDATION_ERROR', 'You cannot deactivate your own account');
    }
  }

  if (updates.status && updates.status !== existing.status) {
    await syncFirebaseDisabled(existing.firebase_uid, updates.status === 'INACTIVE');
  }

  if (updates.fullName && existing.firebase_uid && !String(existing.firebase_uid).startsWith('local-')) {
    try {
      await firebaseAuth().updateUser(existing.firebase_uid, { displayName: updates.fullName });
    } catch (error) {
      console.error('Firebase displayName update failed', error.code || '', error.message);
    }
  }

  const sets = [];
  const values = [];
  if (updates.fullName !== undefined) {
    values.push(updates.fullName);
    sets.push(`full_name = $${values.length}`);
  }
  if (updates.role !== undefined) {
    values.push(updates.role);
    sets.push(`role = $${values.length}`);
  }
  if (updates.status !== undefined) {
    values.push(updates.status);
    sets.push(`status = $${values.length}`);
  }
  if (!sets.length) {
    return camelize(existing);
  }

  values.push(userId);
  const result = await pool.query(
    `UPDATE users
     SET ${sets.join(', ')}, updated_at = NOW()
     WHERE user_id = $${values.length}
     RETURNING user_id, firebase_uid, email, full_name, role, status, created_at, updated_at`,
    values,
  );
  return camelize(result.rows[0]);
}
