import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { subscribeApiProcessing } from '../services/api'

/**
 * Global indeterminate progress modal for mutating API calls (POST/PATCH/PUT/DELETE).
 * Mount once near the app root; driven by `api()` in services/api.js.
 */
export function ProcessingModalHost() {
  const [state, setState] = useState({ open: false, title: 'Please wait', message: 'Processing…' })

  useEffect(() => subscribeApiProcessing(setState), [])

  if (!state.open) return null

  return createPortal(
    <div
      className="processing-backdrop"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-live="assertive"
      aria-labelledby="processing-title"
      aria-describedby="processing-message"
    >
      <div className="processing-modal">
        <h2 id="processing-title">{state.title || 'Please wait'}</h2>
        <p id="processing-message">{state.message || 'Processing…'}</p>
        <div className="processing-bar" aria-hidden="true">
          <div className="processing-bar-fill" />
        </div>
      </div>
    </div>,
    document.body,
  )
}
