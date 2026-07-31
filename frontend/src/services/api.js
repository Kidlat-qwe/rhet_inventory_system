import { auth } from './firebase'

export const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1'

async function authHeaders(extra = {}) {
  const token = await auth?.currentUser?.getIdToken()
  return {
    ...(token && { Authorization: `Bearer ${token}` }),
    ...extra,
  }
}

export async function api(path, options = {}) {
  const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
      ...options.headers,
    },
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error?.message || 'Request failed')
  return payload
}
