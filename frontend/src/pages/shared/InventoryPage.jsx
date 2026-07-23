import { useMemo, useState } from 'react'
import { ActionsMenu } from '../../components/ActionsMenu'
import { AllocationModal } from '../../components/AllocationModal'
import { EmptyState } from '../../components/EmptyState'
import { Icon } from '../../components/Icon'
import { ItemModal } from '../../components/ItemModal'
import { Pagination } from '../../components/Pagination'
import { StatusBadge } from '../../components/StatusBadge'
import { StockModal } from '../../components/StockModal'
import { UniformItemModal } from '../../components/UniformItemModal'
import { usePagination } from '../../hooks/usePagination'
import {
  generateUniqueSku,
  isLearningKitCategory,
  isUniformCategory,
  resolveItemVariation,
} from '../../constants/uniformOptions'
import { allocateToChannel, deallocateFromChannel } from '../../services/channelAllocationApi'
import {
  batchCreateInventory,
  createInventoryItem,
  createStockMovement,
  updateInventoryItem,
} from '../../services/inventoryApi'
import { formatCurrency, formatDate, normalizeInventoryText } from '../../utils/format'

function CategoryStatus({ row }) {
  if (!row.itemCount) return <span className="muted">No items</span>
  if (!row.out && !row.low && !row.inactive) {
    return <span className="status active"><i />In stock</span>
  }
  return (
    <span className="rollup">
      {row.out > 0 && <span className="rollup-pill red">{row.out} out</span>}
      {row.low > 0 && <span className="rollup-pill amber">{row.low} low</span>}
      {row.inactive > 0 && <span className="rollup-pill">{row.inactive} inactive</span>}
    </span>
  )
}

export default function InventoryPage({ items, categories, allocations = [], canManage = false, onRefresh, onExport }) {
  const [activeCategoryId, setActiveCategoryId] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [editItem, setEditItem] = useState(null)
  const [uniformModal, setUniformModal] = useState(null) // { category, editSeed? }
  const [stock, setStock] = useState(null)
  const [allocation, setAllocation] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const allocatedByItem = useMemo(() => {
    const map = new Map()
    allocations.forEach((row) => map.set(row.inventoryId, row.allocatedQty))
    return map
  }, [allocations])

  // Category-level rollup shown on the main inventory page.
  const summaryRows = useMemo(() => categories.map((category) => {
    const catItems = items.filter((item) => item.categoryId === category.categoryId)
    let totalStocks = 0
    let totalShopee = 0
    let low = 0
    let out = 0
    let inactive = 0
    let lastUpdated = null
    catItems.forEach((item) => {
      totalStocks += item.stocks
      totalShopee += allocatedByItem.get(item.inventoryId) || 0
      if (item.status === 'LOW_STOCK') low += 1
      if (item.status === 'OUT_OF_STOCK') out += 1
      if (item.status === 'INACTIVE') inactive += 1
      if (!lastUpdated || new Date(item.updatedAt) > new Date(lastUpdated)) lastUpdated = item.updatedAt
    })
    return { ...category, itemCount: catItems.length, totalStocks, totalShopee, low, out, inactive, lastUpdated }
  }), [categories, items, allocatedByItem])

  const activeCategory = useMemo(
    () => categories.find((category) => category.categoryId === activeCategoryId) || null,
    [categories, activeCategoryId],
  )

  const detailItems = useMemo(
    () => items.filter((item) => item.categoryId === activeCategoryId),
    [items, activeCategoryId],
  )

  const detailCounts = useMemo(() => ({
    all: detailItems.length,
    low: detailItems.filter((item) => item.status === 'LOW_STOCK').length,
    out: detailItems.filter((item) => item.status === 'OUT_OF_STOCK').length,
    inactive: detailItems.filter((item) => item.status === 'INACTIVE').length,
  }), [detailItems])

  const detailShown = useMemo(() => detailItems.filter((item) => {
    const matchesSearch = !search || `${item.itemName} ${item.sku}`.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = !statusFilter || item.status === statusFilter
    return matchesSearch && matchesStatus
  }), [detailItems, search, statusFilter])

  const summaryPager = usePagination(summaryRows, 15)
  const detailPager = usePagination(detailShown, 15)

  function openCategory(categoryId) {
    setActiveCategoryId(categoryId)
    setSearch('')
    setStatusFilter('')
  }

  function closeCategory() {
    setActiveCategoryId(null)
    setSearch('')
    setStatusFilter('')
  }

  function startAdd() {
    if (isUniformCategory(activeCategoryId, categories)) setUniformModal({ category: activeCategory })
    else setEditItem({ categoryId: activeCategoryId })
  }

  function startEdit(item) {
    if (isUniformCategory(item.categoryId, categories)) {
      const category = categories.find((entry) => entry.categoryId === item.categoryId) || activeCategory
      setUniformModal({ category, editSeed: item })
      return
    }
    setEditItem(item)
  }

  async function saveItem(form) {
    setBusy(true)
    setError('')
    try {
      // SKU is immutable after creation: keep the existing code on edit and
      // only derive a fresh, collision-safe SKU for brand-new items.
      const sku = form.inventoryId ? form.sku : generateUniqueSku(form, categories, items)
      if (!sku) {
        throw new Error(isUniformCategory(form.categoryId, categories)
          ? 'Complete category, gender, type, and size to generate the SKU.'
          : 'Complete item name and category to generate the SKU.')
      }
      const isUniform = isUniformCategory(form.categoryId, categories)
      const isLearningKit = isLearningKitCategory(form.categoryId, categories)
      const body = {
        sku,
        itemName: normalizeInventoryText(form.itemName).slice(0, 180),
        categoryId: form.categoryId,
        variation: resolveItemVariation(form, categories),
        price: form.price,
        lowStockThreshold: form.lowStockThreshold,
        uniformGender: isUniform ? form.uniformGender || null : null,
        uniformType: isUniform ? form.uniformType || null : null,
        uniformSize: isUniform ? form.uniformSize || null : null,
        ...(form.inventoryId ? {} : { stocks: form.stocks }),
        ...(isLearningKit ? { components: form.components || [] } : {}),
      }
      if (form.inventoryId) await updateInventoryItem(form.inventoryId, body)
      else await createInventoryItem(body)
      setEditItem(null)
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function saveUniformSet(payload, { isEdit } = {}) {
    setBusy(true)
    setError('')
    try {
      if (isEdit) {
        for (const row of payload) {
          if (!row.inventoryId) continue
          await updateInventoryItem(row.inventoryId, {
            itemName: row.itemName,
            categoryId: row.categoryId,
            variation: row.variation,
            price: row.price,
            lowStockThreshold: row.lowStockThreshold,
            uniformGender: row.uniformGender,
            uniformType: row.uniformType,
            uniformSize: row.uniformSize,
          })
          if (Number(row.stocks) !== Number(row.previousStocks)) {
            await createStockMovement(row.inventoryId, {
              movementType: 'ADJUSTMENT',
              newStock: Number(row.stocks),
              remarks: 'Updated via uniform set edit',
            })
          }
        }
      } else {
        await batchCreateInventory(payload)
      }
      setUniformModal(null)
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
      const body = kind === 'adjust'
        ? { movementType: 'ADJUSTMENT', newStock: Number(quantity), remarks: remarks || undefined }
        : { movementType: kind === 'add' ? 'STOCK_IN' : 'STOCK_OUT', quantity: Number(quantity), remarks: remarks || undefined }
      await createStockMovement(item.inventoryId, body)
      setStock(null)
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function submitAllocation(item, kind, quantity, remarks) {
    setBusy(true)
    setError('')
    try {
      const body = { inventoryId: item.inventoryId, channel: 'SHOPEE', quantity: Number(quantity), remarks: remarks || undefined }
      if (kind === 'allocate') await allocateToChannel(body)
      else await deallocateFromChannel(body)
      setAllocation(null)
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const modals = (
    <>
      {editItem && (
        <ItemModal
          item={editItem}
          categories={categories}
          items={items}
          busy={busy}
          lockCategory
          onClose={() => setEditItem(null)}
          onSave={saveItem}
        />
      )}
      {uniformModal && (
        <UniformItemModal
          category={uniformModal.category}
          categories={categories}
          items={items}
          editSeed={uniformModal.editSeed || null}
          busy={busy}
          onClose={() => setUniformModal(null)}
          onSave={saveUniformSet}
        />
      )}
      {stock && <StockModal item={stock} busy={busy} close={() => setStock(null)} adjust={adjustStock} />}
      {allocation && (
        <AllocationModal
          item={allocation}
          allocatedQty={allocatedByItem.get(allocation.inventoryId) || 0}
          busy={busy}
          close={() => setAllocation(null)}
          submit={submitAllocation}
        />
      )}
    </>
  )

  // ---- Detail view: raw stocks for a single category ----
  if (activeCategory) {
    return (
      <>
        <div className="page-title inventory-title">
          <div>
            <button type="button" className="back-link" onClick={closeCategory}>← Back to categories</button>
            <h1>{activeCategory.categoryName}</h1>
            <p>Raw stocks for this category.</p>
          </div>
          <div>
            <button type="button" className="secondary" onClick={onExport}>⇩ Export CSV</button>
            <button type="button" className="primary" onClick={startAdd}>＋ Add new item</button>
          </div>
        </div>
        <div className="quick-filters">
          {[
            ['All items', detailCounts.all, ''],
            ['Low stock', detailCounts.low, 'LOW_STOCK'],
            ['Out of stock', detailCounts.out, 'OUT_OF_STOCK'],
            ['Inactive', detailCounts.inactive, 'INACTIVE'],
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
            <span>{detailShown.length} items</span>
          </div>
          <div className="overflow-x-auto rounded-lg table-scroll" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}>
            <table className="inventory-table" style={{ width: '100%', minWidth: '1080px' }}>
              <thead>
                <tr>
                  <th>Item name</th>
                  <th>SKU</th>
                  <th>Variation</th>
                  <th>Stock</th>
                  <th>Shopee</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>Last updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {detailShown.length ? detailPager.pageItems.map((item) => (
                  <tr key={item.inventoryId}>
                    <td>
                      <div className="item-cell">
                        <div className="product-thumb"><Icon name="box" /></div>
                        <strong>{item.itemName}</strong>
                      </div>
                    </td>
                    <td><span className="sku-chip">{item.sku}</span></td>
                    <td className="variation-cell">{item.variation || '—'}</td>
                    <td>
                      <button type="button" className="stock-link" onClick={() => setStock(item)}>
                        <strong className={item.stocks === 0 ? 'zero' : item.stocks <= item.lowStockThreshold ? 'low' : ''}>{item.stocks}</strong>
                        <small>Threshold: {item.lowStockThreshold}</small>
                      </button>
                    </td>
                    <td>
                      {canManage ? (
                        <button type="button" className="stock-link" onClick={() => setAllocation(item)}>
                          <strong>{allocatedByItem.get(item.inventoryId) || 0}</strong>
                          <small>Allocated</small>
                        </button>
                      ) : (
                        <span className="muted">{allocatedByItem.get(item.inventoryId) || 0}</span>
                      )}
                    </td>
                    <td className="metric-cell"><strong>{formatCurrency(item.price)}</strong></td>
                    <td><StatusBadge status={item.status} /></td>
                    <td><span className="muted">{formatDate(item.updatedAt)}</span></td>
                    <td>
                      <ActionsMenu
                        items={[{
                          key: 'edit',
                          label: isUniformCategory(item.categoryId, categories) ? 'Edit set' : 'Edit item',
                          onClick: () => startEdit(item),
                        }]}
                      />
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={9}><EmptyState title="No items in this category yet" message="Add your first item to start tracking stock, pricing, and availability." action={<button type="button" className="primary" onClick={startAdd}>＋ Add new item</button>} /></td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={detailPager.page} pageSize={15} total={detailPager.total} onPageChange={detailPager.setPage} noun="items" />
        </section>
        {modals}
      </>
    )
  }

  // ---- Summary view: one row per category ----
  return (
    <>
      <div className="page-title inventory-title">
        <div><h1>Inventory</h1><p>Stock levels grouped by category. Open a category to manage its items.</p></div>
        <div>
          <button type="button" className="secondary" onClick={onExport}>⇩ Export CSV</button>
        </div>
      </div>
      {error && <div className="page-error">{error}</div>}
      <section className="panel inventory-panel">
        <div className="overflow-x-auto rounded-lg table-scroll" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}>
          <table className="inventory-table" style={{ width: '100%', minWidth: '860px' }}>
            <thead>
              <tr>
                <th>Category</th>
                <th>Total stocks</th>
                <th>Total Shopee</th>
                <th>Status</th>
                <th>Last updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {summaryRows.length ? summaryPager.pageItems.map((row) => (
                <tr key={row.categoryId}>
                  <td>
                    <button type="button" className="category-link" onClick={() => openCategory(row.categoryId)}>
                      <strong>{row.categoryName}</strong>
                      <small>{row.itemCount} {row.itemCount === 1 ? 'item' : 'items'}</small>
                    </button>
                  </td>
                  <td><strong className="metric-cell">{row.totalStocks}</strong></td>
                  <td className="metric-cell">{row.totalShopee}</td>
                  <td><CategoryStatus row={row} /></td>
                  <td><span className="muted">{formatDate(row.lastUpdated)}</span></td>
                  <td>
                    <ActionsMenu items={[{ key: 'view', label: 'View raw stocks', onClick: () => openCategory(row.categoryId) }]} />
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={6}><EmptyState title="No categories yet" message="Create a category first, then add inventory items to it from here." /></td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={summaryPager.page} pageSize={15} total={summaryPager.total} onPageChange={summaryPager.setPage} noun="categories" />
      </section>
      {modals}
    </>
  )
}
