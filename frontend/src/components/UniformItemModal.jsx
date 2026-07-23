import { useEffect, useMemo, useState } from 'react'
import {
  UNIFORM_SIZES,
  buildUniformVariation,
  generateUniqueSku,
  getUniformGendersForCategory,
  getUniformTypesForCategory,
  parseUniformVariation,
} from '../constants/uniformOptions'
import { normalizeInventoryText } from '../utils/format'

function buildUniformItemName(categoryName, type) {
  const name = String(categoryName || '').trim()
  const typeLabel = String(type || '').trim()
  if (!typeLabel) return normalizeInventoryText(name).slice(0, 180)
  // Avoid "LCA T-Shirt Shirt" when the category already includes the type word.
  if (name.toLowerCase().includes(typeLabel.toLowerCase())) {
    return normalizeInventoryText(name).slice(0, 180)
  }
  return normalizeInventoryText(`${name} ${typeLabel}`).slice(0, 180)
}

function emptyLines(types, categoryName = '') {
  return types.reduce((acc, type) => ({
    ...acc,
    [type]: {
      itemName: buildUniformItemName(categoryName, type),
      stocks: 0,
      price: '',
      inventoryId: null,
      sku: '',
      previousStocks: 0,
    },
  }), {})
}

function resolveUniformFields(item) {
  if (item?.uniformGender && item?.uniformType && item?.uniformSize) {
    return {
      uniformGender: item.uniformGender,
      uniformType: item.uniformType,
      uniformSize: item.uniformSize,
    }
  }
  return parseUniformVariation(item?.variation)
}

// Finds every inventory row in the same uniform "set" (same category + gender + size).
export function findUniformSetMates(seedItem, items = []) {
  const fields = resolveUniformFields(seedItem)
  if (!seedItem?.categoryId || !fields.uniformGender || !fields.uniformSize) return [seedItem].filter(Boolean)
  return items.filter((entry) => {
    if (entry.categoryId !== seedItem.categoryId) return false
    const other = resolveUniformFields(entry)
    return other.uniformGender === fields.uniformGender && other.uniformSize === fields.uniformSize
  })
}

function linesFromItems(types, setItems, categoryName = '') {
  const next = emptyLines(types, categoryName)
  setItems.forEach((item) => {
    const fields = resolveUniformFields(item)
    const type = fields.uniformType
    if (!type || !next[type]) return
    next[type] = {
      itemName: normalizeInventoryText(item.itemName || buildUniformItemName(categoryName, type)),
      stocks: item.stocks ?? 0,
      previousStocks: item.stocks ?? 0,
      price: item.price ?? '',
      inventoryId: item.inventoryId,
      sku: item.sku || '',
    }
  })
  return next
}

// Creates or edits the type rows for a uniform category as a set. School Uniform
// pairs are Polo+Short (Male) or Blouse+Skirt (Female); PE is Shirt+Pants.
// Pass `editSeed` to open in edit mode with both mates of that gender/size.
export function UniformItemModal({
  category,
  categories,
  items = [],
  editSeed = null,
  busy,
  onClose,
  onSave,
}) {
  const isEdit = Boolean(editSeed?.inventoryId)
  const seedFields = resolveUniformFields(editSeed)

  const [gender, setGender] = useState(isEdit ? seedFields.uniformGender || '' : '')
  const [size, setSize] = useState(isEdit ? seedFields.uniformSize || '' : '')
  const [lowStockThreshold, setLowStockThreshold] = useState(
    isEdit ? (editSeed.lowStockThreshold ?? 20) : 20,
  )
  const [lines, setLines] = useState({})
  const [hydrated, setHydrated] = useState(false)

  const types = useMemo(
    () => getUniformTypesForCategory(category.categoryId, categories, gender),
    [category.categoryId, categories, gender],
  )
  const genders = useMemo(
    () => getUniformGendersForCategory(category.categoryId, categories),
    [category.categoryId, categories],
  )
  const isPair = types.length > 1

  const setMates = useMemo(
    () => (isEdit ? findUniformSetMates(editSeed, items) : []),
    [isEdit, editSeed, items],
  )

  // Create mode: rebuild empty lines when the type pair changes with gender.
  // Edit mode: hydrate once from the existing set mates.
  useEffect(() => {
    if (isEdit) {
      if (!hydrated && types.length) {
        const seed = setMates[0] || editSeed
        setLines(linesFromItems(types, setMates, category.categoryName))
        setLowStockThreshold(seed?.lowStockThreshold ?? 20)
        setHydrated(true)
      }
      return
    }
    setLines(emptyLines(types, category.categoryName))
  }, [types, isEdit, hydrated, setMates, editSeed, category.categoryName])

  const setLine = (type, key, value) =>
    setLines((current) => ({
      ...current,
      [type]: {
        ...(current[type] || {
          itemName: buildUniformItemName(category.categoryName, type),
          stocks: 0,
          price: '',
          inventoryId: null,
          sku: '',
          previousStocks: 0,
        }),
        [key]: value,
      },
    }))

  const skus = useMemo(() => {
    if (!gender || !size) return {}
    if (isEdit) {
      const fromLines = {}
      types.forEach((type) => {
        if (lines[type]?.sku) fromLines[type] = lines[type].sku
      })
      return fromLines
    }
    const generated = {}
    const pool = [...items]
    types.forEach((type) => {
      const sku = generateUniqueSku(
        { categoryId: category.categoryId, uniformGender: gender, uniformType: type, uniformSize: size },
        categories,
        pool,
      )
      generated[type] = sku
      pool.push({ inventoryId: `pending-${type}`, sku })
    })
    return generated
  }, [gender, size, types, items, categories, category.categoryId, isEdit, lines])

  const ready = Boolean(gender && size) && types.length > 0 && (
    isEdit
      ? types.some((type) => lines[type]?.inventoryId && String(lines[type]?.itemName || '').trim().length >= 2)
      : types.every((type) => skus[type] && lines[type] && String(lines[type]?.itemName || '').trim().length >= 2)
  )

  function submit(event) {
    event.preventDefault()
    if (!ready) return
    const payload = types.map((type) => ({
      inventoryId: lines[type]?.inventoryId || null,
      sku: isEdit ? (lines[type]?.sku || skus[type]) : skus[type],
      itemName: normalizeInventoryText(
        String(lines[type]?.itemName || buildUniformItemName(category.categoryName, type)),
      ).slice(0, 180),
      categoryId: category.categoryId,
      variation: buildUniformVariation({ uniformGender: gender, uniformType: type, uniformSize: size }),
      uniformGender: gender,
      uniformType: type,
      uniformSize: size,
      price: Number(lines[type]?.price || 0),
      stocks: Number(lines[type]?.stocks || 0),
      previousStocks: Number(lines[type]?.previousStocks || 0),
      lowStockThreshold: Number(lowStockThreshold || 0),
    }))
    onSave(payload, { isEdit })
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className={`modal uniform-modal ${isPair ? 'uniform-modal-pair' : 'uniform-modal-single'}`} onSubmit={submit}>
        <div className="modal-head">
          <div>
            <h2>{isEdit ? `Edit ${category.categoryName}` : `Add ${category.categoryName}`}</h2>
            <p>
              {!gender
                ? 'Select a gender to see the types that will be created.'
                : isEdit
                  ? isPair
                    ? `Editing ${types.join(' and ')} for ${gender} · ${size}.`
                    : `Editing ${types[0] || 'item'} for ${gender} · ${size}.`
                  : isPair
                    ? `Creates ${types.join(' and ')} together for the selected gender and size.`
                    : `Creates a new ${types[0] || 'item'}.`}
            </p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <div className="form-grid form-grid-3">
          <label>Gender *
            <select
              required
              value={gender}
              disabled={isEdit}
              onChange={(e) => setGender(e.target.value)}
            >
              <option value="">Select gender</option>
              {genders.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            {isEdit && <small className="field-hint">Gender is locked for an existing set.</small>}
          </label>
          <label>Size *
            <select
              required
              value={size}
              disabled={isEdit}
              onChange={(e) => setSize(e.target.value)}
            >
              <option value="">Select size</option>
              {UNIFORM_SIZES.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            {isEdit && <small className="field-hint">Size is locked for an existing set.</small>}
          </label>
          <label>Low-stock threshold *
            <input required type="number" min="0" value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} />
          </label>
        </div>
        {gender ? (
          <div className={`uniform-lines ${isPair ? '' : 'uniform-lines-single'}`}>
            {types.map((type) => {
              const skuValue = skus[type] || lines[type]?.sku || ''
              const skuPlaceholder = isEdit
                ? 'Missing from set'
                : (gender && size ? 'Generating…' : 'Select gender & size first')
              return (
                <div key={type} className="uniform-line">
                  <div className="uniform-line-head">
                    <strong>{type}</strong>
                  </div>
                  <div className="uniform-line-grid">
                    <label>Item name *
                      <input
                        required
                        minLength={2}
                        maxLength={180}
                        disabled={isEdit && !lines[type]?.inventoryId}
                        value={lines[type]?.itemName ?? ''}
                        onChange={(e) => setLine(type, 'itemName', normalizeInventoryText(e.target.value))}
                        placeholder="enter-item-name"
                      />
                      <small className="field-hint">Lowercase; spaces become hyphens. SKU stays auto-generated.</small>
                    </label>
                    <label>SKU
                      <input
                        readOnly
                        className="readonly-input"
                        value={skuValue}
                        placeholder={skuPlaceholder}
                        tabIndex={-1}
                      />
                      <small className="field-hint">Auto-generated from category, gender, type, and size.</small>
                    </label>
                    <label>Per-piece price (₱) *
                      <input
                        required
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={isEdit && !lines[type]?.inventoryId}
                        value={lines[type]?.price ?? ''}
                        onChange={(e) => setLine(type, 'price', e.target.value)}
                      />
                    </label>
                    <label>{isEdit ? 'Stock *' : 'Initial stock *'}
                      <input
                        required
                        type="number"
                        min="0"
                        disabled={isEdit && !lines[type]?.inventoryId}
                        value={lines[type]?.stocks ?? 0}
                        onChange={(e) => setLine(type, 'stocks', e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="uniform-gender-hint">Choose Male or Female first. For School Uniform, Female uses Blouse and Skirt.</p>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy || !ready}>
            {busy ? 'Saving…' : isEdit ? 'Save set' : isPair ? 'Add set' : 'Add item'}
          </button>
        </div>
      </form>
    </div>
  )
}
