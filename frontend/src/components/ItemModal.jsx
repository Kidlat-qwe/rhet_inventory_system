import { useEffect, useState } from 'react'
import {
  UNIFORM_GENDERS,
  UNIFORM_SIZES,
  getUniformTypesForCategory,
  isUniformCategory,
  parseUniformVariation,
  generateSku,
  canGenerateSku,
} from '../constants/uniformOptions'

export function ItemModal({ item, categories, busy, onClose, onSave }) {
  const initialCategoryId = item.categoryId || categories[0]?.categoryId || ''
  const initialUniform = isUniformCategory(initialCategoryId, categories)
    ? parseUniformVariation(item.variation)
    : { uniformGender: '', uniformType: '', uniformSize: '' }

  const [form, setForm] = useState({
    inventoryId: item.inventoryId,
    sku: item.sku || '',
    itemName: item.itemName || '',
    categoryId: initialCategoryId,
    variation: initialUniform.uniformGender ? '' : (item.variation || ''),
    uniformGender: initialUniform.uniformGender,
    uniformType: initialUniform.uniformType,
    uniformSize: initialUniform.uniformSize,
    stocks: item.stocks ?? 0,
    lowStockThreshold: item.lowStockThreshold ?? 10,
    price: item.price ?? 0,
  })

  const isUniform = isUniformCategory(form.categoryId, categories)
  const uniformTypes = getUniformTypesForCategory(form.categoryId, categories)
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  useEffect(() => {
    const nextSku = generateSku(form, categories)
    setForm((current) => (current.sku === nextSku ? current : { ...current, sku: nextSku }))
  }, [form.categoryId, form.itemName, form.uniformGender, form.uniformType, form.uniformSize, categories])

  function setCategoryId(value) {
    setForm((current) => {
      const nextUniform = isUniformCategory(value, categories)
      const currentUniform = isUniformCategory(current.categoryId, categories)
      const nextTypes = getUniformTypesForCategory(value, categories)
      const keepType = nextTypes.includes(current.uniformType) ? current.uniformType : ''

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

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={(e) => { e.preventDefault(); onSave(form) }}>
        <div className="modal-head">
          <div><h2>{item.inventoryId ? 'Edit merchandise' : 'Add new merchandise'}</h2><p>Enter the item and stock information below.</p></div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <div className="form-grid">
          <label>Item name *<input required minLength="2" value={form.itemName} onChange={(e) => set('itemName', e.target.value)} placeholder="e.g. Classic White Polo" /></label>
          <label>Category *
            <select required value={form.categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.length ? categories.map((category) => <option key={category.categoryId} value={category.categoryId}>{category.categoryName}</option>) : <option value="">No categories available</option>}
            </select>
          </label>
          {isUniform ? (
            <>
              <label>Gender *
                <select required value={form.uniformGender} onChange={(e) => set('uniformGender', e.target.value)}>
                  <option value="">Select gender</option>
                  {UNIFORM_GENDERS.map((option) => <option key={option} value={option}>{option}</option>)}
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
                {form.uniformType === 'Full Set' && (
                  <small className="field-hint">Shirt and pants use the same size.</small>
                )}
              </label>
            </>
          ) : (
            <label>Variation<input value={form.variation} onChange={(e) => set('variation', e.target.value)} placeholder="Size, color, grade..." /></label>
          )}
          <label>SKU *
            <input
              required
              readOnly
              className="readonly-input"
              value={form.sku}
              placeholder={isUniform ? 'Auto-generated from category, gender, type, and size' : 'Auto-generated from category and item name'}
            />
          </label>
          <label>Selling price (₱) *<input required type="number" min="0" step="0.01" value={form.price} onChange={(e) => set('price', e.target.value)} /></label>
          <label>Low-stock threshold *<input required type="number" min="0" value={form.lowStockThreshold} onChange={(e) => set('lowStockThreshold', e.target.value)} /></label>
          {!item.inventoryId && <label>Initial stock *<input required type="number" min="0" value={form.stocks} onChange={(e) => set('stocks', e.target.value)} /></label>}
        </div>
        <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy || !categories.length || !canGenerateSku(form, categories)}>{busy ? 'Saving…' : item.inventoryId ? 'Save changes' : 'Add merchandise'}</button></div>
      </form>
    </div>
  )
}
