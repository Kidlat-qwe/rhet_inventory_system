import { initials } from '../utils/format'

export function Header({ page, menu, logout, admin }) {
  const roleLabel = String(admin?.role || '').toUpperCase() === 'USER' ? 'User' : 'Admin'

  return (
    <header>
      <button type="button" className="menu-btn" onClick={menu}>☰</button>
      <div className="breadcrumbs">{roleLabel} <span>/</span> <strong>{page}</strong></div>
      <div className="header-actions">
        <button type="button" className="icon-button">⌕</button>
        <button type="button" className="icon-button notification">♢<i /></button>
        <button type="button" className="header-avatar" onClick={logout} title="Sign out">{initials(admin?.fullName)}</button>
      </div>
    </header>
  )
}
