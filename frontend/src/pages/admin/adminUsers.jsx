import { useState } from 'react'
import { ActionsMenu } from '../../components/ActionsMenu'
import { EmptyState } from '../../components/EmptyState'
import { Pagination } from '../../components/Pagination'
import { StatusBadge } from '../../components/StatusBadge'
import { usePagination } from '../../hooks/usePagination'
import { createUser, updateUser, updateUserRole, updateUserStatus } from '../../services/inventoryApi'
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
  const [editUser, setEditUser] = useState(null)
  const [editName, setEditName] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [creating, setCreating] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const { page, setPage, pageItems, total } = usePagination(users, 15)

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

  function openEditModal(user) {
    setError('')
    setEditUser(user)
    setEditName(user.fullName || '')
  }

  function closeEditModal() {
    if (savingEdit) return
    setEditUser(null)
    setEditName('')
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

  async function changeStatus(user, status) {
    if (user.status === status) return
    setBusyId(user.userId)
    setError('')
    try {
      await updateUserStatus(user.userId, status)
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

  async function submitEdit(e) {
    e.preventDefault()
    if (!editUser) return
    setSavingEdit(true)
    setError('')
    try {
      await updateUser(editUser.userId, { fullName: editName.trim() })
      setEditUser(null)
      setEditName('')
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Users</h1>
          <p>Create and manage accounts. Admins can change roles and activate or deactivate non-admin users.</p>
        </div>
        <button type="button" className="primary" onClick={openAddModal}>Add user</button>
      </div>

      {error && !showAddModal && !editUser && <div className="page-error">{error}</div>}

      <section className="panel recent">
        <div className="overflow-x-auto rounded-lg table-scroll" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: '860px' }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Added</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length ? pageItems.map((user) => {
                const isSelf = user.userId === currentAdmin?.userId
                const busy = busyId === user.userId
                return (
                  <tr key={user.userId}>
                    <td>
                      <strong>{user.fullName}</strong>
                      {isSelf && <small className="muted">You</small>}
                    </td>
                    <td>{user.email}</td>
                    <td>
                      <select
                        className="role-select"
                        value={user.role || 'USER'}
                        disabled={busy || isSelf}
                        onChange={(e) => changeRole(user, e.target.value)}
                        title={isSelf ? 'You cannot change your own role' : 'Change role'}
                      >
                        <option value="ADMIN">Admin</option>
                        <option value="USER">User</option>
                      </select>
                    </td>
                    <td><StatusBadge status={user.status} /></td>
                    <td className="muted">{formatDate(user.createdAt)}</td>
                    <td>
                      <ActionsMenu
                        label={`Actions for ${user.fullName}`}
                        disabled={busy}
                        items={[
                          {
                            key: 'edit',
                            label: 'Edit name',
                            onClick: () => openEditModal(user),
                          },
                          {
                            key: 'make-user',
                            label: 'Set as User',
                            hidden: user.role === 'USER' || isSelf,
                            onClick: () => changeRole(user, 'USER'),
                          },
                          {
                            key: 'make-admin',
                            label: 'Set as Admin',
                            hidden: user.role === 'ADMIN',
                            onClick: () => changeRole(user, 'ADMIN'),
                          },
                          {
                            key: 'deactivate',
                            label: 'Deactivate',
                            danger: true,
                            hidden: user.status !== 'ACTIVE' || isSelf,
                            title: isSelf ? 'You cannot deactivate your own account' : 'Disable sign-in for this user',
                            onClick: () => changeStatus(user, 'INACTIVE'),
                          },
                          {
                            key: 'activate',
                            label: 'Activate',
                            hidden: user.status === 'ACTIVE',
                            onClick: () => changeStatus(user, 'ACTIVE'),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                )
              }) : (
                <tr>
                  <td colSpan={6}>
                    <EmptyState title="No users yet" message="Click Add user to create the first account." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <Pagination page={page} pageSize={15} total={total} onPageChange={setPage} noun="users" />
        </div>
      </section>

      {showAddModal && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeAddModal()}>
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
              You can deactivate a user later to block sign-in.
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

      {editUser && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeEditModal()}>
          <form className="modal small" onSubmit={submitEdit}>
            <div className="modal-head">
              <div>
                <h2>Edit user</h2>
                <p>Update the display name for {editUser.email}.</p>
              </div>
              <button type="button" onClick={closeEditModal}>×</button>
            </div>

            <label>
              Full name *
              <input
                autoFocus
                required
                minLength={2}
                maxLength={150}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </label>

            <label>
              Email
              <input className="readonly-input" readOnly value={editUser.email || ''} />
            </label>

            {error && <div className="page-error">{error}</div>}

            <div className="modal-actions">
              <button type="button" className="secondary" onClick={closeEditModal} disabled={savingEdit}>Cancel</button>
              <button type="submit" className="primary" disabled={savingEdit}>
                {savingEdit ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
