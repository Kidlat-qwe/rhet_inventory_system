import { useMemo, useState } from 'react'
import { ActionsMenu } from '../../components/ActionsMenu'
import { DeleteInventoryModal } from '../../components/DeleteInventoryModal'
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
  isLcaShirtCategory,
  isLearningKitCategory,
  isUniformCategory,
  resolveItemVariation,
} from '../../constants/uniformOptions'
import {
  batchCreateInventory,
  createInventoryItem,
  createStockMovement,
  deleteInventoryItem,
  updateInventoryItem,
} from '../../services/inventoryApi'
import { formatCurrency, formatDate, normalizeInventoryText, truncateText } from '../../utils/format'

/** Prefer virtual kit availability when deciding stock health badges. */
function effectiveItemStatus(item) {
  if (item?.stockMode === 'VIRTUAL_BUNDLE') {
    if (String(item.lifecycleStatus || '').toUpperCase() === 'INACTIVE') return 'INACTIVE'
    const qty = Number(item.stocks) || 0
    const threshold = Number(item.lowStockThreshold) || 0
    if (qty <= 0) return 'OUT_OF_STOCK'
    if (qty <= threshold) return 'LOW_STOCK'
    return 'ACTIVE'
  }
  return item?.status
}

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

export default function InventoryPage({ items, categories, canManage = false, onRefresh }) {
  const [activeCategoryId, setActiveCategoryId] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [editItem, setEditItem] = useState(null)
  const [uniformModal, setUniformModal] = useState(null) // { category, editSeed? }
  const [stock, setStock] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Category-level rollup shown on the main inventory page.
  const summaryRows = useMemo(() => categories.map((category) => {
    const catItems = items.filter((item) => item.categoryId === category.categoryId)
    let totalStocks = 0
    let low = 0
    let out = 0
    let inactive = 0
    let lastUpdated = null
    catItems.forEach((item) => {
      const status = effectiveItemStatus(item)
      totalStocks += item.stocks
      if (status === 'LOW_STOCK') low += 1
      if (status === 'OUT_OF_STOCK') out += 1
      if (status === 'INACTIVE') inactive += 1
      if (!lastUpdated || new Date(item.updatedAt) > new Date(lastUpdated)) lastUpdated = item.updatedAt
    })
    return { ...category, itemCount: catItems.length, totalStocks, low, out, inactive, lastUpdated }
  }), [categories, items])

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
    low: detailItems.filter((item) => effectiveItemStatus(item) === 'LOW_STOCK').length,
    out: detailItems.filter((item) => effectiveItemStatus(item) === 'OUT_OF_STOCK').length,
    inactive: detailItems.filter((item) => effectiveItemStatus(item) === 'INACTIVE').length,
  }), [detailItems])

  const detailShown = useMemo(() => detailItems.filter((item) => {
    const matchesSearch = !search || `${item.itemName} ${item.sku}`.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = !statusFilter || effectiveItemStatus(item) === statusFilter
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
    // LCA T-Shirt uses the single-item form so Logo (Logo 1 / Logo 2) is a visible field.
    // School Uniform / PE Uniform still use the paired set modal.
    if (isUniformCategory(activeCategoryId, categories) && !isLcaShirtCategory(activeCategoryId, categories)) {
      setUniformModal({ category: activeCategory })
    } else {
      setEditItem({ categoryId: activeCategoryId })
    }
  }

  function startEdit(item) {
    if (isUniformCategory(item.categoryId, categories) && !isLcaShirtCategory(item.categoryId, categories)) {
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
      const isUniform = isUniformCategory(form.categoryId, categories)
      const isLearningKit = isLearningKitCategory(form.categoryId, categories)
      // Uniform SKUs stay locked after create. Non-uniform (Others, etc.) regenerate
      // from category + item name on edit so renaming the item updates the SKU.
      const sku = (form.inventoryId && isUniform)
        ? form.sku
        : (generateUniqueSku(form, categories, items) || form.sku)
      if (!sku) {
        throw new Error(isUniform
          ? 'Complete category, gender, type, and size to generate the SKU.'
          : 'Complete item name and category to generate the SKU.')
      }
      const body = {
        sku,
        itemName: normalizeInventoryText(form.itemName).slice(0, 180),
        categoryId: form.categoryId,
        variation: resolveItemVariation(form, categories),
        price: form.price,
        internalSellingPrice: form.internalSellingPrice,
        lowStockThreshold: form.lowStockThreshold,
        uniformGender: isUniform ? form.uniformGender || null : null,
        uniformType: isUniform ? form.uniformType || null : null,
        uniformSize: isUniform ? form.uniformSize || null : null,
        remarks: String(form.remarks || '').trim().slice(0, 500) || null,
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
            internalSellingPrice: row.internalSellingPrice,
            lowStockThreshold: row.lowStockThreshold,
            uniformGender: row.uniformGender,
            uniformType: row.uniformType,
            uniformSize: row.uniformSize,
            remarks: row.remarks || null,
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

  async function confirmDeleteItem(item) {
    if (!canManage || !item?.inventoryId) return
    setBusy(true)
    setError('')
    try {
      await deleteInventoryItem(item.inventoryId, item.itemName)
      setDeleteTarget(null)
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
      {canManage && deleteTarget && (
        <DeleteInventoryModal
          item={deleteTarget}
          busy={busy}
          onClose={() => !busy && setDeleteTarget(null)}
          onConfirm={confirmDeleteItem}
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
            <table className="inventory-table" style={{ width: '100%', minWidth: '1180px' }}>
              <thead>
                <tr>
                  <th>Item name</th>
                  <th>SKU</th>
                  <th>Variation</th>
                  <th>Remarks</th>
                  <th>Stock</th>
                  <th>Selling price</th>
                  <th>Internal selling price</th>
                  <th>Status</th>
                  <th>Last updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {detailShown.length ? detailPager.pageItems.map((item) => {
                  const isVirtualKit = item.stockMode === 'VIRTUAL_BUNDLE' || isLearningKitCategory(item.categoryId, categories)
                  const status = effectiveItemStatus(item)
                  const remarksText = String(item.remarks || '').trim()
                  return (
                  <tr key={item.inventoryId}>
                    <td>
                      <div className="item-cell">
                        <div className="product-thumb"><Icon name="box" /></div>
                        <div>
                          <strong>{item.itemName}</strong>
                          {isVirtualKit && <small className="muted">Learning Kit · available kits from BOM</small>}
                        </div>
                      </div>
                    </td>
                    <td><span className="sku-chip">{item.sku}</span></td>
                    <td className="variation-cell">{item.variation || '—'}</td>
                    <td className="remarks-cell">
                      {remarksText ? (
                        <span title={remarksText}>{truncateText(remarksText, 48)}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="stock-link"
                        onClick={() => {
                          if (isVirtualKit) {
                            setError('Learning Kit stock is computed from included category stocks (BOM). Restock those raw items, or edit the kit BOM — do not adjust kit stock directly.')
                            return
                          }
                          setStock(item)
                        }}
                        title={isVirtualKit ? 'Available kits = limited by included category stocks' : 'Adjust stock'}
                      >
                        <strong className={item.stocks === 0 ? 'zero' : item.stocks <= item.lowStockThreshold ? 'low' : ''}>{item.stocks}</strong>
                        <small>
                          {isVirtualKit ? 'Available kits (from BOM)' : `Threshold: ${item.lowStockThreshold}`}
                        </small>
                      </button>
                    </td>
                    <td className="metric-cell"><strong>{formatCurrency(item.price)}</strong></td>
                    <td className="metric-cell"><strong>{formatCurrency(item.internalSellingPrice)}</strong></td>
                    <td>
                      <StatusBadge
                        status={status}
                        title={isVirtualKit
                          ? `Based on available kits (${item.stocks}). Learning Kit stock is computed from BOM categories.`
                          : undefined}
                      />
                    </td>
                    <td><span className="muted">{formatDate(item.updatedAt)}</span></td>
                    <td>
                      <ActionsMenu
                        label={`Actions for ${item.itemName}`}
                        disabled={busy}
                        items={[
                          {
                            key: 'edit',
                            label: isUniformCategory(item.categoryId, categories)
                              && !isLcaShirtCategory(item.categoryId, categories)
                              ? 'Edit set'
                              : 'Edit item',
                            onClick: () => startEdit(item),
                          },
                          ...(canManage
                            ? [{
                              key: 'delete',
                              label: 'Delete item',
                              danger: true,
                              onClick: () => {
                                setError('')
                                setDeleteTarget(item)
                              },
                            }]
                            : []),
                        ]}
                      />
                    </td>
                  </tr>
                  )
                }) : (
                  <tr><td colSpan={10}><EmptyState title="No items in this category yet" message="Add your first item to start tracking stock, pricing, and availability." action={<button type="button" className="primary" onClick={startAdd}>＋ Add new item</button>} /></td></tr>
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
      </div>
      {error && <div className="page-error">{error}</div>}
      <section className="panel inventory-panel">
        <div className="overflow-x-auto rounded-lg table-scroll" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}>
          <table className="inventory-table" style={{ width: '100%', minWidth: '760px' }}>
            <thead>
              <tr>
                <th>Category</th>
                <th>Total stocks</th>
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
                  <td><CategoryStatus row={row} /></td>
                  <td><span className="muted">{formatDate(row.lastUpdated)}</span></td>
                  <td>
                    <ActionsMenu items={[{ key: 'view', label: 'View raw stocks', onClick: () => openCategory(row.categoryId) }]} />
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={5}><EmptyState title="No categories yet" message="Create a category first, then add inventory items to it from here." /></td></tr>
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
