import { EmptyState } from '../../components/EmptyState'
import { formatDate, formatStatus } from '../../utils/format'

export default function AdminSettings({ admin }) {
  return (
    <>
      <div className="page-title"><div><h1>Settings</h1><p>Your administrator profile and session details.</p></div></div>
      <section className="panel settings-panel">
        {admin ? (
          <div className="settings-grid">
            <div><span>Full name</span><strong>{admin.fullName}</strong></div>
            <div><span>Email</span><strong>{admin.email}</strong></div>
            <div><span>Status</span><strong>{formatStatus(admin.status)}</strong></div>
            <div><span>Account created</span><strong>{formatDate(admin.createdAt)}</strong></div>
          </div>
        ) : (
          <EmptyState title="Profile unavailable" message="Sign in again to load your administrator profile." />
        )}
      </section>
    </>
  )
}
