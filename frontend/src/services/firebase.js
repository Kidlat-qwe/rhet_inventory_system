import { initializeApp } from 'firebase/app'
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseApp = config.apiKey ? initializeApp(config) : null
export const auth = firebaseApp ? getAuth(firebaseApp) : null
export const firebaseConfigured = Boolean(firebaseApp)
export const observeAuth = (callback) => auth ? onAuthStateChanged(auth, callback) : () => {}
export const signInAdmin = async (email, password) => {
  const credential = await signInWithEmailAndPassword(auth, email, password)
  await credential.user.getIdToken(true)
  return credential
}
export const signOutAdmin = () => signOut(auth)
