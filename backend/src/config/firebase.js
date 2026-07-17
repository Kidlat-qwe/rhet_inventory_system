import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { env } from './env.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultServiceAccountPath = path.join(here, 'rhet-inventory-firebase-adminsdk-fbsvc-e933f0dc86.json');

function loadServiceAccount() {
  const configuredPath = env.FIREBASE_SERVICE_ACCOUNT_PATH
    ? path.resolve(process.cwd(), env.FIREBASE_SERVICE_ACCOUNT_PATH)
    : defaultServiceAccountPath;

  if (fs.existsSync(configuredPath)) {
    const raw = JSON.parse(fs.readFileSync(configuredPath, 'utf8'));
    return {
      projectId: raw.project_id,
      clientEmail: raw.client_email,
      privateKey: raw.private_key,
      source: configuredPath,
    };
  }

  if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    return {
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      source: 'env',
    };
  }

  return null;
}

function credential() {
  const account = loadServiceAccount();
  if (account) {
    return {
      credential: cert({
        projectId: account.projectId,
        clientEmail: account.clientEmail,
        privateKey: account.privateKey,
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
