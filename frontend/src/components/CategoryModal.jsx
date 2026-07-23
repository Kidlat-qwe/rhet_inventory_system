import { useMemo, useState } from 'react'
import { CATEGORY_TYPE_OPTIONS } from '../constants/uniformOptions'

export function CategoryModal({ category = null, categories = [], busy, onClose, onSave }) {
  const isEdit = Boolean(category)
  const [type, setType] = useState('OTHER')
  const [name, setName] = useState(category?.categoryName || '')

  const existingNames = useMemo(
    () => new Set(
      categories
        .filter((entry) => entry.categoryId !== category?.categoryId)
        .map((entry) => String(entry.categoryName || '').toLowerCase().trim()),
    ),
    [categories, category],
  )

  const selected = CATEGORY_TYPE_OPTIONS.find((option) => option.value === type)
  const isOther = isEdit || type === 'OTHER'
  const resolvedName = isOther ? name.trim() : selected.categoryName
  const alreadyExists = existingNames.has(resolvedName.toLowerCase())
  const canSubmit = !alreadyExists && (isOther ? name.trim().length >= 2 : Boolean(resolvedName))

  function submit(e) {
    e.preventDefault()
    if (!canSubmit) return
    onSave(resolvedName)
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal modal-sm" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <h2>{isEdit ? 'Edit category' : 'Add category'}</h2>
            <p>{isEdit ? 'Rename this merchandise category.' : 'Choose a category type, then name it.'}</p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <div className="form-grid">
          {!isEdit && (
            <label>Category type *
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {CATEGORY_TYPE_OPTIONS.map((option) => {
                  const disabled = option.value !== 'OTHER' && existingNames.has(option.categoryName.toLowerCase())
                  return (
                    <option key={option.value} value={option.value} disabled={disabled}>
                      {option.label}{disabled ? ' (already exists)' : ''}
                    </option>
                  )
                })}
              </select>
            </label>
          )}
          {isOther ? (
            <label>Category name *
              <input
                autoFocus
                required
                minLength="2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Bag, Book, Accessory"
              />
              {alreadyExists && <small className="field-hint">This category already exists.</small>}
            </label>
          ) : (
            <label>Category name
              <input readOnly className="readonly-input" value={resolvedName} />
              <small className="field-hint">
                {alreadyExists
                  ? 'This category already exists.'
                  : type === 'LEARNING_KIT'
                    ? 'Learning Kit items keep their own stock and include a bill of materials.'
                    : 'Items in this category use Gender, Type, and Size.'}
              </small>
            </label>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy || !canSubmit}>{busy ? 'Saving…' : isEdit ? 'Save changes' : 'Add category'}</button>
        </div>
      </form>
    </div>
  )
}
