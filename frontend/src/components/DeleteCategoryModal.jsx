import { useState } from 'react'

/**
 * Admin-only confirm before deleting a category.
 * User must type the exact category name to enable Delete.
 * When the category has items, those items are deleted with the category (if safe).
 */
export function DeleteCategoryModal({ category, itemCount = 0, busy, onClose, onConfirm }) {
  const [typedName, setTypedName] = useState('')
  const expected = String(category?.categoryName || '').trim()
  const matches = typedName.trim() === expected
  const canDelete = Boolean(expected) && matches && !busy
  const count = Number(itemCount) || 0

  function submit(e) {
    e.preventDefault()
    if (!canDelete) return
    onConfirm(category, typedName.trim())
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="modal modal-sm delete-category-modal" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <h2>Delete category</h2>
            <p>This cannot be undone. Type the category name to confirm.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          <div className="delete-category-warning">
            You are about to permanently delete{' '}
            <strong>{expected || 'this category'}</strong>.
            {count > 0 ? (
              <>
                {' '}
                This will also permanently delete{' '}
                <strong>{count} inventory item{count === 1 ? '' : 's'}</strong> in this category
                (and their stock history). Items linked to online/manual orders, pending stock requests,
                or used outside this category as kit components cannot be deleted — the whole delete will fail.
              </>
            ) : (
              <> Categories with no items are removed immediately after confirmation.</>
            )}
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
            {busy ? 'Deleting…' : 'Delete category'}
          </button>
        </div>
      </form>
    </div>
  )
}
