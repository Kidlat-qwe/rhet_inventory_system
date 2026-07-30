import { useState } from 'react'

/**
 * Admin-only confirm before deleting an inventory item.
 * User must type the exact item name to enable Delete.
 */
export function DeleteInventoryModal({ item, busy, onClose, onConfirm }) {
  const [typedName, setTypedName] = useState('')
  const expected = String(item?.itemName || '').trim()
  const matches = typedName.trim() === expected
  const canDelete = Boolean(expected) && matches && !busy

  function submit(e) {
    e.preventDefault()
    if (!canDelete) return
    onConfirm(item)
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="modal modal-sm delete-category-modal" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <h2>Delete item</h2>
            <p>This cannot be undone. Type the item name to confirm.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          <div className="delete-category-warning">
            You are about to permanently delete{' '}
            <strong>{expected || 'this item'}</strong>
            {item?.sku ? (
              <>
                {' '}
                (<span className="sku-chip">{item.sku}</span>)
              </>
            ) : null}
            .
            Stock history for this SKU will also be removed. Completed stock-request history is kept (unlinked). Items still linked to online orders, kit BOMs, or pending/approved stock requests cannot be deleted.
          </div>

          <label>
            Type <strong>{expected}</strong> to confirm
            <input
              type="text"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={typedName}
              disabled={busy}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder={expected}
            />
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="danger" disabled={!canDelete}>
            {busy ? 'Deleting…' : 'Delete item'}
          </button>
        </div>
      </form>
    </div>
  )
}
