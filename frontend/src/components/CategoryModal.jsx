import { useMemo, useState } from 'react'
import {
  CATEGORY_KIND_OPTIONS,
  CATEGORY_TYPE_OPTIONS,
  UNIFORM_SUBTYPE_OPTIONS,
  categoryTypeOf,
  isUniformFamilyKind,
} from '../constants/uniformOptions'

function resolveUiType(categoryKind) {
  if (isUniformFamilyKind(categoryKind)) return 'UNIFORM'
  if (categoryKind === 'LEARNING_KIT') return 'LEARNING_KIT'
  return 'OTHER'
}

function resolveUniformSubtype(categoryKind) {
  return isUniformFamilyKind(categoryKind) ? categoryKind : 'SCHOOL_UNIFORM'
}

function namePlaceholder(uiType, uniformSubtype) {
  if (uiType === 'UNIFORM') {
    const subtype = UNIFORM_SUBTYPE_OPTIONS.find((entry) => entry.value === uniformSubtype)
    return subtype ? `e.g. ${subtype.categoryName}` : 'e.g. School Uniform'
  }
  if (uiType === 'LEARNING_KIT') return 'e.g. Learning Kit, Moving Up Kit'
  return 'e.g. Bag, Book, Tool Kit'
}

export function CategoryModal({ category = null, categories = [], busy, onClose, onSave }) {
  const isEdit = Boolean(category)
  const initialKind = category?.categoryKind || 'OTHER'
  const [categoryType, setCategoryType] = useState(() => categoryTypeOf(category))
  const [uiType, setUiType] = useState(() => resolveUiType(initialKind))
  const [uniformSubtype, setUniformSubtype] = useState(() => resolveUniformSubtype(initialKind))
  const [name, setName] = useState(category?.categoryName || '')
  const [hasChildSkus, setHasChildSkus] = useState(Boolean(category?.hasChildSkus) || initialKind === 'TOOL_KIT')

  const existingNames = useMemo(
    () => new Set(
      categories
        .filter((entry) => entry.categoryId !== category?.categoryId)
        .map((entry) => String(entry.categoryName || '').toLowerCase().trim()),
    ),
    [categories, category],
  )

  const resolvedKind = uiType === 'UNIFORM'
    ? uniformSubtype
    : uiType === 'LEARNING_KIT'
      ? 'LEARNING_KIT'
      : 'OTHER'

  const resolvedName = name.trim()
  const alreadyExists = resolvedName.length >= 2 && existingNames.has(resolvedName.toLowerCase())
  const canSubmit = !alreadyExists && resolvedName.length >= 2

  function onUiTypeChange(value) {
    setUiType(value)
    if (value === 'UNIFORM' && !isUniformFamilyKind(uniformSubtype)) {
      setUniformSubtype('SCHOOL_UNIFORM')
    }
    if (value !== 'OTHER') setHasChildSkus(false)
  }

  function submit(e) {
    e.preventDefault()
    if (!canSubmit) return
    onSave({
      categoryName: resolvedName,
      categoryType,
      categoryKind: resolvedKind,
      hasChildSkus: resolvedKind === 'OTHER' ? hasChildSkus : false,
    })
  }

  const typeHint = (() => {
    if (uiType === 'UNIFORM') {
      return 'Choose School Uniform, PE Uniform, or Shirt. Each uses Gender / Type / Size (or Logo) fields on inventory items.'
    }
    if (uiType === 'LEARNING_KIT') {
      return 'Bundle behavior: virtual stock from included categories; concrete SKUs chosen on stock request. Use this kind for Learning Kit, Moving Up Kit, or any similar pack. Stored as LEARNING_KIT for partner APIs.'
    }
    if (hasChildSkus) {
      return 'Parent items can include raw child SKUs. Parent stock is how many complete sets can be built.'
    }
    return 'Free-text variation items (bags, books, accessories, tool kits without child SKUs, etc.).'
  })()

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal modal-sm" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <h2>{isEdit ? 'Edit category' : 'Add category'}</h2>
            <p>
              {isEdit
                ? 'Update this category. Category type groups Merchandise vs Supplies; kind controls item behavior.'
                : 'Choose Merchandise or Supplies, then set the kind and a unique name.'}
            </p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <div className="form-grid">
          <label>Category type *
            <select value={categoryType} onChange={(e) => setCategoryType(e.target.value)}>
              {CATEGORY_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>Kind *
            <select value={uiType} onChange={(e) => onUiTypeChange(e.target.value)}>
              {CATEGORY_KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          {uiType === 'UNIFORM' && (
            <label>Uniform type *
              <select value={uniformSubtype} onChange={(e) => setUniformSubtype(e.target.value)}>
                {UNIFORM_SUBTYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          )}
          <label className={uiType === 'UNIFORM' ? 'full-width' : undefined}>Category name *
            <input
              required
              minLength={2}
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={namePlaceholder(uiType, uniformSubtype)}
            />
            <small className="field-hint">
              Unique display name. You can reuse a type with a different name.
            </small>
          </label>
          {uiType === 'OTHER' && (
            <label className="full-width category-toggle">
              <span className="category-toggle-row">
                <span>
                  <strong>Parent items with child SKUs</strong>
                  <small className="field-hint">
                    When enabled, each item can include raw child SKUs. Parent stock is how many complete sets can be built from those children.
                  </small>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={hasChildSkus}
                  className={`toggle-switch${hasChildSkus ? ' on' : ''}`}
                  onClick={() => setHasChildSkus((value) => !value)}
                  disabled={busy}
                >
                  <span className="toggle-knob" />
                </button>
              </span>
            </label>
          )}
        </div>
        <p className="field-hint category-type-hint">{typeHint}</p>
        {alreadyExists && <p className="form-error">A category with this name already exists.</p>}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" disabled={busy || !canSubmit}>
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Add category'}
          </button>
        </div>
      </form>
    </div>
  )
}
