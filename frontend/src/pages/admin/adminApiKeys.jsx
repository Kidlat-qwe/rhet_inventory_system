import { useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { StatusBadge } from '../../components/StatusBadge'
import { createIntegrationClient, revokeIntegrationApiKey } from '../../services/inventoryApi'
import { formatDate } from '../../utils/format'

export default function AdminApiKeys({ clients, onRefresh }) {
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [systemName, setSystemName] = useState('')
  const [expiration, setExpiration] = useState('none')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revealed, setRevealed] = useState(null)
  const [copied, setCopied] = useState(false)
  const [menuOpenFor, setMenuOpenFor] = useState(null)

  function deriveSystemCode(name) {
    return name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50)
  }

  function formatExpiration(value) {
    if (!value) return 'No expiration'
    return formatDate(value)
  }

  function openGenerateModal() {
    setSystemName('')
    setExpiration('none')
    setError('')
    setMenuOpenFor(null)
    setShowGenerateModal(true)
  }

  function closeGenerateModal() {
    if (busy) return
    setShowGenerateModal(false)
    setSystemName('')
    setExpiration('none')
    setError('')
  }

  function closeRevealModal() {
    setRevealed(null)
    setCopied(false)
  }

  async function copyKeyOnce() {
    if (!revealed?.apiKey || copied) return
    try {
      await navigator.clipboard.writeText(revealed.apiKey)
      setCopied(true)
      setRevealed((current) => (current ? { ...current, apiKey: null } : null))
    } catch {
      setError('Unable to copy. Select the key and copy it manually, then close this dialog.')
    }
  }

  async function submit(e) {
    e.preventDefault()
    setError('')

    const displayName = systemName.trim()
    if (!displayName) {
      setError('System name is required')
      return
    }

    const systemCode = deriveSystemCode(displayName)
    if (!systemCode || systemCode.length < 2) {
      setError('System name must contain at least 2 letters or numbers')
      return
    }

    setBusy(true)
    try {
      const result = await createIntegrationClient({
        systemCode,
        displayName,
        description: null,
        webhookUrl: null,
        expiration,
      })
      setShowGenerateModal(false)
      setSystemName('')
      setExpiration('none')
      setCopied(false)
      setRevealed({
        systemCode: result.client?.systemCode || systemCode,
        displayName: result.client?.displayName || displayName,
        apiKey: result.apiKey,
        expiresAt: result.client?.apiKeyExpiresAt || null,
      })
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function revokeKey(client) {
    if (!client?.hasApiKey) return
    const confirmed = window.confirm(`Revoke API key for ${client.displayName || client.systemCode}? External systems using this key will stop working immediately.`)
    if (!confirmed) {
      setMenuOpenFor(null)
      return
    }

    setBusy(true)
    setError('')
    setMenuOpenFor(null)
    try {
      await revokeIntegrationApiKey(client.systemCode)
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
          <h1>API Keys</h1>
          <p>Generate API keys for external systems. Keys are shown once and must be sent as <code>X-Integration-Key</code>.</p>
        </div>
        <button type="button" className="primary" onClick={openGenerateModal}>Generate API key</button>
      </div>

      {error && !showGenerateModal && !revealed && <div className="page-error">{error}</div>}

      <section className="panel recent">
        <div className="panel-head">
          <div>
            <h2>Integration API keys</h2>
            <p>{clients.length} system{clients.length === 1 ? '' : 's'} registered</p>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg table-scroll" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: '900px' }}>
            <thead>
              <tr>
                <th>System code</th>
                <th>Display name</th>
                <th>Key prefix</th>
                <th>Key created</th>
                <th>Expires</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.length ? clients.map((client) => (
                <tr key={client.clientId || client.systemCode}>
                  <td><strong>{client.systemCode}</strong></td>
                  <td>{client.displayName}</td>
                  <td><code className="api-key-prefix">{client.apiKeyPrefix || '—'}</code></td>
                  <td className="muted">{formatDate(client.apiKeyCreatedAt)}</td>
                  <td className="muted">{client.hasApiKey ? formatExpiration(client.apiKeyExpiresAt) : '—'}</td>
                  <td><StatusBadge status={client.isExpired ? 'EXPIRED' : client.status} /></td>
                  <td className="muted">{formatDate(client.createdAt)}</td>
                  <td>
                    <div className="actions-menu">
                      <button
                        type="button"
                        className="dots"
                        aria-label={`Actions for ${client.systemCode}`}
                        disabled={busy}
                        onClick={() => setMenuOpenFor((current) => (current === client.systemCode ? null : client.systemCode))}
                      >
                        •••
                      </button>
                      {menuOpenFor === client.systemCode && (
                        <div className="actions-dropdown">
                          <button
                            type="button"
                            className="danger-action"
                            disabled={!client.hasApiKey || busy}
                            onClick={() => revokeKey(client)}
                          >
                            Revoke API key
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={8} className="table-empty-cell">
                    No API keys generated yet. Click <strong>Generate API key</strong> to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {menuOpenFor && (
        <button type="button" className="actions-menu-overlay" aria-label="Close actions menu" onClick={() => setMenuOpenFor(null)} />
      )}

      {showGenerateModal && (
        <div className="modal-backdrop">
          <form className="modal small" onSubmit={submit}>
            <div className="modal-head">
              <div>
                <h2>Generate API key</h2>
                <p>Enter the external system name and choose how long the key remains valid.</p>
              </div>
              <button type="button" onClick={closeGenerateModal}>×</button>
            </div>
            <label>
              System name *
              <input
                autoFocus
                required
                value={systemName}
                onChange={(e) => setSystemName(e.target.value)}
                placeholder="e.g. PSMS, MerchandisePortal, VendorApp"
              />
            </label>
            <label>
              Expiration *
              <select required value={expiration} onChange={(e) => setExpiration(e.target.value)}>
                <option value="7d">7 days</option>
                <option value="1m">1 month</option>
                <option value="none">No expiration</option>
              </select>
            </label>
            {error && <div className="page-error">{error}</div>}
            <div className="integration-note warn">
              After generating, copy the key immediately and paste it into the external system backend <code>.env</code> as <code>INVENTORY_INTEGRATION_KEY</code>.
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={closeGenerateModal} disabled={busy}>Cancel</button>
              <button type="submit" className="primary" disabled={busy}>{busy ? 'Generating…' : 'Generate API key'}</button>
            </div>
          </form>
        </div>
      )}

      {revealed && (
        <div className="modal-backdrop">
          <div className="modal small">
            <div className="modal-head">
              <div>
                <h2>API key created</h2>
                <p>{revealed.displayName} ({revealed.systemCode})</p>
              </div>
              <button type="button" onClick={closeRevealModal}>×</button>
            </div>
            <div className="api-key-reveal">
              <span>{copied ? 'Key copied' : 'Copy this key now'}</span>
              <code>{copied ? '••••••••••••••••••••••••••••••••' : revealed.apiKey}</code>
              <button type="button" className="secondary" onClick={copyKeyOnce} disabled={copied || !revealed.apiKey}>
                {copied ? 'Copied once' : 'Copy API key'}
              </button>
            </div>
            <div className="integration-note">
              Expiration: <strong>{formatExpiration(revealed.expiresAt)}</strong>
            </div>
            {error && <div className="page-error">{error}</div>}
            <div className={`integration-note ${copied ? '' : 'warn'}`}>
              {copied
                ? 'This key will not be shown again. Store it in your external system backend only.'
                : 'You can copy this key only once. After copying, it will be hidden permanently from this screen.'}
            </div>
            <div className="modal-actions">
              <button type="button" className="primary" onClick={closeRevealModal}>Done</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
