import { useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { StatusBadge } from '../../components/StatusBadge'
import { updateUserRole } from '../../services/inventoryApi'
import { formatDate } from '../../utils/format'

export default function AdminUsers({ users, currentAdmin, onRefresh }) {
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')

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

  return (
    <>
      <div className="page-title"><div><h1>Users</h1><p>Accounts authorized to access the inventory system.</p></div></div>
      {error && <div className="page-error">{error}</div>}
      <section className="panel recent">
        {users.length ? (
          <div className="overflow-x-auto rounded-lg table-scroll" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', minWidth: '760px' }}>
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Added</th></tr></thead>
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
          <EmptyState title="No users yet" message="User accounts appear here after they are provisioned in Firebase and the database." />
        )}
      </section>
    </>
  )
}
