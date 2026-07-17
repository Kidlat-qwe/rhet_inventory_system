import { firebaseAuth } from '../src/config/firebase.js';
import { pool } from '../src/database/pool.js';

const email = process.argv[2] || 'mjtamayo@little-champion.com';
const password = process.argv[3] || '@dmin-1234';
const fullName = process.argv[4] || 'MJ Tamayo';

const auth = firebaseAuth();

let user;
try {
  user = await auth.getUserByEmail(email);
  console.log('Firebase user already exists:', user.uid);
  await auth.updateUser(user.uid, {
    password,
    displayName: fullName,
    emailVerified: true,
    disabled: false,
  });
  console.log('Updated password and display name');
} catch (error) {
  if (error.code !== 'auth/user-not-found') throw error;
  user = await auth.createUser({
    email,
    password,
    displayName: fullName,
    emailVerified: true,
    disabled: false,
  });
  console.log('Created Firebase user:', user.uid);
}

await auth.setCustomUserClaims(user.uid, { admin: true });
console.log('Set custom claim admin: true');

const existing = await pool.query(
  'SELECT user_id FROM users WHERE firebase_uid = $1 OR LOWER(email) = LOWER($2) LIMIT 1',
  [user.uid, email],
);

let result;
if (existing.rowCount) {
  result = await pool.query(
    `UPDATE users
     SET firebase_uid = $1, email = $2, full_name = $3, status = 'ACTIVE', role = 'ADMIN', updated_at = NOW()
     WHERE user_id = $4
     RETURNING user_id, firebase_uid, email, full_name, role, status`,
    [user.uid, email, fullName, existing.rows[0].user_id],
  );
} else {
  result = await pool.query(
    `INSERT INTO users (firebase_uid, email, full_name, status, role)
     VALUES ($1, $2, $3, 'ACTIVE', 'ADMIN')
     RETURNING user_id, firebase_uid, email, full_name, role, status`,
    [user.uid, email, fullName],
  );
}

console.log('users row:', result.rows[0]);
await pool.end();
