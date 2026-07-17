import { auth } from './firebase'

export const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1'

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

export async function downloadCsv(path, filename) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: await authHeaders(),
  })
  if (!response.ok) {
    let message = 'Export failed'
    try {
      const payload = await response.json()
      message = payload.error?.message || message
    } catch {
      // CSV errors may not be JSON.
    }
    throw new Error(message)
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
