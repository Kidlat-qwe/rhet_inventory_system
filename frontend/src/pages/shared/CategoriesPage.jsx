import { useMemo, useState } from 'react'
import { ActionsMenu } from '../../components/ActionsMenu'
import { CategoryModal } from '../../components/CategoryModal'
import { DeleteCategoryModal } from '../../components/DeleteCategoryModal'
import { EmptyState } from '../../components/EmptyState'
import { Pagination } from '../../components/Pagination'
import { StatusBadge } from '../../components/StatusBadge'
import { categoryKindLabel } from '../../constants/uniformOptions'
import { usePagination } from '../../hooks/usePagination'
import { createCategory, deleteCategory, updateCategory } from '../../services/inventoryApi'
import { formatDate } from '../../utils/format'

export default function CategoriesPage({
  categories,
  items = [],
  canManage = false,
  canCreate = false,
  onRefresh,
  onOpenInventory,
}) {
  const allowCreate = Boolean(canCreate || canManage)
  const [modal, setModal] = useState(null) // { mode: 'create' } | { mode: 'edit', category }
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [createdOffer, setCreatedOffer] = useState(null) // { categoryId, categoryName }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const itemCountByCategory = useMemo(() => {
    const map = new Map()
    items.forEach((item) => map.set(item.categoryId, (map.get(item.categoryId) || 0) + 1))
    return map
  }, [items])

  const { page, setPage, pageItems, total } = usePagination(categories, 15)

  async function saveCategory({ categoryName, categoryKind, hasChildSkus }) {
    if (modal?.mode === 'edit' && !canManage) return
    if (modal?.mode !== 'edit' && !allowCreate) return
    setBusy(true)
    setError('')
    try {
      if (modal?.mode === 'edit') {
        await updateCategory(modal.category.categoryId, { categoryName, categoryKind, hasChildSkus })
        setModal(null)
        await onRefresh()
      } else {
        const created = await createCategory({ categoryName, categoryKind, hasChildSkus })
        setModal(null)
        await onRefresh()
        setCreatedOffer({
          categoryId: created.categoryId,
          categoryName: created.categoryName || categoryName,
        })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function confirmDeleteCategory(category, confirmationName) {
    if (!canManage || !category?.categoryId) return
    setBusy(true)
    setError('')
    try {
      await deleteCategory(category.categoryId, confirmationName || category.categoryName)
      setDeleteTarget(null)
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function openInventoryForCreated() {
    const categoryId = createdOffer?.categoryId
    setCreatedOffer(null)
    if (categoryId && typeof onOpenInventory === 'function') {
      onOpenInventory(categoryId)
    }
  }

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Categories</h1>
          <p>
            {canManage
              ? 'Manage merchandise categories used across inventory items. Delete is only available here (not on Inventory).'
              : allowCreate
                ? 'Browse categories and add new ones. Edit and delete remain admin-only.'
                : 'Browse merchandise categories used across inventory items.'}
          </p>
        </div>
        {allowCreate && (
          <div>
            <button type="button" className="primary" onClick={() => setModal({ mode: 'create' })}>
              ＋ Add category
            </button>
          </div>
        )}
      </div>
      {error && <div className="page-error">{error}</div>}
      <section className="panel recent">
        <div className="panel-head"><div><h2>All categories</h2><p>{categories.length} categories available</p></div></div>
        <div className="overflow-x-auto rounded-lg table-scroll" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: canManage ? '720px' : '600px' }}>
            <thead>
              <tr>
                <th>Category</th>
                <th>Type</th>
                <th>Items</th>
                <th>Status</th>
                <th>Created</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {pageItems.length ? pageItems.map((category) => {
                const itemCount = itemCountByCategory.get(category.categoryId) || 0
                return (
                  <tr key={category.categoryId}>
                    <td><strong>{category.categoryName}</strong></td>
                    <td className="muted">{categoryKindLabel(category.categoryKind, category.hasChildSkus)}</td>
                    <td className="muted">{itemCount}</td>
                    <td><StatusBadge status={category.status} /></td>
                    <td className="muted">{formatDate(category.createdAt)}</td>
                    {canManage && (
                      <td>
                        <ActionsMenu
                          label={`Actions for ${category.categoryName}`}
                          disabled={busy}
                          items={[
                            { key: 'edit', label: 'Edit', onClick: () => setModal({ mode: 'edit', category }) },
                            {
                              key: 'delete',
                              label: 'Delete',
                              danger: true,
                              title: itemCount
                                ? `Delete category and ${itemCount} item${itemCount === 1 ? '' : 's'} (type name to confirm)`
                                : 'Delete category (type name to confirm)',
                              onClick: () => {
                                setError('')
                                setDeleteTarget(category)
                              },
                            },
                          ]}
                        />
                      </td>
                    )}
                  </tr>
                )
              }) : (
                <tr>
                  <td colSpan={canManage ? 6 : 5}>
                    <EmptyState
                      title="No categories found"
                      message={allowCreate
                        ? 'Seed categories should load from the database. You can also add a new category.'
                        : 'No categories are available yet.'}
                      action={allowCreate
                        ? <button type="button" className="primary" onClick={() => setModal({ mode: 'create' })}>＋ Add category</button>
                        : null}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <Pagination page={page} pageSize={15} total={total} onPageChange={setPage} noun="categories" />
        </div>
      </section>
      {allowCreate && modal && (modal.mode !== 'edit' || canManage) && (
        <CategoryModal
          category={modal.mode === 'edit' ? modal.category : null}
          categories={categories}
          busy={busy}
          onClose={() => !busy && setModal(null)}
          onSave={saveCategory}
        />
      )}
      {canManage && deleteTarget && (
        <DeleteCategoryModal
          category={deleteTarget}
          itemCount={itemCountByCategory.get(deleteTarget.categoryId) || 0}
          busy={busy}
          onClose={() => !busy && setDeleteTarget(null)}
          onConfirm={confirmDeleteCategory}
        />
      )}
      {createdOffer && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setCreatedOffer(null)}>
          <div className="modal modal-sm">
            <div className="modal-head">
              <div>
                <h2>Category created</h2>
                <p>
                  <strong>{createdOffer.categoryName}</strong> is ready. Open Inventory to add items now, or stay on Categories.
                </p>
              </div>
              <button type="button" onClick={() => setCreatedOffer(null)}>×</button>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setCreatedOffer(null)}>Stay here</button>
              <button type="button" className="primary" onClick={openInventoryForCreated}>Open Inventory</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
