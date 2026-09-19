import { auth } from './firebase'

export const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1'

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** Only show the blocking modal if the mutation is still running after this delay. */
const PROCESSING_SHOW_DELAY_MS = 220

let processingDepth = 0
let processingMessage = 'Processing…'
let processingTitle = 'Please wait'
let processingVisible = false
let processingShowTimer = null
const processingListeners = new Set()

function emitProcessing() {
  const snapshot = {
    open: processingVisible && processingDepth > 0,
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

  // Fast CRUD finishes under the delay → no full-screen modal flash.
  if (processingDepth === 1 && !processingShowTimer && !processingVisible) {
    processingShowTimer = setTimeout(() => {
      processingShowTimer = null
      if (processingDepth > 0) {
        processingVisible = true
        emitProcessing()
      }
    }, PROCESSING_SHOW_DELAY_MS)
  }
}

function endProcessing() {
  processingDepth = Math.max(0, processingDepth - 1)
  if (processingDepth === 0) {
    if (processingShowTimer) {
      clearTimeout(processingShowTimer)
      processingShowTimer = null
    }
    processingVisible = false
  }
  emitProcessing()
}

/** Subscribe to global mutating-request progress state. Returns unsubscribe. */
export function subscribeApiProcessing(listener) {
  processingListeners.add(listener)
  listener({
    open: processingVisible && processingDepth > 0,
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
 * The modal only appears if the request takes longer than ~220ms.
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
    if (!response.ok) {
      const message = payload.error?.message || 'Request failed'
      const blocked = payload.error?.details?.blocked
      if (Array.isArray(blocked) && blocked.length) {
        const detail = blocked
          .map((row) => `${row.itemName || row.requestId}: ${row.reason}`)
          .filter(Boolean)
          .join('; ')
        throw new Error(detail ? `${message} (${detail})` : message)
      }
      throw new Error(message)
    }
    return payload
  } finally {
    if (showProcessing) endProcessing()
  }
}
