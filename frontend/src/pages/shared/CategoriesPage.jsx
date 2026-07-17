import { useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { StatusBadge } from '../../components/StatusBadge'
import { createCategory } from '../../services/inventoryApi'
import { formatDate } from '../../utils/format'

export default function CategoriesPage({ categories, onRefresh }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await createCategory(name.trim())
      setName('')
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="page-title"><div><h1>Categories</h1><p>Manage merchandise categories used across inventory items.</p></div></div>
      {error && <div className="page-error">{error}</div>}
      <section className="panel">
        <div className="panel-head"><div><h2>Add category</h2><p>Create a new merchandise category.</p></div></div>
        <form className="inline-form" onSubmit={submit}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Category name" minLength="2" required />
          <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : 'Add category'}</button>
        </form>
      </section>
      <section className="panel recent">
        <div className="panel-head"><div><h2>All categories</h2><p>{categories.length} categories available</p></div></div>
        {categories.length ? (
          <div className="overflow-x-auto rounded-lg table-scroll" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', minWidth: '520px' }}>
              <thead><tr><th>Category</th><th>Status</th><th>Created</th></tr></thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.categoryId}>
                    <td><strong>{category.categoryName}</strong></td>
                    <td><StatusBadge status={category.status} /></td>
                    <td className="muted">{formatDate(category.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No categories found" message="Seed categories should load from the database. You can also add a new category above." />
        )}
      </section>
    </>
  )
}
