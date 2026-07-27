import { useEffect, useMemo, useState } from 'react'
import { CATEGORY_TYPE_OPTIONS } from '../constants/uniformOptions'

function suggestedNameForType(typeValue, existingNames) {
  const option = CATEGORY_TYPE_OPTIONS.find((entry) => entry.value === typeValue)
  if (!option || typeValue === 'OTHER') return ''
  const base = option.categoryName
  if (!existingNames.has(base.toLowerCase())) return base
  let n = 2
  while (existingNames.has(`${base} ${n}`.toLowerCase())) n += 1
  return `${base} ${n}`
}

export function CategoryModal({ category = null, categories = [], busy, onClose, onSave }) {
  const isEdit = Boolean(category)
  const [type, setType] = useState(category?.categoryKind || 'OTHER')
  const [name, setName] = useState(category?.categoryName || '')
  const [nameTouched, setNameTouched] = useState(isEdit)

  const existingNames = useMemo(
    () => new Set(
      categories
        .filter((entry) => entry.categoryId !== category?.categoryId)
        .map((entry) => String(entry.categoryName || '').toLowerCase().trim()),
    ),
    [categories, category],
  )

  const selected = CATEGORY_TYPE_OPTIONS.find((option) => option.value === type) || CATEGORY_TYPE_OPTIONS.at(-1)
  const resolvedName = name.trim()
  const alreadyExists = resolvedName.length >= 2 && existingNames.has(resolvedName.toLowerCase())
  const canSubmit = !alreadyExists && resolvedName.length >= 2

  useEffect(() => {
    if (isEdit || nameTouched) return
    setName(suggestedNameForType(type, existingNames))
  }, [type, existingNames, isEdit, nameTouched])

  function onTypeChange(value) {
    setType(value)
    if (!nameTouched) {
      setName(suggestedNameForType(value, existingNames))
    }
  }

  function submit(e) {
    e.preventDefault()
    if (!canSubmit) return
    onSave({
      categoryName: resolvedName,
      categoryKind: type,
    })
  }

  const typeHint = (() => {
    if (type === 'LEARNING_KIT') {
      return 'Learning Kit behavior: virtual stock from included categories; concrete SKUs chosen on stock request.'
    }
    if (type === 'OTHER') {
      return 'Free-text variation items (bags, books, accessories, etc.).'
    }
    return 'Items in this category use Gender, Type, and Size. You can reuse this type with a different unique name.'
  })()

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal modal-sm" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <h2>{isEdit ? 'Edit category' : 'Add category'}</h2>
            <p>
              {isEdit
                ? 'Rename this merchandise category. Behavior type stays the same unless you change it below.'
                : 'Category type can be reused. Category name must be unique.'}
            </p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <div className="form-grid">
          <label>Category type *
            <select
              value={type}
              onChange={(e) => (isEdit ? setType(e.target.value) : onTypeChange(e.target.value))}
            >
              {CATEGORY_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <small className="field-hint">{typeHint}</small>
          </label>
          <label>Category name *
            <input
              autoFocus
              required
              minLength="2"
              maxLength={100}
              value={name}
              onChange={(e) => {
                setNameTouched(true)
                setName(e.target.value)
              }}
              placeholder={selected?.categoryName || 'e.g. Bag, Book, Accessory'}
            />
            {alreadyExists && <small className="field-hint">This category name already exists. Choose a unique name.</small>}
            {!alreadyExists && !isEdit && (
              <small className="field-hint">
                Tip: keep a clear unique label (e.g. “Junior School Uniform”) while reusing the School Uniform type.
              </small>
            )}
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy || !canSubmit}>
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Add category'}
          </button>
        </div>
      </form>
    </div>
  )
}
