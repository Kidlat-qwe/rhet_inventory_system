import { auth } from './firebase'

export const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1'

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

let processingDepth = 0
let processingMessage = 'Processing…'
let processingTitle = 'Please wait'
const processingListeners = new Set()

function emitProcessing() {
  const snapshot = {
    open: processingDepth > 0,
    title: processingTitle,
    message: processingMessage,
  }
  processingListeners.forEach((listener) => listener(snapshot))
}

function beginProcessing(method) {
  processingDepth += 1
  if (method === 'DELETE') {
    processingTitle = 'Deleting'
    processingMessage = 'Deleting data. Please wait…'
  } else if (method === 'PATCH' || method === 'PUT') {
    processingTitle = 'Updating'
    processingMessage = 'Updating data. Please wait…'
  } else {
    processingTitle = 'Saving'
    processingMessage = 'Saving data. Please wait…'
  }
  emitProcessing()
}

function endProcessing() {
  processingDepth = Math.max(0, processingDepth - 1)
  emitProcessing()
}

/** Subscribe to global mutating-request progress state. Returns unsubscribe. */
export function subscribeApiProcessing(listener) {
  processingListeners.add(listener)
  listener({
    open: processingDepth > 0,
    title: processingTitle,
    message: processingMessage,
  })
  return () => processingListeners.delete(listener)
}

async function authHeaders(extra = {}) {
  const token = await auth?.currentUser?.getIdToken()
  return {
    ...(token && { Authorization: `Bearer ${token}` }),
    ...extra,
  }
}

/**
 * Authenticated JSON API helper.
 * Mutating methods (POST/PUT/PATCH/DELETE) show a global progress modal unless `silent: true`.
 */
export async function api(path, options = {}) {
  const { silent = false, ...fetchOptions } = options
  const method = String(fetchOptions.method || 'GET').toUpperCase()
  const showProcessing = MUTATING_METHODS.has(method) && !silent

  if (showProcessing) beginProcessing(method)

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...fetchOptions,
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaders()),
        ...fetchOptions.headers,
      },
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error?.message || 'Request failed')
    return payload
  } finally {
    if (showProcessing) endProcessing()
  }
}
