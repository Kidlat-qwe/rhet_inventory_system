import { useState } from 'react'
import { ActionsMenu } from '../../components/ActionsMenu'
import { Pagination } from '../../components/Pagination'
import { StatusBadge } from '../../components/StatusBadge'
import { usePagination } from '../../hooks/usePagination'
import { baseUrl } from '../../services/api'
import { createIntegrationClient, regenerateIntegrationApiKey, revokeIntegrationApiKey } from '../../services/inventoryApi'
import { formatDate } from '../../utils/format'

const integrationApiUrl = `${baseUrl.replace(/\/+$/, '')}/integrations`

export default function AdminApiKeys({ clients, onRefresh }) {
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [systemName, setSystemName] = useState('')
  const [expiration, setExpiration] = useState('none')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revealed, setRevealed] = useState(null)
  const [copiedField, setCopiedField] = useState('')
  const { page, setPage, pageItems, total } = usePagination(clients, 15)

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
    setCopiedField('')
    setError('')
  }

  async function copyValue(value, field) {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(field)
    } catch {
      setError('Unable to copy automatically. Select the value and copy it manually.')
    }
  }

  function openRevealFromResult(result, fallback = {}) {
    const apiKey = result?.apiKey || result?.client?.apiKey || ''
    if (!apiKey) {
      throw new Error('API key was created, but the server did not return the full key.')
    }
    setShowGenerateModal(false)
    setSystemName('')
    setExpiration('none')
    setCopiedField('')
    setError('')
    setRevealed({
      systemCode: result.client?.systemCode || fallback.systemCode || '',
      displayName: result.client?.displayName || fallback.displayName || '',
      apiKey,
      expiresAt: result.client?.apiKeyExpiresAt || null,
    })
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
      openRevealFromResult(result, { systemCode, displayName })
      await onRefresh?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function regenerateKey(client) {
    if (!client?.systemCode) return
    const confirmed = window.confirm(
      `Regenerate API key for ${client.displayName || client.systemCode}? The previous key will stop working immediately.`,
    )
    if (!confirmed) return

    setBusy(true)
    setError('')
    try {
      const result = await regenerateIntegrationApiKey(client.systemCode)
      openRevealFromResult(result, {
        systemCode: client.systemCode,
        displayName: client.displayName,
      })
      await onRefresh?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function revokeKey(client) {
    if (!client?.hasApiKey) return
    const confirmed = window.confirm(
      `Revoke API key for ${client.displayName || client.systemCode}? External systems using this key will stop working immediately.`,
    )
    if (!confirmed) return

    setBusy(true)
    setError('')
    try {
      await revokeIntegrationApiKey(client.systemCode)
      await onRefresh?.()
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
              {clients.length ? pageItems.map((client) => (
                <tr key={client.clientId || client.systemCode}>
                  <td><strong>{client.systemCode}</strong></td>
                  <td>{client.displayName}</td>
                  <td><code className="api-key-prefix">{client.apiKeyPrefix || '—'}</code></td>
                  <td className="muted">{formatDate(client.apiKeyCreatedAt)}</td>
                  <td className="muted">{client.hasApiKey ? formatExpiration(client.apiKeyExpiresAt) : '—'}</td>
                  <td><StatusBadge status={client.isExpired ? 'EXPIRED' : client.status} /></td>
                  <td className="muted">{formatDate(client.createdAt)}</td>
                  <td>
                    <ActionsMenu
                      label={`Actions for ${client.systemCode}`}
                      disabled={busy}
                      items={[
                        { key: 'regenerate', label: 'Regenerate API key', onClick: () => regenerateKey(client) },
                        { key: 'revoke', label: 'Revoke API key', danger: true, disabled: !client.hasApiKey, onClick: () => revokeKey(client) },
                      ]}
                    />
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
        <Pagination page={page} pageSize={15} total={total} onPageChange={setPage} noun="systems" />
      </section>

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
              After generating, a copy modal will show the API URL and full key for your external system <code>.env</code>.
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
          <div className="modal api-key-modal">
            <div className="modal-head">
              <div>
                <h2>API key created</h2>
                <p>{revealed.displayName} ({revealed.systemCode})</p>
              </div>
              <button type="button" onClick={closeRevealModal}>×</button>
            </div>
            <div className="integration-note warn">
              This API key is shown only in this modal. Copy the configuration before closing it.
            </div>
            <div className="api-config-field">
              <label htmlFor="integration-api-url">Inventory API URL</label>
              <div>
                <input id="integration-api-url" readOnly value={integrationApiUrl} onFocus={(event) => event.target.select()} />
                <button type="button" className="secondary" onClick={() => copyValue(integrationApiUrl, 'url')}>
                  {copiedField === 'url' ? 'Copied' : 'Copy URL'}
                </button>
              </div>
            </div>
            <div className="api-config-field">
              <label htmlFor="integration-api-key">Inventory API key</label>
              <div>
                <input id="integration-api-key" readOnly value={revealed.apiKey || ''} onFocus={(event) => event.target.select()} />
                <button type="button" className="secondary" onClick={() => copyValue(revealed.apiKey, 'key')} disabled={!revealed.apiKey}>
                  {copiedField === 'key' ? 'Copied' : 'Copy key'}
                </button>
              </div>
            </div>
            <div className="api-env-block">
              <span>External system <code>.env</code></span>
              <pre>{`INVENTORY_API_URL=${integrationApiUrl}
INVENTORY_API_KEY=${revealed.apiKey || ''}`}</pre>
              <button
                type="button"
                className="primary"
                onClick={() => copyValue(
                  `INVENTORY_API_URL=${integrationApiUrl}\nINVENTORY_API_KEY=${revealed.apiKey || ''}`,
                  'env',
                )}
                disabled={!revealed.apiKey}
              >
                {copiedField === 'env' ? 'Configuration copied' : 'Copy .env configuration'}
              </button>
            </div>
            <div className="integration-note">
              Expiration: <strong>{formatExpiration(revealed.expiresAt)}</strong>
            </div>
            {error && <div className="page-error">{error}</div>}
            <div className="integration-note">
              Store these values only in the external system backend. Send the key as <code>X-Integration-Key</code>.
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
