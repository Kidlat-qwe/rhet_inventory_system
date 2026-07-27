import { useEffect, useMemo, useRef, useState } from 'react'
import { formatDate, initials } from '../utils/format'
import { firebaseConfigured, sendPasswordResetForCurrentUser } from '../services/firebase'
import { Icon } from './Icon'

const SEEN_STORAGE_KEY = 'rhet_seen_stock_request_ids'

function readSeenIds() {
  try {
    const raw = localStorage.getItem(SEEN_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.map(String) : [])
  } catch {
    return new Set()
  }
}

function writeSeenIds(ids) {
  try {
    localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    // Ignore storage failures (private mode / quota).
  }
}

function requestLabel(request) {
  const parts = [
    request.categoryName,
    request.gender,
    request.type || request.itemType,
    request.size || request.sizeLabel,
    request.itemName,
  ].filter(Boolean)
  return parts.join(' · ') || request.externalReference || 'Stock request'
}

export function Header({ page, menu, logout, admin, pendingRequests = [], onOpenStockRequests }) {
  const roleLabel = String(admin?.role || '').toUpperCase() === 'USER' ? 'User' : 'Admin'
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [seenIds, setSeenIds] = useState(() => readSeenIds())
  const notificationsRef = useRef(null)
  const accountRef = useRef(null)

  const accountEmail = admin?.email || ''

  const pending = useMemo(
    () => [...pendingRequests]
      .filter((request) => request?.status === 'PENDING')
      .sort((a, b) => new Date(b.createdAt || b.requestDate || 0) - new Date(a.createdAt || a.requestDate || 0)),
    [pendingRequests],
  )

  const unreadCount = useMemo(
    () => pending.filter((request) => !seenIds.has(String(request.requestId))).length,
    [pending, seenIds],
  )

  useEffect(() => {
    if (!notificationsOpen && !accountOpen) return undefined

    function onPointerDown(event) {
      if (notificationsOpen && notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setNotificationsOpen(false)
      }
      if (accountOpen && accountRef.current && !accountRef.current.contains(event.target)) {
        setAccountOpen(false)
      }
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setNotificationsOpen(false)
        setAccountOpen(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [notificationsOpen, accountOpen])

  function markPendingSeen() {
    if (!pending.length) return
    setSeenIds((prev) => {
      const next = new Set(prev)
      pending.forEach((request) => next.add(String(request.requestId)))
      const trimmed = [...next].slice(-200)
      writeSeenIds(trimmed)
      return new Set(trimmed)
    })
  }

  function toggleNotifications() {
    setAccountOpen(false)
    setNotificationsOpen((wasOpen) => {
      const next = !wasOpen
      if (next) markPendingSeen()
      return next
    })
  }

  function toggleAccount() {
    setNotificationsOpen(false)
    setAccountOpen((wasOpen) => !wasOpen)
  }

  function openRequests() {
    setNotificationsOpen(false)
    markPendingSeen()
    onOpenStockRequests?.()
  }

  function openForgotPassword() {
    setAccountOpen(false)
    setResetError('')
    setResetSent(false)
    setForgotOpen(true)
  }

  function closeForgotPassword() {
    if (resetBusy) return
    setForgotOpen(false)
    setResetError('')
    setResetSent(false)
  }

  async function submitPasswordReset(e) {
    e.preventDefault()
    setResetBusy(true)
    setResetError('')
    setResetSent(false)
    try {
      if (!firebaseConfigured) {
        throw new Error('Firebase is not configured in this environment.')
      }
      await sendPasswordResetForCurrentUser()
      setResetSent(true)
    } catch (err) {
      setResetError(err.message || 'Unable to send password reset email.')
    } finally {
      setResetBusy(false)
    }
  }

  async function handleLogout() {
    setAccountOpen(false)
    await logout?.()
  }

  return (
    <>
      <header>
        <button type="button" className="menu-btn" onClick={menu} aria-label="Open menu">☰</button>
        <div className="breadcrumbs">{roleLabel} <span>/</span> <strong>{page}</strong></div>
        <div className="header-actions">
          <div className="notification-wrap" ref={notificationsRef}>
            <button
              type="button"
              className="icon-button notification"
              onClick={toggleNotifications}
              aria-label={unreadCount ? `${unreadCount} unread stock request notifications` : 'Notifications'}
              aria-expanded={notificationsOpen}
              aria-haspopup="true"
            >
              <Icon name="bell" size={18} />
              {unreadCount > 0 && <i aria-hidden="true" />}
            </button>
            {notificationsOpen && (
              <div className="notification-panel" role="menu">
                <div className="notification-panel-head">
                  <div>
                    <strong>Notifications</strong>
                    <p>
                      {pending.length
                        ? `${pending.length} pending stock request${pending.length === 1 ? '' : 's'}`
                        : 'No pending stock requests'}
                    </p>
                  </div>
                  {pending.length > 0 && (
                    <button type="button" className="notification-link" onClick={openRequests}>
                      View all
                    </button>
                  )}
                </div>
                <div className="notification-list">
                  {pending.length === 0 ? (
                    <div className="notification-empty">You are caught up. New requests from external systems will appear here.</div>
                  ) : (
                    pending.slice(0, 8).map((request) => (
                      <button
                        key={request.requestId}
                        type="button"
                        className="notification-item"
                        onClick={openRequests}
                      >
                        <span className="notification-dot" aria-hidden="true" />
                        <span className="notification-item-body">
                          <strong>
                            {request.sourceSystem || 'External'} requested stock
                          </strong>
                          <span>{requestLabel(request)} · qty {request.quantity}</span>
                          <small>
                            {request.externalReference ? `${request.externalReference} · ` : ''}
                            {formatDate(request.createdAt || request.requestDate)}
                            {request.requestedBy ? ` · ${request.requestedBy}` : ''}
                          </small>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="account-wrap" ref={accountRef}>
            <button
              type="button"
              className="header-avatar"
              onClick={toggleAccount}
              title="Account menu"
              aria-label="Account menu"
              aria-expanded={accountOpen}
              aria-haspopup="true"
            >
              {initials(admin?.fullName)}
            </button>
            {accountOpen && (
              <div className="account-menu" role="menu">
                <div className="account-menu-head">
                  <strong>{admin?.fullName || 'User'}</strong>
                  <span>{accountEmail || 'No email on file'}</span>
                </div>
                <button type="button" role="menuitem" onClick={openForgotPassword}>
                  Forgot password
                </button>
                <button type="button" role="menuitem" className="danger-action" onClick={handleLogout}>
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {forgotOpen && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeForgotPassword()}>
          <form className="modal modal-sm forgot-password-modal" onSubmit={submitPasswordReset}>
            <div className="modal-head">
              <div>
                <h2>Forgot password</h2>
                <p>Firebase will email a password reset link to your signed-in account.</p>
              </div>
              <button type="button" onClick={closeForgotPassword} aria-label="Close">×</button>
            </div>

            <div className="modal-body">
              <label>
                Email
                <input
                  className="readonly-input"
                  type="email"
                  readOnly
                  value={accountEmail}
                  title="Email is taken from your signed-in account and cannot be edited"
                />
                <small className="field-hint">This email is locked to your current session and cannot be changed here.</small>
              </label>

              {resetError && <div className="page-error">{resetError}</div>}
              {resetSent && (
                <div className="integration-note">
                  Password reset email sent to <strong>{accountEmail}</strong>. Check your inbox (and spam folder).
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary" onClick={closeForgotPassword} disabled={resetBusy}>
                {resetSent ? 'Close' : 'Cancel'}
              </button>
              {!resetSent && (
                <button type="submit" className="primary" disabled={resetBusy || !accountEmail}>
                  {resetBusy ? 'Sending…' : 'Reset password'}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </>
  )
}
