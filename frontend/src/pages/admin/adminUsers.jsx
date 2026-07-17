import { useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { StatusBadge } from '../../components/StatusBadge'
import { createUser, updateUserRole } from '../../services/inventoryApi'
import { formatDate } from '../../utils/format'

const emptyForm = {
  fullName: '',
  email: '',
  password: '',
  role: 'USER',
}

export default function AdminUsers({ users, currentAdmin, onRefresh }) {
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [creating, setCreating] = useState(false)

  function openAddModal() {
    setError('')
    setForm(emptyForm)
    setShowAddModal(true)
  }

  function closeAddModal() {
    if (creating) return
    setShowAddModal(false)
    setForm(emptyForm)
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function changeRole(user, role) {
    if (user.role === role) return
    setBusyId(user.userId)
    setError('')
    try {
      await updateUserRole(user.userId, role)
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  async function submitCreate(e) {
    e.preventDefault()
    setCreating(true)
    setError('')
    try {
      await createUser({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
      })
      setShowAddModal(false)
      setForm(emptyForm)
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Users</h1>
          <p>Create and manage accounts that can sign in to the inventory system.</p>
        </div>
        <button type="button" className="primary" onClick={openAddModal}>Add user</button>
      </div>

      {error && !showAddModal && <div className="page-error">{error}</div>}

      <section className="panel recent">
        {users.length ? (
          <div className="overflow-x-auto rounded-lg table-scroll" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', minWidth: '760px' }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Added</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.userId}>
                    <td><strong>{user.fullName}</strong></td>
                    <td>{user.email}</td>
                    <td>
                      <select
                        className="role-select"
                        value={user.role || 'ADMIN'}
                        disabled={busyId === user.userId || user.userId === currentAdmin?.userId}
                        onChange={(e) => changeRole(user, e.target.value)}
                        title={user.userId === currentAdmin?.userId ? 'You cannot change your own role' : 'Change role'}
                      >
                        <option value="ADMIN">Admin</option>
                        <option value="USER">User</option>
                      </select>
                    </td>
                    <td><StatusBadge status={user.status} /></td>
                    <td className="muted">{formatDate(user.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No users yet" message="Click Add user to create the first account." />
        )}
      </section>

      {showAddModal && (
        <div className="modal-backdrop">
          <form className="modal small" onSubmit={submitCreate}>
            <div className="modal-head">
              <div>
                <h2>Add user</h2>
                <p>Creates a Firebase login and an inventory account in one step.</p>
              </div>
              <button type="button" onClick={closeAddModal}>×</button>
            </div>

            <label>
              Full name *
              <input
                autoFocus
                required
                minLength={2}
                maxLength={150}
                value={form.fullName}
                onChange={(e) => updateField('fullName', e.target.value)}
                placeholder="Jane Doe"
              />
            </label>

            <label>
              Email *
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                placeholder="user@school.edu"
                autoComplete="off"
              />
            </label>

            <label>
              Temporary password *
              <input
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => updateField('password', e.target.value)}
                placeholder="At least 6 characters"
                autoComplete="new-password"
              />
            </label>

            <label>
              Role *
              <select required value={form.role} onChange={(e) => updateField('role', e.target.value)}>
                <option value="USER">User</option>
                <option value="ADMIN">Admin</option>
              </select>
            </label>

            {error && <div className="page-error">{error}</div>}

            <div className="integration-note">
              The user can sign in immediately with this email and password.
              Admin can access all pages; User can access Workspace pages only.
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary" onClick={closeAddModal} disabled={creating}>Cancel</button>
              <button type="submit" className="primary" disabled={creating}>
                {creating ? 'Creating…' : 'Create user'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
