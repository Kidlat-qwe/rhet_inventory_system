import { NavLink } from 'react-router-dom'
import { pathForPage } from '../routes/paths'
import { formatStatus, initials } from '../utils/format'
import { Icon } from './Icon'

export function Sidebar({ open, close, admin, itemCount, pendingRequests, attentionOrders = 0 }) {
  const isAdmin = String(admin?.role || 'ADMIN').toUpperCase() === 'ADMIN'
  const workspaceLinks = [
    ['Dashboard', 'grid'],
    ['Inventory', 'box'],
    ['Stock Requests', 'swap'],
    ['Online Orders', 'cart'],
    ['Release Logs', 'list'],
    ['Stock Movements', 'swap'],
    ['Reports', 'report'],
  ]
  const managementLinks = isAdmin
    ? [['Categories', 'tag'], ['API Keys', 'link'], ['Users', 'users'], ['Settings', 'settings']]
    : [['Categories', 'tag']]

  function linkClass({ isActive }) {
    return isActive || false ? 'active' : undefined
  }

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="brand">
        <img className="brand-logo" src="/rhet-logo.png" alt="RHET logo" />
        <div><strong>RHET Inventory System</strong><span>Merchandise Management</span></div>
        <button type="button" className="close-menu" onClick={close}>×</button>
      </div>
      <nav>
        <p>Workspace</p>
        {workspaceLinks.map(([label, icon]) => (
          <NavLink
            key={label}
            to={pathForPage(isAdmin, label)}
            className={linkClass}
            onClick={close}
          >
            <Icon name={icon} />{label}
            {label === 'Inventory' && itemCount > 0 && <span className="nav-count">{itemCount}</span>}
            {label === 'Stock Requests' && pendingRequests > 0 && <span className="nav-count">{pendingRequests}</span>}
            {label === 'Online Orders' && attentionOrders > 0 && <span className="nav-count">{attentionOrders}</span>}
          </NavLink>
        ))}
        <p>Management</p>
        {managementLinks.map(([label, icon]) => (
          <NavLink
            key={label}
            to={pathForPage(isAdmin, label)}
            className={linkClass}
            onClick={close}
          >
            <Icon name={icon} />{label}
          </NavLink>
        ))}
      </nav>
      <div className="help-card"><span>?</span><strong>Need some help?</strong><p>View the system guide and learn the inventory workflow.</p><button type="button">Open guide</button></div>
      <div className="sidebar-user">
        <div className="avatar">{initials(admin?.fullName)}</div>
        <div><strong>{admin?.fullName || 'User'}</strong><span>{formatStatus(admin?.role || 'USER')}</span></div>
        <button type="button">•••</button>
      </div>
    </aside>
  )
}
