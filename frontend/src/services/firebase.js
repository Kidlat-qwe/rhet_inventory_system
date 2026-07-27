import { initializeApp } from 'firebase/app'
import {
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseApp = config.apiKey ? initializeApp(config) : null
export const auth = firebaseApp ? getAuth(firebaseApp) : null
export const firebaseConfigured = Boolean(firebaseApp)
export const observeAuth = (callback) => (auth ? onAuthStateChanged(auth, callback) : () => {})
export const signInAdmin = async (email, password) => {
  const credential = await signInWithEmailAndPassword(auth, email, password)
  await credential.user.getIdToken(true)
  return credential
}
export const signOutAdmin = () => signOut(auth)

/** Send Firebase password-reset email for the signed-in user's address. */
export async function sendPasswordResetForCurrentUser() {
  if (!auth?.currentUser?.email) {
    throw new Error('No signed-in email is available for password reset.')
  }
  const email = auth.currentUser.email
  await sendPasswordResetEmail(auth, email)
  return email
}
