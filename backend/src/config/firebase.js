import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { env } from './env.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultServiceAccountPath = path.join(
  here,
  'rhet-inventory-firebase-adminsdk-fbsvc-e933f0dc86.json',
);

/**
 * Coolify / Docker often mangle FIREBASE_PRIVATE_KEY (quotes, literal \\n).
 * Also supports FIREBASE_PRIVATE_KEY_BASE64.
 */
function normalizeFirebasePrivateKey(raw) {
  if (raw == null) return null;
  let key = String(raw).trim();
  if (!key) return null;

  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }

  for (let i = 0; i < 3; i += 1) {
    if (key.includes('\\n')) key = key.replace(/\\n/g, '\n');
    else break;
  }

  return key.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function resolveFirebasePrivateKey() {
  const b64 = String(env.FIREBASE_PRIVATE_KEY_BASE64 || '').trim();
  if (b64) {
    try {
      return Buffer.from(b64, 'base64').toString('utf8');
    } catch {
      console.warn('FIREBASE_PRIVATE_KEY_BASE64 is set but could not be decoded');
    }
  }
  return normalizeFirebasePrivateKey(env.FIREBASE_PRIVATE_KEY);
}

function loadFromEnv() {
  const projectId = env.FIREBASE_PROJECT_ID;
  const clientEmail = env.FIREBASE_CLIENT_EMAIL;
  const privateKey = resolveFirebasePrivateKey();

  if (!projectId || !clientEmail || !privateKey) return null;
  if (!privateKey.includes('BEGIN PRIVATE KEY')) {
    throw new Error(
      'FIREBASE_PRIVATE_KEY does not look like a PEM key after normalization. ' +
        'Use quoted \\n newlines, or set FIREBASE_PRIVATE_KEY_BASE64 on Coolify.',
    );
  }

  return {
    projectId,
    privateKeyId: env.FIREBASE_PRIVATE_KEY_ID,
    privateKey,
    clientEmail,
    clientId: env.FIREBASE_CLIENT_ID,
    authUri: env.FIREBASE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
    tokenUri: env.FIREBASE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
    authProviderX509CertUrl:
      env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL ||
      'https://www.googleapis.com/oauth2/v1/certs',
    clientX509CertUrl: env.FIREBASE_CLIENT_X509_CERT_URL,
    source: 'env',
  };
}

function loadFromJsonFile() {
  const configuredPath = env.FIREBASE_SERVICE_ACCOUNT_PATH
    ? path.resolve(process.cwd(), env.FIREBASE_SERVICE_ACCOUNT_PATH)
    : defaultServiceAccountPath;

  if (!fs.existsSync(configuredPath)) return null;

  const raw = JSON.parse(fs.readFileSync(configuredPath, 'utf8'));
  return {
    projectId: raw.project_id,
    privateKeyId: raw.private_key_id,
    privateKey: raw.private_key,
    clientEmail: raw.client_email,
    clientId: raw.client_id,
    authUri: raw.auth_uri,
    tokenUri: raw.token_uri,
    authProviderX509CertUrl: raw.auth_provider_x509_cert_url,
    clientX509CertUrl: raw.client_x509_cert_url,
    source: configuredPath,
  };
}

function loadServiceAccount() {
  // Prefer env vars (Coolify-friendly); fall back to local JSON.
  return loadFromEnv() || loadFromJsonFile();
}

function credential() {
  const account = loadServiceAccount();
  if (account) {
    return {
      credential: cert({
        projectId: account.projectId,
        clientEmail: account.clientEmail,
        privateKey: account.privateKey,
        privateKeyId: account.privateKeyId,
        clientId: account.clientId,
      }),
      projectId: account.projectId,
    };
  }
  return {
    credential: applicationDefault(),
    projectId: env.FIREBASE_PROJECT_ID,
  };
}

export function firebaseAuth() {
  const { credential: cred, projectId } = credential();
  const app = getApps()[0] || initializeApp({ credential: cred, projectId });
  return getAuth(app);
}
