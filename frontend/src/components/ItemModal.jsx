import { useEffect, useMemo, useState } from 'react'
import {
  UNIFORM_SIZES,
  getFieldPlaceholders,
  getUniformGendersForCategory,
  getUniformTypesForCategory,
  isLearningKitCategory,
  isUniformCategory,
  parseUniformVariation,
  generateUniqueSku,
  canGenerateSku,
} from '../constants/uniformOptions'
import { normalizeInventoryText } from '../utils/format'

function newComponentRow() {
  return {
    key: crypto.randomUUID(),
    categoryId: '',
  }
}

function rowFromSavedComponent(component) {
  return {
    key: component.componentRowId || crypto.randomUUID(),
    categoryId: component.categoryId || component.componentCategoryId || '',
  }
}

export function ItemModal({ item, categories, items = [], busy, lockCategory = false, onClose, onSave }) {
  const initialCategoryId = item.categoryId || categories[0]?.categoryId || ''
  const initialUniform = isUniformCategory(initialCategoryId, categories)
    ? {
        uniformGender: item.uniformGender || parseUniformVariation(item.variation).uniformGender,
        uniformType: item.uniformType || parseUniformVariation(item.variation).uniformType,
        uniformSize: item.uniformSize || parseUniformVariation(item.variation).uniformSize,
      }
    : { uniformGender: '', uniformType: '', uniformSize: '' }

  const [form, setForm] = useState({
    inventoryId: item.inventoryId,
    sku: item.sku || '',
    itemName: normalizeInventoryText(item.itemName || ''),
    categoryId: initialCategoryId,
    variation: initialUniform.uniformGender ? '' : normalizeInventoryText(item.variation || ''),
    uniformGender: initialUniform.uniformGender,
    uniformType: initialUniform.uniformType,
    uniformSize: initialUniform.uniformSize,
    stocks: item.stocks ?? 0,
    lowStockThreshold: item.lowStockThreshold ?? 20,
    price: item.price ?? 0,
  })
  const [components, setComponents] = useState(() => {
    if (Array.isArray(item.components) && item.components.length) {
      return item.components.map(rowFromSavedComponent)
    }
    return isLearningKitCategory(initialCategoryId, categories) ? [newComponentRow()] : []
  })
  const [localError, setLocalError] = useState('')

  const isUniform = isUniformCategory(form.categoryId, categories)
  const isLearningKit = isLearningKitCategory(form.categoryId, categories)
  const uniformTypes = getUniformTypesForCategory(form.categoryId, categories, form.uniformGender)
  const uniformGenders = getUniformGendersForCategory(form.categoryId, categories)
  const placeholders = getFieldPlaceholders(form.categoryId, categories)
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const componentCategories = useMemo(
    () => categories.filter((category) => !isLearningKitCategory(category.categoryId, categories)),
    [categories],
  )

  const computedKitStocks = useMemo(() => {
    if (!isLearningKit) return null
    const selected = components.map((row) => row.categoryId).filter(Boolean)
    if (!selected.length) return 0
    const totals = selected.map((categoryId) => items
      .filter((entry) => entry.categoryId === categoryId)
      .reduce((sum, entry) => sum + (Number(entry.stocks) || 0), 0))
    if (totals.length !== selected.length) return 0
    return Math.min(...totals)
  }, [isLearningKit, components, items])

  useEffect(() => {
    if (item.inventoryId) return
    const nextSku = generateUniqueSku(form, categories, items)
    setForm((current) => (current.sku === nextSku ? current : { ...current, sku: nextSku }))
  }, [item.inventoryId, form.categoryId, form.itemName, form.uniformGender, form.uniformType, form.uniformSize, categories, items])

  function setCategoryId(value) {
    setForm((current) => {
      const nextUniform = isUniformCategory(value, categories)
      const currentUniform = isUniformCategory(current.categoryId, categories)
      const nextTypes = getUniformTypesForCategory(value, categories, current.uniformGender)
      const keepType = nextTypes.includes(current.uniformType) ? current.uniformType : ''
      const nextKit = isLearningKitCategory(value, categories)

      setComponents((rows) => {
        if (nextKit && !rows.length) return [newComponentRow()]
        if (!nextKit) return []
        return rows
      })

      if (nextUniform && !currentUniform) {
        return {
          ...current,
          categoryId: value,
          variation: '',
          uniformGender: '',
          uniformType: '',
          uniformSize: '',
        }
      }
      if (!nextUniform && currentUniform) {
        return {
          ...current,
          categoryId: value,
          uniformGender: '',
          uniformType: '',
          uniformSize: '',
          variation: '',
        }
      }
      if (nextUniform && currentUniform) {
        return {
          ...current,
          categoryId: value,
          uniformType: keepType,
        }
      }
      return { ...current, categoryId: value }
    })
  }

  function setUniformGender(value) {
    setForm((current) => {
      const nextTypes = getUniformTypesForCategory(current.categoryId, categories, value)
      const keepType = nextTypes.includes(current.uniformType) ? current.uniformType : ''
      return { ...current, uniformGender: value, uniformType: keepType }
    })
  }

  function updateComponent(key, patch) {
    setComponents((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  function setComponentCategory(key, categoryId) {
    updateComponent(key, { categoryId })
  }

  function submit(e) {
    e.preventDefault()
    setLocalError('')

    if (!isLearningKit) {
      onSave({ ...form, components: undefined })
      return
    }

    const resolved = []
    const seenCategories = new Set()

    for (const row of components) {
      if (!row.categoryId) {
        setLocalError('Each component row needs a category.')
        return
      }
      if (seenCategories.has(row.categoryId)) {
        setLocalError('Each category can only be included once.')
        return
      }
      seenCategories.add(row.categoryId)
      resolved.push({ categoryId: row.categoryId, quantity: 1 })
    }

    if (!resolved.length) {
      setLocalError('Add at least one category to the Learning Kit.')
      return
    }

    onSave({ ...form, stocks: 0, components: resolved })
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className={`modal${isLearningKit ? ' kit-modal' : ''}`} onSubmit={submit}>
        <div className="modal-head">
          <div>
            <h2>{item.inventoryId ? 'Edit merchandise' : 'Add new merchandise'}</h2>
            <p>
              {isLearningKit
                ? 'Choose which categories this kit includes. The external system picks the concrete items (size / SKU) when requesting stock. Available kits = minimum total stock across those categories.'
                : 'Enter the item and stock information below.'}
            </p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <div className="form-grid">
          <label>Item name *<input required minLength="2" value={form.itemName} onChange={(e) => set('itemName', normalizeInventoryText(e.target.value))} placeholder={placeholders.itemName} /></label>
          <label>Category *
            <select required value={form.categoryId} disabled={lockCategory} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.length ? categories.map((category) => <option key={category.categoryId} value={category.categoryId}>{category.categoryName}</option>) : <option value="">No categories available</option>}
            </select>
          </label>
          {isUniform ? (
            <>
              <label>Gender *
                <select required value={form.uniformGender} onChange={(e) => setUniformGender(e.target.value)}>
                  <option value="">Select gender</option>
                  {uniformGenders.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label>Type *
                <select required value={form.uniformType} onChange={(e) => set('uniformType', e.target.value)}>
                  <option value="">Select type</option>
                  {uniformTypes.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label>Size *
                <select required value={form.uniformSize} onChange={(e) => set('uniformSize', e.target.value)}>
                  <option value="">Select size</option>
                  {UNIFORM_SIZES.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            </>
          ) : (
            <label>Variation<input value={form.variation} onChange={(e) => set('variation', normalizeInventoryText(e.target.value))} placeholder={placeholders.variation} /></label>
          )}
          <label>SKU *
            <input
              required
              readOnly
              className="readonly-input"
              value={form.sku}
              placeholder={isUniform ? 'Auto-generated from category, gender, type, and size' : 'Auto-generated from category and item name'}
            />
            {item.inventoryId && (
              <small className="field-hint">SKU is locked after creation to keep external references stable.</small>
            )}
          </label>
          <label>{isUniform ? 'Per-piece price (₱) *' : 'Selling price (₱) *'}<input required type="number" min="0" step="0.01" value={form.price} onChange={(e) => set('price', e.target.value)} /></label>
          <label>Low-stock threshold *<input required type="number" min="0" value={form.lowStockThreshold} onChange={(e) => set('lowStockThreshold', e.target.value)} /></label>
          {isLearningKit ? (
            <label>
              Available kits (computed)
              <input className="readonly-input" readOnly value={computedKitStocks ?? 0} tabIndex={-1} />
              <small className="field-hint">
                Minimum of total stock in each included category. Concrete sizes/SKUs are chosen when an external system requests the kit.
              </small>
            </label>
          ) : (
            !item.inventoryId && <label>Initial stock *<input required type="number" min="0" value={form.stocks} onChange={(e) => set('stocks', e.target.value)} /></label>
          )}
        </div>

        {isLearningKit && (
          <div className="kit-components">
            <div className="kit-components-head">
              <div>
                <strong>Included categories</strong>
                <p>
                  Pick categories only. The external stock request fills the concrete inventory item
                  (uniform: gender · type · size; non-uniform: item name / SKU). Recipe quantity is always 1.
                </p>
              </div>
              <button type="button" className="secondary" onClick={() => setComponents((rows) => [...rows, newComponentRow()])}>
                + Add row
              </button>
            </div>
            <div
              className="overflow-x-auto rounded-lg kit-components-scroll"
              style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}
            >
              <table style={{ width: '100%', minWidth: '420px' }}>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Filled by requester</th>
                    <th>Qty</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {components.map((row) => {
                    const rowIsUniform = row.categoryId && isUniformCategory(row.categoryId, categories)
                    return (
                      <tr key={row.key}>
                        <td>
                          <select value={row.categoryId} onChange={(e) => setComponentCategory(row.key, e.target.value)} required>
                            <option value="">Select category</option>
                            {componentCategories.map((category) => (
                              <option key={category.categoryId} value={category.categoryId}>{category.categoryName}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          {!row.categoryId ? (
                            <span className="muted">Select a category first</span>
                          ) : rowIsUniform ? (
                            <span className="kit-resolved-sku">Gender · Type · Size</span>
                          ) : (
                            <span className="kit-resolved-sku">Item name / SKU</span>
                          )}
                        </td>
                        <td>
                          <input className="readonly-input kit-qty" value="1" readOnly tabIndex={-1} />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="secondary kit-remove"
                            onClick={() => setComponents((rows) => rows.filter((entry) => entry.key !== row.key))}
                            disabled={components.length <= 1}
                            aria-label="Remove component"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {localError && <p className="form-error">{localError}</p>}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy || !categories.length || !canGenerateSku(form, categories)}>
            {busy ? 'Saving…' : item.inventoryId ? 'Save changes' : 'Add merchandise'}
          </button>
        </div>
      </form>
    </div>
  )
}
