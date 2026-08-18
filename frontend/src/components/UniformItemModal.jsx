import { useEffect, useMemo, useState } from 'react'
import {
  UNIFORM_SET_TYPE,
  buildUniformVariation,
  generateUniqueSku,
  getUniformGendersForCategory,
  getUniformSizesForCategory,
  getUniformTypesForCategory,
  isUniformSetType,
  parseUniformVariation,
} from '../constants/uniformOptions'
import { useSettings } from '../context/SettingsContext'
import { normalizeInventoryText } from '../utils/format'

function buildUniformItemName(categoryName, type) {
  const name = String(categoryName || '').trim()
  const typeLabel = String(type || '').trim()
  if (!typeLabel) return normalizeInventoryText(name).slice(0, 180)
  if (isUniformSetType(typeLabel)) {
    return normalizeInventoryText(`${name} set`).slice(0, 180)
  }
  // Avoid "LCA T-Shirt Shirt" when the category already includes the type word.
  if (name.toLowerCase().includes(typeLabel.toLowerCase())) {
    return normalizeInventoryText(name).slice(0, 180)
  }
  return normalizeInventoryText(`${name} ${typeLabel}`).slice(0, 180)
}

function emptyLine(type, categoryName = '') {
  return {
    itemName: buildUniformItemName(categoryName, type),
    stocks: 0,
    price: '',
    internalSellingPrice: '',
    remarks: '',
    inventoryId: null,
    sku: '',
    previousStocks: 0,
  }
}

function emptyLines(types, categoryName = '') {
  return types.reduce((acc, type) => ({
    ...acc,
    [type]: emptyLine(type, categoryName),
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

/**
 * Piece mates only (same category + gender + size). Excludes full-set SKUs
 * so per-piece and set inventory stay independent.
 */
export function findUniformSetMates(seedItem, items = []) {
  const fields = resolveUniformFields(seedItem)
  if (!seedItem?.categoryId || !fields.uniformGender || !fields.uniformSize) {
    return [seedItem].filter(Boolean)
  }
  if (isUniformSetType(fields.uniformType)) {
    return [seedItem].filter(Boolean)
  }
  return items.filter((entry) => {
    if (entry.categoryId !== seedItem.categoryId) return false
    const other = resolveUniformFields(entry)
    if (isUniformSetType(other.uniformType)) return false
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
      internalSellingPrice: item.internalSellingPrice ?? '',
      remarks: item.remarks || '',
      inventoryId: item.inventoryId,
      sku: item.sku || '',
    }
  })
  return next
}

function resolveSellMode(editSeed) {
  if (!editSeed) return 'PIECE'
  const fields = resolveUniformFields(editSeed)
  return isUniformSetType(fields.uniformType) ? 'SET' : 'PIECE'
}

// Creates or edits School / PE uniform inventory.
// Sell mode toggle: Per piece (Polo+Short / Shirt+Pants) or full Set (own stock).
export function UniformItemModal({
  category,
  categories,
  items = [],
  editSeed = null,
  busy,
  onClose,
  onSave,
}) {
  const settings = useSettings()
  const defaultThreshold = settings.defaultLowStockThreshold ?? 20
  const isEdit = Boolean(editSeed?.inventoryId)
  const seedFields = resolveUniformFields(editSeed)
  const initialMode = resolveSellMode(editSeed)

  const [sellMode, setSellMode] = useState(initialMode)
  const [gender, setGender] = useState(isEdit ? seedFields.uniformGender || '' : '')
  const [size, setSize] = useState(isEdit ? seedFields.uniformSize || '' : '')
  const [lowStockThreshold, setLowStockThreshold] = useState(
    isEdit ? (editSeed.lowStockThreshold ?? defaultThreshold) : defaultThreshold,
  )
  const [lines, setLines] = useState({})
  const [hydrated, setHydrated] = useState(false)

  const isSetMode = sellMode === 'SET'
  const pieceTypes = useMemo(
    () => getUniformTypesForCategory(category.categoryId, categories, gender),
    [category.categoryId, categories, gender],
  )
  const types = useMemo(
    () => (isSetMode ? [UNIFORM_SET_TYPE] : pieceTypes),
    [isSetMode, pieceTypes],
  )
  const typesKey = types.join('|')
  const genders = useMemo(
    () => getUniformGendersForCategory(category.categoryId, categories),
    [category.categoryId, categories],
  )
  const sizes = useMemo(
    () => getUniformSizesForCategory(category.categoryId, categories, {
      uniformSizes: settings.uniformSizes,
      shirtSizes: settings.shirtSizes,
    }),
    [category.categoryId, categories, settings.uniformSizes, settings.shirtSizes],
  )
  const isPair = !isSetMode && types.length > 1

  useEffect(() => {
    if (isEdit) return
    if (genders.length === 1 && gender !== genders[0]) {
      setGender(genders[0])
    }
  }, [genders, gender, isEdit])

  const setMates = useMemo(
    () => (isEdit ? findUniformSetMates(editSeed, items) : []),
    [isEdit, editSeed, items],
  )

  // Create: rebuild empty lines only when sell mode / piece types change — not on every keystroke.
  // Edit: hydrate once from existing rows.
  useEffect(() => {
    if (isEdit) {
      if (!hydrated && types.length) {
        const seed = setMates[0] || editSeed
        if (isSetMode) {
          setLines({
            [UNIFORM_SET_TYPE]: {
              itemName: normalizeInventoryText(
                seed?.itemName || buildUniformItemName(category.categoryName, UNIFORM_SET_TYPE),
              ),
              stocks: seed?.stocks ?? 0,
              previousStocks: seed?.stocks ?? 0,
              price: seed?.price ?? '',
              internalSellingPrice: seed?.internalSellingPrice ?? '',
              remarks: seed?.remarks || '',
              inventoryId: seed?.inventoryId || null,
              sku: seed?.sku || '',
            },
          })
        } else {
          setLines(linesFromItems(types, setMates, category.categoryName))
        }
        setLowStockThreshold(seed?.lowStockThreshold ?? defaultThreshold)
        setHydrated(true)
      }
      return
    }
    setLines(emptyLines(types, category.categoryName))
    // typesKey avoids resetting when `types` is a new array with the same contents.
  }, [typesKey, isEdit, hydrated, setMates, editSeed, category.categoryName, isSetMode, types])

  function onSellModeChange(mode) {
    if (isEdit || mode === sellMode) return
    setSellMode(mode)
    setHydrated(false)
    setLines({})
  }

  const setLine = (type, key, value) =>
    setLines((current) => ({
      ...current,
      [type]: {
        ...(current[type] || emptyLine(type, category.categoryName)),
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
        { trimEdges: true },
      ).slice(0, 180),
      categoryId: category.categoryId,
      variation: buildUniformVariation({ uniformGender: gender, uniformType: type, uniformSize: size }),
      uniformGender: gender,
      uniformType: type,
      uniformSize: size,
      price: Number(lines[type]?.price || 0),
      internalSellingPrice: Number(lines[type]?.internalSellingPrice || 0),
      stocks: Number(lines[type]?.stocks || 0),
      previousStocks: Number(lines[type]?.previousStocks || 0),
      remarks: String(lines[type]?.remarks || '').trim().slice(0, 500) || null,
      lowStockThreshold: Number(lowStockThreshold || 0),
    }))
    onSave(payload, { isEdit })
  }

  const priceLabel = isSetMode ? 'Set selling price (₱) *' : 'Per-piece selling price (₱) *'
  const modeHint = (() => {
    if (!gender) {
      return isSetMode
        ? 'Select gender and size for this full uniform set (own stock, not based on pieces).'
        : 'Select a gender to see the piece types that will be created.'
    }
    if (isEdit) {
      return isSetMode
        ? `Editing set for ${gender} · ${size}. Stock is independent of per-piece items.`
        : isPair
          ? `Editing ${types.join(' and ')} for ${gender} · ${size}.`
          : `Editing ${types[0] || 'item'} for ${gender} · ${size}.`
    }
    if (isSetMode) {
      return `Creates one ${category.categoryName} set SKU for ${gender} · ${size} with its own stock.`
    }
    return isPair
      ? `Creates ${types.join(' and ')} together for the selected gender and size.`
      : `Creates a new ${types[0] || 'item'}.`
  })()

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className={`modal uniform-modal ${isPair ? 'uniform-modal-pair' : 'uniform-modal-single'}`} onSubmit={submit}>
        <div className="modal-head">
          <div>
            <h2>{isEdit ? `Edit ${category.categoryName}` : `Add ${category.categoryName}`}</h2>
            <p>{modeHint}</p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>

        <div className="kit-raw-mode-tabs" role="tablist" aria-label="Uniform sell mode">
          <button
            type="button"
            role="tab"
            aria-selected={!isSetMode}
            className={!isSetMode ? 'selected' : undefined}
            disabled={isEdit}
            onClick={() => onSellModeChange('PIECE')}
          >
            Per piece
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isSetMode}
            className={isSetMode ? 'selected' : undefined}
            disabled={isEdit}
            onClick={() => onSellModeChange('SET')}
          >
            Set
          </button>
        </div>
        {isEdit && (
          <p className="field-hint uniform-mode-lock-hint">
            Sell mode is locked for an existing item ({isSetMode ? 'Set' : 'Per piece'}).
          </p>
        )}

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
            {isEdit && <small className="field-hint">Gender is locked for an existing item.</small>}
          </label>
          <label>Size *
            <select
              required
              value={size}
              disabled={isEdit}
              onChange={(e) => setSize(e.target.value)}
            >
              <option value="">Select size</option>
              {sizes.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            {isEdit && <small className="field-hint">Size is locked for an existing item.</small>}
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
                ? 'Missing SKU'
                : (gender && size ? 'Generating…' : 'Select gender & size first')
              return (
                <div key={type} className="uniform-line">
                  <div className="uniform-line-head">
                    <strong>{isSetMode ? 'Full set' : type}</strong>
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
                        placeholder={isSetMode ? 'school-uniform-set' : 'enter-item-name'}
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
                      <small className="field-hint">
                        {isSetMode
                          ? 'Auto-generated with SET type code (own stock SKU).'
                          : 'Auto-generated from category, gender, type, and size.'}
                      </small>
                    </label>
                    <label>{priceLabel}
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
                    <label>Internal selling price (₱) *
                      <input
                        required
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={isEdit && !lines[type]?.inventoryId}
                        value={lines[type]?.internalSellingPrice ?? ''}
                        onChange={(e) => setLine(type, 'internalSellingPrice', e.target.value)}
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
                      {isSetMode && (
                        <small className="field-hint">Independent of per-piece stock.</small>
                      )}
                    </label>
                    <label className="uniform-line-remarks">Remarks
                      <textarea
                        rows={2}
                        maxLength={500}
                        disabled={isEdit && !lines[type]?.inventoryId}
                        value={lines[type]?.remarks ?? ''}
                        onChange={(e) => setLine(type, 'remarks', e.target.value)}
                        placeholder="Optional description"
                      />
                    </label>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="uniform-gender-hint">
            {genders.length === 1
              ? `PE Uniform uses ${genders[0]} only. Select a size to continue.`
              : 'Choose Male or Female first. For School Uniform, Female per-piece uses Blouse and Skirt.'}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy || !ready}>
            {busy
              ? 'Saving…'
              : isEdit
                ? (isSetMode ? 'Save set' : 'Save pieces')
                : (isSetMode ? 'Add set' : isPair ? 'Add pieces' : 'Add item')}
          </button>
        </div>
      </form>
    </div>
  )
}
