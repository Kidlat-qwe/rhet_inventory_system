import { useMemo, useState } from 'react'
import { ActionsMenu } from '../../components/ActionsMenu'
import { CategoryModal } from '../../components/CategoryModal'
import { EmptyState } from '../../components/EmptyState'
import { Pagination } from '../../components/Pagination'
import { StatusBadge } from '../../components/StatusBadge'
import { usePagination } from '../../hooks/usePagination'
import { createCategory, deleteCategory, updateCategory } from '../../services/inventoryApi'
import { formatDate } from '../../utils/format'

export default function CategoriesPage({ categories, items = [], canManage = false, onRefresh }) {
  const [modal, setModal] = useState(null) // { mode: 'create' } | { mode: 'edit', category }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const itemCountByCategory = useMemo(() => {
    const map = new Map()
    items.forEach((item) => map.set(item.categoryId, (map.get(item.categoryId) || 0) + 1))
    return map
  }, [items])

  const { page, setPage, pageItems, total } = usePagination(categories, 15)

  async function saveCategory(name) {
    setBusy(true)
    setError('')
    try {
      if (modal?.mode === 'edit') await updateCategory(modal.category.categoryId, name.trim())
      else await createCategory(name.trim())
      setModal(null)
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function removeCategory(category) {
    if (!window.confirm(`Delete category "${category.categoryName}"? This cannot be undone.`)) return
    setBusy(true)
    setError('')
    try {
      await deleteCategory(category.categoryId)
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
        <div><h1>Categories</h1><p>Manage merchandise categories used across inventory items.</p></div>
        <div>
          <button type="button" className="primary" onClick={() => setModal({ mode: 'create' })}>＋ Add category</button>
        </div>
      </div>
      {error && <div className="page-error">{error}</div>}
      <section className="panel recent">
        <div className="panel-head"><div><h2>All categories</h2><p>{categories.length} categories available</p></div></div>
        {categories.length ? (
          <div className="overflow-x-auto rounded-lg table-scroll" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', minWidth: canManage ? '640px' : '520px' }}>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Items</th>
                  <th>Status</th>
                  <th>Created</th>
                  {canManage && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {pageItems.map((category) => {
                  const inUse = (itemCountByCategory.get(category.categoryId) || 0) > 0
                  return (
                    <tr key={category.categoryId}>
                      <td><strong>{category.categoryName}</strong></td>
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
                                title: inUse ? 'Category still has inventory items' : 'Delete category',
                                onClick: () => removeCategory(category),
                              },
                            ]}
                          />
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <Pagination page={page} pageSize={15} total={total} onPageChange={setPage} noun="categories" />
          </div>
        ) : (
          <EmptyState
            title="No categories found"
            message="Seed categories should load from the database. You can also add a new category."
            action={<button type="button" className="primary" onClick={() => setModal({ mode: 'create' })}>＋ Add category</button>}
          />
        )}
      </section>
      {modal && (
        <CategoryModal
          category={modal.mode === 'edit' ? modal.category : null}
          categories={categories}
          busy={busy}
          onClose={() => setModal(null)}
          onSave={saveCategory}
        />
      )}
    </>
  )
}
