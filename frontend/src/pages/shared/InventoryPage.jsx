import { useMemo, useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { Icon } from '../../components/Icon'
import { ItemModal } from '../../components/ItemModal'
import { StatusBadge } from '../../components/StatusBadge'
import { StockModal } from '../../components/StockModal'
import {
  generateSku,
  isUniformCategory,
  resolveItemVariation,
} from '../../constants/uniformOptions'
import {
  createInventoryItem,
  createStockMovement,
  updateInventoryItem,
} from '../../services/inventoryApi'
import { formatCurrency, formatDate } from '../../utils/format'

export default function InventoryPage({ items, categories, onRefresh, onExport }) {
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modal, setModal] = useState(null)
  const [stock, setStock] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const counts = useMemo(() => ({
    all: items.length,
    low: items.filter((item) => item.status === 'LOW_STOCK').length,
    out: items.filter((item) => item.status === 'OUT_OF_STOCK').length,
    inactive: items.filter((item) => item.status === 'INACTIVE').length,
  }), [items])

  const shown = useMemo(() => items.filter((item) => {
    const matchesSearch = !search || `${item.itemName} ${item.sku}`.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = !categoryId || item.categoryId === categoryId
    const matchesStatus = !statusFilter || item.status === statusFilter
    return matchesSearch && matchesCategory && matchesStatus
  }), [items, search, categoryId, statusFilter])

  async function saveItem(form) {
    setBusy(true)
    setError('')
    try {
      const sku = generateSku(form, categories)
      if (!sku) {
        throw new Error(isUniformCategory(form.categoryId, categories)
          ? 'Complete category, gender, type, and size to generate the SKU.'
          : 'Complete item name and category to generate the SKU.')
      }
      const body = {
        sku,
        itemName: form.itemName,
        categoryId: form.categoryId,
        variation: resolveItemVariation(form, categories),
        price: form.price,
        lowStockThreshold: form.lowStockThreshold,
        ...(form.inventoryId ? {} : { stocks: form.stocks }),
      }
      if (form.inventoryId) await updateInventoryItem(form.inventoryId, body)
      else await createInventoryItem(body)
      setModal(null)
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function adjustStock(item, kind, quantity, remarks) {
    setBusy(true)
    setError('')
    try {
      await createStockMovement(item.inventoryId, {
        movementType: kind === 'add' ? 'STOCK_IN' : 'STOCK_OUT',
        quantity: Number(quantity),
        remarks: remarks || undefined,
      })
      setStock(null)
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="page-title inventory-title">
        <div><h1>Inventory</h1><p>Manage merchandise items, pricing, and stock levels.</p></div>
        <div>
          <button type="button" className="secondary" onClick={onExport}>⇩ Export CSV</button>
          <button type="button" className="primary" onClick={() => setModal({})}>＋ Add new item</button>
        </div>
      </div>
      <div className="quick-filters">
        {[
          ['All items', counts.all, ''],
          ['Low stock', counts.low, 'LOW_STOCK'],
          ['Out of stock', counts.out, 'OUT_OF_STOCK'],
          ['Inactive', counts.inactive, 'INACTIVE'],
        ].map(([label, count, status], index) => (
          <button key={label} type="button" className={statusFilter === status ? 'selected' : ''} onClick={() => setStatusFilter(status)}>
            <span className={index === 1 ? 'amber' : index === 2 ? 'red' : ''}>{count}</span>{label}
          </button>
        ))}
      </div>
      {error && <div className="page-error">{error}</div>}
      <section className="panel inventory-panel">
        <div className="toolbar">
          <label className="search">⌕<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by SKU or item name..." /></label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((category) => <option key={category.categoryId} value={category.categoryId}>{category.categoryName}</option>)}
          </select>
          <span>{shown.length} items</span>
        </div>
        <div className="overflow-x-auto rounded-lg table-scroll" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}>
          <table className="inventory-table" style={{ width: '100%', minWidth: '980px' }}>
            <thead>
              <tr>
                <th>Item details</th>
                <th>Category</th>
                <th>Variation</th>
                <th>Stock</th>
                <th>Price</th>
                <th>Status</th>
                <th>Last updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.length ? shown.map((item) => (
                <tr key={item.inventoryId}>
                  <td>
                    <div className="item-cell">
                      <div className="product-thumb"><Icon name="box" /></div>
                      <div><strong>{item.itemName}</strong><small>{item.sku}</small></div>
                    </div>
                  </td>
                  <td><span className="category-chip">{item.categoryName}</span></td>
                  <td>{item.variation || '—'}</td>
                  <td>
                    <button type="button" className="stock-link" onClick={() => setStock(item)}>
                      <strong className={item.stocks === 0 ? 'zero' : item.stocks <= item.lowStockThreshold ? 'low' : ''}>{item.stocks}</strong>
                      <small>Threshold: {item.lowStockThreshold}</small>
                    </button>
                  </td>
                  <td><strong>{formatCurrency(item.price)}</strong></td>
                  <td><StatusBadge status={item.status} /></td>
                  <td><span className="muted">{formatDate(item.updatedAt)}</span></td>
                  <td><button type="button" className="dots" onClick={() => setModal(item)}>•••</button></td>
                </tr>
              )) : (
                <tr><td colSpan={8}><EmptyState title="No inventory items yet" message="Add your first merchandise item to start tracking stock, pricing, and availability." action={<button type="button" className="primary" onClick={() => setModal({})}>＋ Add new item</button>} /></td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pagination"><span>Showing {shown.length ? `1 to ${shown.length}` : '0'} of {shown.length} items</span></div>
      </section>
      {modal && <ItemModal item={modal} categories={categories} busy={busy} onClose={() => setModal(null)} onSave={saveItem} />}
      {stock && <StockModal item={stock} busy={busy} close={() => setStock(null)} adjust={adjustStock} />}
    </>
  )
}
