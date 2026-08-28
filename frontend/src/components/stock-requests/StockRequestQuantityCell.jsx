import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { adjustStockRequestQuantity } from '../../services/inventoryApi'

/**
 * Inline quantity editor for pending stock-request lines.
 * Click qty → edit → ✓ opens remarks modal → saves and notifies CMS via webhook.
 */
export function StockRequestQuantityCell({
  request,
  disabled = false,
  onAdjusted,
  onError,
}) {
  const canEdit = !disabled
    && request?.status === 'PENDING'
    && String(request?.requestKind || '').toUpperCase() !== 'RETURN'
    && Boolean(request?.matchedSku || request?.inventoryId)

  const [editing, setEditing] = useState(false)
  const [draftQty, setDraftQty] = useState(String(request?.quantity ?? ''))
  const [modalOpen, setModalOpen] = useState(false)
  const [remarks, setRemarks] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!editing) setDraftQty(String(request?.quantity ?? ''))
  }, [request?.quantity, editing])

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus()
  }, [editing])

  function startEdit() {
    if (!canEdit) return
    setDraftQty(String(request.quantity ?? ''))
    setEditing(true)
    setRemarks('')
  }

  function cancelEdit() {
    setEditing(false)
    setDraftQty(String(request.quantity ?? ''))
    setModalOpen(false)
    setRemarks('')
  }

  function openRemarksModal() {
    const parsed = Number.parseInt(String(draftQty).trim(), 10)
    if (!Number.isInteger(parsed) || parsed < 1) {
      onError?.('Enter a valid whole number quantity')
      return
    }
    if (parsed === Number(request.quantity)) {
      onError?.('New quantity must be different from the current quantity')
      return
    }
    if (parsed > Number(request.quantity)) {
      onError?.('Quantity can only be reduced, not increased')
      return
    }
    const available = Number(request.currentStocks)
    if (Number.isFinite(available) && parsed > available) {
      onError?.(`Only ${available} unit(s) are available in warehouse stock`)
      return
    }
    setModalOpen(true)
  }

  async function confirmAdjust(event) {
    event.preventDefault()
    const parsed = Number.parseInt(String(draftQty).trim(), 10)
    const note = remarks.trim()
    if (note.length < 3) {
      onError?.('Remarks are required (at least 3 characters)')
      return
    }
    setSaving(true)
    try {
      await adjustStockRequestQuantity(request.requestId, {
        quantity: parsed,
        remarks: note,
      })
      setEditing(false)
      setModalOpen(false)
      setRemarks('')
      onAdjusted?.()
    } catch (err) {
      onError?.(err.message || 'Unable to adjust quantity')
    } finally {
      setSaving(false)
    }
  }

  const originalQty = request.originalQuantity ?? null
  const showWas = originalQty != null && Number(originalQty) !== Number(request.quantity)

  if (!editing) {
    return (
      <div className="qty-adjust-cell">
        {canEdit ? (
          <button
            type="button"
            className="qty-adjust-trigger"
            onClick={startEdit}
            title="Click to adjust quantity before ship"
          >
            <strong>{request.quantity}</strong>
          </button>
        ) : (
          <strong>{request.quantity}</strong>
        )}
        {showWas ? <small className="qty-adjust-was">was {originalQty}</small> : null}
        {request.quantityAdjustmentRemarks ? (
          <small className="qty-adjust-note" title={request.quantityAdjustmentRemarks}>
            {request.quantityAdjustmentRemarks}
          </small>
        ) : null}
      </div>
    )
  }

  return (
    <>
      <div className="qty-adjust-editor">
        <input
          ref={inputRef}
          type="number"
          min="1"
          step="1"
          className="qty-adjust-input"
          value={draftQty}
          onChange={(e) => setDraftQty(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') cancelEdit()
            if (e.key === 'Enter') {
              e.preventDefault()
              openRemarksModal()
            }
          }}
          aria-label="Adjusted quantity"
        />
        <button
          type="button"
          className="qty-adjust-icon ok"
          onClick={(event) => {
            event.stopPropagation()
            openRemarksModal()
          }}
          title="Save quantity"
          aria-label="Save quantity"
        >
          ✓
        </button>
        <button
          type="button"
          className="qty-adjust-icon cancel"
          onClick={cancelEdit}
          title="Cancel"
          aria-label="Cancel quantity edit"
        >
          ✕
        </button>
      </div>

      {modalOpen && createPortal(
        <div
          className="modal-backdrop qty-adjust-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="qty-adjust-modal-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) cancelEdit()
          }}
        >
          <form className="modal small" onSubmit={confirmAdjust}>
            <div className="modal-head">
              <div>
                <h2 id="qty-adjust-modal-title">Adjust quantity</h2>
                <p>
                  Change from <strong>{request.quantity}</strong> to <strong>{draftQty}</strong>
                  {Number.isFinite(Number(request.currentStocks))
                    ? ` · ${request.currentStocks} available in warehouse`
                    : ''}
                </p>
              </div>
              <button type="button" onClick={cancelEdit} disabled={saving}>×</button>
            </div>
            <div className="integration-note warn">
              CMS will be notified of this change. Branch stock is credited using the adjusted quantity when delivery is confirmed.
            </div>
            <label>
              Remarks *
              <textarea
                required
                minLength={3}
                autoFocus
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. Only 3 units available in warehouse"
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={cancelEdit} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save adjustment'}
              </button>
            </div>
          </form>
        </div>,
        document.body,
      )}
    </>
  )
}
