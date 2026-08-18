import { useEffect, useMemo, useState } from 'react'
import {
  getUniformGendersForCategory,
  getUniformSizesForCategory,
  getUniformTypesForCategory,
  isLcaShirtCategory,
  isLearningKitCategory,
  isToolKitCategory,
  isUniformCategory,
  parseUniformVariation,
  generateUniqueSku,
  canGenerateSku,
  getFieldPlaceholders,
} from '../constants/uniformOptions'
import { useSettings } from '../context/SettingsContext'
import { addShirtLogo } from '../services/inventoryApi'
import { normalizeInventoryText } from '../utils/format'

const ADD_LOGO_VALUE = '__add_logo__'

function newLearningKitRow() {
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
  const settings = useSettings()
  const defaultThreshold = settings.defaultLowStockThreshold ?? 20
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
    remarks: item.remarks || '',
    stocks: item.stocks ?? 0,
    lowStockThreshold: item.lowStockThreshold ?? defaultThreshold,
    price: item.price ?? 0,
    internalSellingPrice: item.internalSellingPrice ?? 0,
  })
  const [components, setComponents] = useState(() => {
    if (isLearningKitCategory(initialCategoryId, categories) && Array.isArray(item.components) && item.components.length) {
      return item.components.map(rowFromSavedComponent)
    }
    return isLearningKitCategory(initialCategoryId, categories) ? [newLearningKitRow()] : []
  })
  const [localError, setLocalError] = useState('')
  const [addingLogo, setAddingLogo] = useState(false)
  const [newLogoName, setNewLogoName] = useState('')
  const [extraLogos, setExtraLogos] = useState([])
  const [logoBusy, setLogoBusy] = useState(false)

  const isUniform = isUniformCategory(form.categoryId, categories)
  const isLearningKit = isLearningKitCategory(form.categoryId, categories)
  const isToolKit = isToolKitCategory(form.categoryId, categories)
  const isLcaShirt = isLcaShirtCategory(form.categoryId, categories)
  const uniformTypes = useMemo(() => {
    const configured = getUniformTypesForCategory(form.categoryId, categories, form.uniformGender, {
      shirtLogos: settings.shirtLogos,
    })
    const extras = extraLogos.filter((logo) => !configured.some((entry) => entry.toLowerCase() === logo.toLowerCase()))
    const selected = form.uniformType && ![...configured, ...extras].includes(form.uniformType)
      ? [form.uniformType]
      : []
    return [...configured, ...extras, ...selected]
  }, [form.categoryId, form.uniformGender, form.uniformType, categories, settings.shirtLogos, extraLogos])
  const uniformGenders = getUniformGendersForCategory(form.categoryId, categories)
  const uniformSizes = getUniformSizesForCategory(form.categoryId, categories, {
    uniformSizes: settings.uniformSizes,
    shirtSizes: settings.shirtSizes,
  })
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
      .filter((entry) => entry.categoryId === categoryId && entry.kitRole !== 'RAW_COMPONENT')
      .reduce((sum, entry) => sum + (Number(entry.stocks) || 0), 0))
    if (totals.length !== selected.length) return 0
    return Math.min(...totals)
  }, [isLearningKit, components, items])

  useEffect(() => {
    const lockSku = Boolean(item.inventoryId) && isUniform
    if (lockSku) return
    if (!canGenerateSku(form, categories) && isUniform) return
    const nextSku = generateUniqueSku(form, categories, items)
    if (!nextSku) return
    setForm((current) => (current.sku === nextSku ? current : { ...current, sku: nextSku }))
  }, [
    item.inventoryId,
    isUniform,
    form.categoryId,
    form.itemName,
    form.uniformGender,
    form.uniformType,
    form.uniformSize,
    categories,
    items,
  ])

  function setCategoryId(value) {
    setForm((current) => {
      const nextUniform = isUniformCategory(value, categories)
      const currentUniform = isUniformCategory(current.categoryId, categories)
      const nextTypes = getUniformTypesForCategory(value, categories, current.uniformGender, {
        shirtLogos: settings.shirtLogos,
      })
      const keepType = nextTypes.includes(current.uniformType) ? current.uniformType : ''
      const nextLearningKit = isLearningKitCategory(value, categories)

      setComponents(() => (nextLearningKit ? [newLearningKitRow()] : []))

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
      const nextTypes = getUniformTypesForCategory(current.categoryId, categories, value, {
        shirtLogos: settings.shirtLogos,
      })
      const keepType = nextTypes.includes(current.uniformType) ? current.uniformType : ''
      return { ...current, uniformGender: value, uniformType: keepType }
    })
  }

  function onLogoSelect(value) {
    if (value === ADD_LOGO_VALUE) {
      setAddingLogo(true)
      setNewLogoName('')
      setLocalError('')
      return
    }
    setAddingLogo(false)
    set('uniformType', value)
  }

  async function saveNewLogo() {
    const name = newLogoName.trim()
    if (!name) {
      setLocalError('Enter a logo name.')
      return
    }
    if (name.length > 20) {
      setLocalError('Logo name must be 20 characters or fewer.')
      return
    }
    const exists = uniformTypes.some((entry) => entry.toLowerCase() === name.toLowerCase())
    if (exists) {
      set('uniformType', uniformTypes.find((entry) => entry.toLowerCase() === name.toLowerCase()))
      setAddingLogo(false)
      setNewLogoName('')
      return
    }
    setLogoBusy(true)
    setLocalError('')
    try {
      const nextSettings = await addShirtLogo(name)
      const saved = nextSettings?.shirtLogos?.find((entry) => entry.toLowerCase() === name.toLowerCase()) || name
      setExtraLogos((current) => (current.includes(saved) ? current : [...current, saved]))
      set('uniformType', saved)
      setAddingLogo(false)
      setNewLogoName('')
    } catch (err) {
      setLocalError(err.message || 'Could not add logo.')
    } finally {
      setLogoBusy(false)
    }
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

    if (isToolKit) {
      onSave({ ...form, stocks: item.inventoryId ? form.stocks : 0, components: undefined })
      return
    }

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
                : isToolKit
                  ? 'This category uses parent items with child SKUs. After saving, click the item name on Inventory to open its raw items page and add child SKUs. Parent stock is computed from those raw items.'
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
              <label>{isLcaShirt ? 'Logo *' : 'Type *'}
                <select
                  required={!addingLogo}
                  value={addingLogo ? ADD_LOGO_VALUE : form.uniformType}
                  onChange={(e) => onLogoSelect(e.target.value)}
                >
                  <option value="">{isLcaShirt ? 'Select logo' : 'Select type'}</option>
                  {uniformTypes.map((option) => <option key={option} value={option}>{option}</option>)}
                  {isLcaShirt && <option value={ADD_LOGO_VALUE}>+ Add logo</option>}
                </select>
                {isLcaShirt && addingLogo && (
                  <span className="add-logo-row">
                    <input
                      autoFocus
                      maxLength={20}
                      value={newLogoName}
                      onChange={(e) => setNewLogoName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          saveNewLogo()
                        }
                      }}
                      placeholder="e.g. Beeli"
                      aria-label="New logo name"
                    />
                    <button type="button" className="secondary" disabled={logoBusy || !newLogoName.trim()} onClick={saveNewLogo}>
                      {logoBusy ? 'Adding…' : 'Add'}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      disabled={logoBusy}
                      onClick={() => {
                        setAddingLogo(false)
                        setNewLogoName('')
                        setLocalError('')
                      }}
                    >
                      Cancel
                    </button>
                  </span>
                )}
              </label>
              <label>Size *
                <select required value={form.uniformSize} onChange={(e) => set('uniformSize', e.target.value)}>
                  <option value="">Select size</option>
                  {uniformSizes.map((option) => <option key={option} value={option}>{option}</option>)}
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
            {item.inventoryId && isUniform && (
              <small className="field-hint">SKU is locked after creation for uniform items.</small>
            )}
            {item.inventoryId && !isUniform && (
              <small className="field-hint">SKU updates automatically when you change the item name.</small>
            )}
            {!item.inventoryId && !isUniform && (
              <small className="field-hint">Auto-generated from category and item name.</small>
            )}
          </label>
          <label>{isUniform ? 'Per-piece selling price (₱) *' : 'Selling price (₱) *'}<input required type="number" min="0" step="0.01" value={form.price} onChange={(e) => set('price', e.target.value)} /></label>
          <label>Internal selling price (₱) *<input required type="number" min="0" step="0.01" value={form.internalSellingPrice} onChange={(e) => set('internalSellingPrice', e.target.value)} /></label>
          <label>Low-stock threshold *<input required type="number" min="0" value={form.lowStockThreshold} onChange={(e) => set('lowStockThreshold', e.target.value)} /></label>
          {isLearningKit || isToolKit ? (
            <label>
              Available kits (computed)
              <input
                className="readonly-input"
                readOnly
                value={isLearningKit ? (computedKitStocks ?? 0) : (item.stocks ?? 0)}
                tabIndex={-1}
              />
              <small className="field-hint">
                {isToolKit
                  ? 'Managed from the Inventory table: click the parent name, then add raw items. Stock = how many kits those raw items can build.'
                  : 'Minimum of total stock in each included category. Concrete sizes/SKUs are chosen when an external system requests the kit.'}
              </small>
            </label>
          ) : (
            !item.inventoryId && <label>Initial stock *<input required type="number" min="0" value={form.stocks} onChange={(e) => set('stocks', e.target.value)} /></label>
          )}
        </div>
        {localError && !isLearningKit && <p className="form-error">{localError}</p>}

        <label className="full-width">
          Remarks
          <textarea
            rows={3}
            maxLength={500}
            value={form.remarks}
            onChange={(e) => set('remarks', e.target.value)}
            placeholder="Optional description or notes for this item"
          />
          <small className="field-hint">{String(form.remarks || '').length}/500</small>
        </label>

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
              <button type="button" className="secondary" onClick={() => setComponents((rows) => [...rows, newLearningKitRow()])}>
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
            {localError && isLearningKit && <p className="form-error">{localError}</p>}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy || addingLogo || !categories.length || !canGenerateSku(form, categories)}>
            {busy ? 'Saving…' : item.inventoryId ? 'Save changes' : 'Add merchandise'}
          </button>
        </div>
      </form>
    </div>
  )
}
