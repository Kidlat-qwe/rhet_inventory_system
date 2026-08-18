import { useEffect, useMemo, useState } from 'react'
import { ActionsMenu } from '../../components/ActionsMenu'
import { TableHeadSelect } from '../../components/TableHeadSelect'
import { DeleteInventoryModal } from '../../components/DeleteInventoryModal'
import { EmptyState } from '../../components/EmptyState'
import { Icon } from '../../components/Icon'
import { ItemModal } from '../../components/ItemModal'
import { Pagination } from '../../components/Pagination'
import { StatusBadge } from '../../components/StatusBadge'
import { StockModal } from '../../components/StockModal'
import { ToolKitRawItemModal } from '../../components/ToolKitRawItemModal'
import { UniformItemModal } from '../../components/UniformItemModal'
import { usePagination } from '../../hooks/usePagination'
import {
  INVENTORY_CATEGORY_TYPE_FILTER_OPTIONS,
  UNIFORM_SET_TYPE,
  categoryTypeOf,
  generateUniqueSku,
  getUniformGendersForCategory,
  getUniformSizesForCategory,
  getUniformTypesForCategory,
  isLcaShirtCategory,
  isLearningKitCategory,
  isToolKitCategory,
  isUniformCategory,
  isUniformSetType,
  isVirtualKitCategory,
  parseUniformVariation,
  resolveItemVariation,
} from '../../constants/uniformOptions'
import { useSettings } from '../../context/SettingsContext'
import {
  batchCreateInventory,
  createInventoryItem,
  createStockMovement,
  createToolKitChildItem,
  deleteInventoryItem,
  removeToolKitChildItem,
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

function resolveItemUniformFields(item) {
  if (item?.uniformGender || item?.uniformType || item?.uniformSize) {
    return {
      uniformGender: item.uniformGender || '',
      uniformType: item.uniformType || '',
      uniformSize: item.uniformSize || '',
    }
  }
  return parseUniformVariation(item?.variation)
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

export default function InventoryPage({
  items,
  categories,
  canManage = false,
  onRefresh,
  initialCategoryId = null,
  onInitialCategoryConsumed,
}) {
  const settings = useSettings()
  const defaultThreshold = settings.defaultLowStockThreshold ?? 20
  const [activeCategoryId, setActiveCategoryId] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [uniformGenderFilter, setUniformGenderFilter] = useState('')
  const [uniformTypeFilter, setUniformTypeFilter] = useState('')
  const [uniformSizeFilter, setUniformSizeFilter] = useState('')
  const [editItem, setEditItem] = useState(null)
  const [uniformModal, setUniformModal] = useState(null) // { category, editSeed? }
  const [stock, setStock] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [activeToolKitId, setActiveToolKitId] = useState(null)
  const [showAddRawModal, setShowAddRawModal] = useState(false)
  const [rawError, setRawError] = useState('')
  const [expandedLearningKitIds, setExpandedLearningKitIds] = useState(() => new Set())
  const [categoryTypeFilter, setCategoryTypeFilter] = useState(() => {
    try {
      const saved = sessionStorage.getItem('inventoryCategoryTypeFilter')
      if (saved === 'SUPPLIES' || saved === 'MERCHANDISE' || saved === 'ALL') return saved
    } catch {
      /* ignore */
    }
    return 'ALL'
  })

  function applyCategoryTypeFilter(value) {
    const next = value === 'SUPPLIES' || value === 'MERCHANDISE' ? value : 'ALL'
    setCategoryTypeFilter(next)
    try {
      sessionStorage.setItem('inventoryCategoryTypeFilter', next)
    } catch {
      /* ignore quota / private mode */
    }
  }

  useEffect(() => {
    if (!initialCategoryId) return
    const exists = categories.some((category) => category.categoryId === initialCategoryId)
    if (!exists) {
      onInitialCategoryConsumed?.()
      return
    }
    setActiveCategoryId(initialCategoryId)
    setActiveToolKitId(null)
    setShowAddRawModal(false)
    setSearch('')
    setStatusFilter('')
    setUniformGenderFilter('')
    setUniformTypeFilter('')
    setUniformSizeFilter('')
    onInitialCategoryConsumed?.()
  }, [initialCategoryId, categories, onInitialCategoryConsumed])

  // Category-level rollup shown on the main inventory page.
  const summaryRows = useMemo(() => categories
    .filter((category) => (
      categoryTypeFilter === 'ALL' || categoryTypeOf(category) === categoryTypeFilter
    ))
    .map((category) => {
    const catItems = items.filter((item) => (
      item.categoryId === category.categoryId && item.kitRole !== 'RAW_COMPONENT'
    ))
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
  }), [categories, items, categoryTypeFilter])

  const activeCategory = useMemo(
    () => categories.find((category) => category.categoryId === activeCategoryId) || null,
    [categories, activeCategoryId],
  )

  const detailItems = useMemo(
    () => items.filter((item) => (
      item.categoryId === activeCategoryId && item.kitRole !== 'RAW_COMPONENT'
    )),
    [items, activeCategoryId],
  )

  const isUniformDetail = Boolean(
    activeCategoryId && isUniformCategory(activeCategoryId, categories),
  )

  const uniformFilterOptions = useMemo(() => {
    if (!isUniformDetail || !activeCategoryId) {
      return { genders: [], types: [], sizes: [] }
    }

    const genders = new Set(getUniformGendersForCategory(activeCategoryId, categories))
    const sizes = new Set(getUniformSizesForCategory(activeCategoryId, categories, {
      uniformSizes: settings.uniformSizes,
      shirtSizes: settings.shirtSizes,
    }))
    const types = new Set()

    // Known piece types for all genders in this category.
    getUniformGendersForCategory(activeCategoryId, categories).forEach((gender) => {
      getUniformTypesForCategory(activeCategoryId, categories, gender).forEach((type) => types.add(type))
    })
    if (!isLcaShirtCategory(activeCategoryId, categories)) {
      types.add(UNIFORM_SET_TYPE)
    }

    detailItems.forEach((item) => {
      const fields = resolveItemUniformFields(item)
      if (fields.uniformGender) genders.add(fields.uniformGender)
      if (fields.uniformType) types.add(fields.uniformType)
      if (fields.uniformSize) sizes.add(fields.uniformSize)
    })

    const typeList = [...types].sort((a, b) => {
      if (isUniformSetType(a) && !isUniformSetType(b)) return 1
      if (!isUniformSetType(a) && isUniformSetType(b)) return -1
      return a.localeCompare(b)
    })

    return {
      genders: [...genders],
      types: typeList,
      sizes: [...sizes],
    }
  }, [isUniformDetail, activeCategoryId, categories, detailItems, settings.uniformSizes, settings.shirtSizes])

  const detailCounts = useMemo(() => ({
    all: detailItems.length,
    low: detailItems.filter((item) => effectiveItemStatus(item) === 'LOW_STOCK').length,
    out: detailItems.filter((item) => effectiveItemStatus(item) === 'OUT_OF_STOCK').length,
    inactive: detailItems.filter((item) => effectiveItemStatus(item) === 'INACTIVE').length,
  }), [detailItems])

  const detailShown = useMemo(() => detailItems.filter((item) => {
    const matchesSearch = !search || `${item.itemName} ${item.sku}`.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = !statusFilter || effectiveItemStatus(item) === statusFilter
    if (!matchesSearch || !matchesStatus) return false
    if (!isUniformDetail) return true
    const fields = resolveItemUniformFields(item)
    if (uniformGenderFilter && fields.uniformGender !== uniformGenderFilter) return false
    if (uniformTypeFilter && fields.uniformType !== uniformTypeFilter) return false
    if (uniformSizeFilter && fields.uniformSize !== uniformSizeFilter) return false
    return true
  }), [
    detailItems,
    search,
    statusFilter,
    isUniformDetail,
    uniformGenderFilter,
    uniformTypeFilter,
    uniformSizeFilter,
  ])

  const summaryPager = usePagination(summaryRows, 15)
  const detailPager = usePagination(detailShown, 15)

  const activeToolKit = useMemo(
    () => items.find((item) => item.inventoryId === activeToolKitId) || null,
    [items, activeToolKitId],
  )

  const toolKitRawItems = useMemo(() => {
    if (!activeToolKit) return []
    const components = Array.isArray(activeToolKit.components) ? activeToolKit.components : []
    return components.map((component) => {
      const childId = component.inventoryId || component.componentInventoryId
      const childItem = childId ? items.find((entry) => entry.inventoryId === childId) : null
      return {
        ...component,
        childId,
        childItem,
        stocks: Number(childItem?.stocks ?? component.stocks) || 0,
        variation: childItem?.variation || component.variation || '',
        updatedAt: childItem?.updatedAt || null,
        usedBy: Array.isArray(component.usedBy) ? component.usedBy : [],
        status: childItem
          ? effectiveItemStatus(childItem)
          : ((Number(component.stocks) || 0) <= 0 ? 'OUT_OF_STOCK' : 'ACTIVE'),
      }
    })
  }, [activeToolKit, items])

  const rawShown = useMemo(() => toolKitRawItems.filter((row) => {
    if (!search) return true
    return `${row.itemName || ''} ${row.sku || ''}`.toLowerCase().includes(search.toLowerCase())
  }), [toolKitRawItems, search])

  const rawPager = usePagination(rawShown, 15)

  const sharedToolKitRawItems = useMemo(() => {
    if (!activeToolKit) return []
    return items.filter((entry) => (
      entry.categoryId === activeToolKit.categoryId
      && entry.kitRole === 'RAW_COMPONENT'
    ))
  }, [items, activeToolKit])

  function openCategory(categoryId) {
    setActiveCategoryId(categoryId)
    setActiveToolKitId(null)
    setShowAddRawModal(false)
    setRawError('')
    setSearch('')
    setStatusFilter('')
    setUniformGenderFilter('')
    setUniformTypeFilter('')
    setUniformSizeFilter('')
    setExpandedLearningKitIds(new Set())
  }

  function closeCategory() {
    setActiveCategoryId(null)
    setActiveToolKitId(null)
    setShowAddRawModal(false)
    setRawError('')
    setSearch('')
    setStatusFilter('')
    setUniformGenderFilter('')
    setUniformTypeFilter('')
    setUniformSizeFilter('')
    setExpandedLearningKitIds(new Set())
  }

  function openToolKitRawPage(inventoryId) {
    setActiveToolKitId(inventoryId)
    setShowAddRawModal(false)
    setRawError('')
    setSearch('')
    setStatusFilter('')
  }

  function closeToolKitRawPage() {
    setActiveToolKitId(null)
    setShowAddRawModal(false)
    setRawError('')
    setSearch('')
    setStatusFilter('')
  }

  function toggleLearningKitExpand(inventoryId) {
    setExpandedLearningKitIds((current) => {
      const next = new Set(current)
      if (next.has(inventoryId)) next.delete(inventoryId)
      else next.add(inventoryId)
      return next
    })
  }

  function openAddRawModal() {
    setShowAddRawModal(true)
    setRawError('')
  }

  async function saveRawChild(parentItem, form) {
    setBusy(true)
    setError('')
    setRawError('')
    try {
      if (form.mode === 'link' && form.inventoryId) {
        await createToolKitChildItem(parentItem.inventoryId, {
          inventoryId: form.inventoryId,
        })
      } else {
        const itemName = normalizeInventoryText(form.itemName)
        const sku = generateUniqueSku(
          { itemName, categoryId: parentItem.categoryId },
          categories,
          items,
        )
        if (!sku) throw new Error('Could not generate a SKU for this raw item.')
        await createToolKitChildItem(parentItem.inventoryId, {
          sku,
          itemName,
          variation: form.variation || null,
          stocks: Number(form.stocks) || 0,
          price: 0,
          internalSellingPrice: 0,
          lowStockThreshold: defaultThreshold,
          forceCreate: Boolean(form.forceCreate),
        })
      }
      setShowAddRawModal(false)
      await onRefresh()
    } catch (err) {
      setRawError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function removeRawChild(parentItem, childInventoryId) {
    if (!window.confirm('Remove this raw item from this Tool Kit? If other kits still use it, the shared stock is kept.')) return
    setBusy(true)
    setError('')
    try {
      await removeToolKitChildItem(parentItem.inventoryId, childInventoryId)
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
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
      const isToolKit = isToolKitCategory(form.categoryId, categories)
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
        ...(form.inventoryId || isLearningKit || isToolKit ? {} : { stocks: form.stocks }),
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
      {showAddRawModal && activeToolKit && (
        <ToolKitRawItemModal
          parentItem={activeToolKit}
          existingRawItems={sharedToolKitRawItems}
          busy={busy}
          error={rawError}
          onClose={() => !busy && setShowAddRawModal(false)}
          onSave={(form) => saveRawChild(activeToolKit, form)}
        />
      )}
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

  // ---- Tool Kit raw items page (drill-in from parent name) ----
  if (activeCategory && activeToolKit && isToolKitCategory(activeCategory.categoryId, categories)) {
    return (
      <>
        <div className="page-title inventory-title">
          <div>
            <button type="button" className="back-link" onClick={closeToolKitRawPage}>← Back to {activeCategory.categoryName}</button>
            <h1>{activeToolKit.itemName}</h1>
            <p>
              Raw items for this Tool Kit. Parent available kits: <strong>{activeToolKit.stocks}</strong>
              {activeToolKit.sku ? ` · ${activeToolKit.sku}` : ''}.
              Shared parts keep one stock across kits.
            </p>
          </div>
          <div>
            <button type="button" className="primary" disabled={busy} onClick={openAddRawModal}>＋ Add raw item</button>
          </div>
        </div>
        {error && <div className="page-error">{error}</div>}
        <section className="panel inventory-panel">
          <div className="toolbar">
            <label className="search">⌕<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by SKU or item name..." /></label>
            <span>{rawShown.length} raw items</span>
          </div>
          <div className="overflow-x-auto rounded-lg table-scroll" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}>
            <table className="inventory-table" style={{ width: '100%', minWidth: '980px' }}>
              <thead>
                <tr>
                  <th>Item name</th>
                  <th>SKU</th>
                  <th>Variation</th>
                  <th>Stock</th>
                  <th>Qty / kit</th>
                  <th>Used by</th>
                  <th>Status</th>
                  <th>Last updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rawShown.length ? rawPager.pageItems.map((row) => {
                  const usedBy = Array.isArray(row.usedBy) ? row.usedBy : []
                  const usedByLabel = usedBy.length
                    ? usedBy.map((entry) => entry.itemName).join(', ')
                    : activeToolKit.itemName
                  return (
                  <tr key={row.componentRowId || row.childId || row.sku}>
                    <td>
                      <div className="item-cell">
                        <div className="product-thumb"><Icon name="box" /></div>
                        <div>
                          <strong>{row.itemName || '—'}</strong>
                          {usedBy.length > 1 && <small className="muted">Shared raw item</small>}
                        </div>
                      </div>
                    </td>
                    <td><span className="sku-chip">{row.sku || '—'}</span></td>
                    <td className="variation-cell">{row.variation || '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="stock-link"
                        disabled={busy || !row.childItem}
                        onClick={() => row.childItem && setStock(row.childItem)}
                        title="Adjust raw item stock"
                      >
                        <strong className={row.stocks === 0 ? 'zero' : ''}>{row.stocks}</strong>
                        <small>Adjust stock</small>
                      </button>
                    </td>
                    <td>{row.quantity || 1}</td>
                    <td className="remarks-cell">
                      <span title={usedByLabel}>{truncateText(usedByLabel, 42)}</span>
                    </td>
                    <td><StatusBadge status={row.status} /></td>
                    <td><span className="muted">{formatDate(row.updatedAt)}</span></td>
                    <td>
                      <ActionsMenu
                        label={`Actions for ${row.itemName || 'raw item'}`}
                        disabled={busy}
                        items={[
                          ...(row.childItem
                            ? [{ key: 'stock', label: 'Adjust stock', onClick: () => setStock(row.childItem) }]
                            : []),
                          {
                            key: 'remove',
                            label: 'Remove from this kit',
                            danger: true,
                            onClick: () => removeRawChild(activeToolKit, row.childId),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                  )
                }) : (
                  <tr>
                    <td colSpan={9}>
                      <EmptyState
                        title="No raw items yet"
                        message="Add new raw items or link existing ones from other Tool Kits (e.g. pencil, crayons)."
                        action={<button type="button" className="primary" onClick={openAddRawModal}>＋ Add raw item</button>}
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={rawPager.page} pageSize={15} total={rawPager.total} onPageChange={rawPager.setPage} noun="raw items" />
        </section>
        {modals}
      </>
    )
  }

  // ---- Detail view: raw stocks for a single category ----
  if (activeCategory) {
    return (
      <>
        <div className="page-title inventory-title">
          <div>
            <button type="button" className="back-link" onClick={closeCategory}>← Back to categories</button>
            <h1>{activeCategory.categoryName}</h1>
            <p>
              {isToolKitCategory(activeCategory.categoryId, categories)
                ? 'Parent items with raw child SKUs. Stock = how many kits can be built.'
                : isLearningKitCategory(activeCategory.categoryId, categories)
                  ? 'Learning Kits with category BOM. Stock = available kits from components.'
                  : 'Raw stocks for this category.'}
            </p>
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
            {isUniformDetail && (
              <>
                <select
                  aria-label="Filter by gender"
                  value={uniformGenderFilter}
                  onChange={(e) => {
                    setUniformGenderFilter(e.target.value)
                    setUniformTypeFilter('')
                  }}
                >
                  <option value="">All genders</option>
                  {uniformFilterOptions.genders.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <select
                  aria-label="Filter by type"
                  value={uniformTypeFilter}
                  onChange={(e) => setUniformTypeFilter(e.target.value)}
                >
                  <option value="">All types</option>
                  {(uniformGenderFilter
                    ? [
                      ...getUniformTypesForCategory(activeCategoryId, categories, uniformGenderFilter),
                      ...(isLcaShirtCategory(activeCategoryId, categories) ? [] : [UNIFORM_SET_TYPE]),
                    ].filter((value, index, list) => list.indexOf(value) === index)
                    : uniformFilterOptions.types
                  ).map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <select
                  aria-label="Filter by size"
                  value={uniformSizeFilter}
                  onChange={(e) => setUniformSizeFilter(e.target.value)}
                >
                  <option value="">All sizes</option>
                  {uniformFilterOptions.sizes.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </>
            )}
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
                {detailShown.length ? detailPager.pageItems.flatMap((item) => {
                  const isToolKit = isToolKitCategory(item.categoryId, categories)
                  const isLearningKit = isLearningKitCategory(item.categoryId, categories)
                  const isVirtualKit = item.stockMode === 'VIRTUAL_BUNDLE'
                    || isVirtualKitCategory(item.categoryId, categories)
                  const status = effectiveItemStatus(item)
                  const remarksText = String(item.remarks || '').trim()
                  const expanded = !isToolKit && expandedLearningKitIds.has(item.inventoryId)
                  const components = Array.isArray(item.components) ? item.components : []

                  const mainRow = (
                  <tr key={item.inventoryId}>
                    <td>
                      <div className="item-cell">
                        <div className="product-thumb"><Icon name="box" /></div>
                        <div>
                          {isToolKit ? (
                            <button
                              type="button"
                              className="category-link item-name-link"
                              onClick={() => openToolKitRawPage(item.inventoryId)}
                              title="Open raw items for this Tool Kit"
                            >
                              <strong>{item.itemName}</strong>
                              <small>Click to manage raw items</small>
                            </button>
                          ) : isLearningKit ? (
                            <button
                              type="button"
                              className="item-name-expand"
                              onClick={() => toggleLearningKitExpand(item.inventoryId)}
                              aria-expanded={expanded}
                              title="Show included categories"
                            >
                              <span className="kit-expand-chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
                              <strong>{item.itemName}</strong>
                            </button>
                          ) : (
                            <strong>{item.itemName}</strong>
                          )}
                          {isLearningKit && <small className="muted">Learning Kit · available kits from BOM</small>}
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
                            setError(isToolKit
                              ? 'Tool Kit stock is computed from raw child items. Open the item to manage raw stock.'
                              : 'Learning Kit stock is computed from included category stocks (BOM). Restock those raw items, or edit the kit BOM — do not adjust kit stock directly.')
                            return
                          }
                          setStock(item)
                        }}
                        title={isVirtualKit
                          ? (isToolKit
                            ? 'Available kits = limited by raw child item stocks'
                            : 'Available kits = limited by included category stocks')
                          : 'Adjust stock'}
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
                          ? `Based on available kits (${item.stocks}). ${isToolKit ? 'Tool Kit' : 'Learning Kit'} stock is computed from BOM.`
                          : undefined}
                      />
                    </td>
                    <td><span className="muted">{formatDate(item.updatedAt)}</span></td>
                    <td>
                      <ActionsMenu
                        label={`Actions for ${item.itemName}`}
                        disabled={busy}
                        items={[
                          ...(isToolKit
                            ? [{ key: 'raw', label: 'View raw items', onClick: () => openToolKitRawPage(item.inventoryId) }]
                            : []),
                          {
                            key: 'edit',
                            label: (() => {
                              if (!isUniformCategory(item.categoryId, categories) || isLcaShirtCategory(item.categoryId, categories)) {
                                return 'Edit item'
                              }
                              return isUniformSetType(item.uniformType) ? 'Edit set' : 'Edit pieces'
                            })(),
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

                  if (!isLearningKit || !expanded) return [mainRow]

                  const childRow = (
                    <tr key={`${item.inventoryId}-bom`} className="kit-bom-row">
                      <td colSpan={10}>
                        <div className="kit-bom-panel">
                          <strong>Included categories</strong>
                          {components.length ? (
                            <div
                              className="overflow-x-auto rounded-lg"
                              style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}
                            >
                              <table className="kit-bom-table" style={{ width: '100%', minWidth: '420px' }}>
                                <thead>
                                  <tr>
                                    <th>Category</th>
                                    <th>Category stock</th>
                                    <th>Qty / kit</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {components.map((component) => (
                                    <tr key={component.componentRowId || component.categoryId}>
                                      <td>{component.categoryName || '—'}</td>
                                      <td><strong>{Number(component.categoryStocks ?? component.stocks) || 0}</strong></td>
                                      <td>{component.quantity || 1}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="muted">No BOM configured yet. Edit this item to add categories.</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )

                  return [mainRow, childRow]
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
        <div>
          <h1>Inventory</h1>
          <p>Stock levels grouped by category. Filter the first column by Merchandise or Supplies, or keep Categories for all.</p>
        </div>
      </div>
      {error && <div className="page-error">{error}</div>}
      <section className="panel inventory-panel">
        <div className="overflow-x-auto rounded-lg table-scroll" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}>
          <table className="inventory-table" style={{ width: '100%', minWidth: '760px' }}>
            <thead>
              <tr>
                <th>
                  <TableHeadSelect
                    value={categoryTypeFilter}
                    options={INVENTORY_CATEGORY_TYPE_FILTER_OPTIONS}
                    onChange={applyCategoryTypeFilter}
                    ariaLabel="Category type"
                  />
                </th>
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
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      title={
                        categoryTypeFilter === 'SUPPLIES'
                          ? 'No supplies categories yet'
                          : categoryTypeFilter === 'MERCHANDISE'
                            ? 'No merchandise categories yet'
                            : 'No categories yet'
                      }
                      message="Create a category first, then add inventory items to it from here."
                    />
                  </td>
                </tr>
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
