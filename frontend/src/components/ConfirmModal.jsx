import { createPortal } from 'react-dom'

/**
 * App-wide confirmation dialog. Prefer `useConfirm()` from ConfirmContext
 * so admin and user pages share one modal instead of `window.confirm`.
 */
export function ConfirmModal({
  open,
  title = 'Please confirm',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  onCancel,
  onConfirm,
}) {
  if (!open) return null

  return createPortal(
    <div
      className="modal-backdrop confirm-modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel?.()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-message"
    >
      <div className="modal modal-sm confirm-modal">
        <div className="modal-head">
          <div>
            <h2 id="confirm-modal-title">{title}</h2>
            {message ? <p id="confirm-modal-message">{message}</p> : null}
          </div>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Close">×</button>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={busy}
            autoFocus
          >
            {busy ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
