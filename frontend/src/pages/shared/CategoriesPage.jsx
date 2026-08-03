import { useMemo, useState } from 'react'
import { ActionsMenu } from '../../components/ActionsMenu'
import { CategoryModal } from '../../components/CategoryModal'
import { DeleteCategoryModal } from '../../components/DeleteCategoryModal'
import { EmptyState } from '../../components/EmptyState'
import { Pagination } from '../../components/Pagination'
import { StatusBadge } from '../../components/StatusBadge'
import { CATEGORY_TYPE_OPTIONS } from '../../constants/uniformOptions'
import { usePagination } from '../../hooks/usePagination'
import { createCategory, deleteCategory, updateCategory } from '../../services/inventoryApi'
import { formatDate } from '../../utils/format'

function kindLabel(kind) {
  return CATEGORY_TYPE_OPTIONS.find((option) => option.value === kind)?.label || kind || 'Others'
}

export default function CategoriesPage({ categories, items = [], canManage = false, onRefresh }) {
  const [modal, setModal] = useState(null) // { mode: 'create' } | { mode: 'edit', category }
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const itemCountByCategory = useMemo(() => {
    const map = new Map()
    items.forEach((item) => map.set(item.categoryId, (map.get(item.categoryId) || 0) + 1))
    return map
  }, [items])

  const { page, setPage, pageItems, total } = usePagination(categories, 15)

  async function saveCategory({ categoryName, categoryKind }) {
    setBusy(true)
    setError('')
    try {
      if (modal?.mode === 'edit') {
        await updateCategory(modal.category.categoryId, { categoryName, categoryKind })
      } else {
        await createCategory({ categoryName, categoryKind })
      }
      setModal(null)
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function confirmDeleteCategory(category) {
    if (!canManage || !category?.categoryId) return
    setBusy(true)
    setError('')
    try {
      await deleteCategory(category.categoryId)
      setDeleteTarget(null)
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
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
              : 'Browse merchandise categories used across inventory items.'}
          </p>
        </div>
        {canManage && (
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
                const inUse = (itemCountByCategory.get(category.categoryId) || 0) > 0
                return (
                  <tr key={category.categoryId}>
                    <td><strong>{category.categoryName}</strong></td>
                    <td className="muted">{kindLabel(category.categoryKind)}</td>
                    <td className="muted">{itemCountByCategory.get(category.categoryId) || 0}</td>
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
                              disabled: inUse,
                              title: inUse
                                ? 'Remove or move inventory items first — categories cannot be deleted from Inventory'
                                : 'Delete category',
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
                      message={canManage
                        ? 'Seed categories should load from the database. You can also add a new category.'
                        : 'No categories are available yet.'}
                      action={canManage
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
      {canManage && modal && (
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
          busy={busy}
          onClose={() => !busy && setDeleteTarget(null)}
          onConfirm={confirmDeleteCategory}
        />
      )}
    </>
  )
}
