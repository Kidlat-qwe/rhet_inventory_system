import { useMemo, useState } from 'react'
import { normalizeInventoryText } from '../utils/format'

/**
 * Add / link a raw child under a Tool Kit parent.
 * If the typed name matches an existing shared raw SKU, defaults to linking it
 * so gs-toolkits and nc-kg-toolkits can share one stock pool.
 */
export function ToolKitRawItemModal({
  parentItem,
  existingRawItems = [],
  busy,
  error,
  onClose,
  onSave,
}) {
  const [form, setForm] = useState({
    itemName: '',
    variation: '',
    stocks: 0,
  })
  const [mode, setMode] = useState('auto') // auto | link | create
  const [pickedId, setPickedId] = useState('')
  const [localError, setLocalError] = useState('')

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const alreadyOnParent = useMemo(() => {
    const ids = new Set(
      (parentItem?.components || [])
        .map((row) => row.inventoryId || row.componentInventoryId)
        .filter(Boolean),
    )
    return ids
  }, [parentItem])

  const availableRawItems = useMemo(
    () => existingRawItems.filter((entry) => !alreadyOnParent.has(entry.inventoryId)),
    [existingRawItems, alreadyOnParent],
  )

  const nameMatch = useMemo(() => {
    const name = normalizeInventoryText(form.itemName, { trimEdges: true })
    if (name.length < 2) return null
    return availableRawItems.find(
      (entry) => normalizeInventoryText(entry.itemName, { trimEdges: true }) === name,
    ) || null
  }, [form.itemName, availableRawItems])

  const effectiveMode = mode === 'auto'
    ? (nameMatch ? 'link' : 'create')
    : mode

  const selectedExisting = effectiveMode === 'link'
    ? (pickedId
      ? availableRawItems.find((entry) => entry.inventoryId === pickedId) || null
      : nameMatch)
    : null

  function submit(e) {
    e.preventDefault()
    setLocalError('')
    const itemName = normalizeInventoryText(form.itemName, { trimEdges: true })

    if (effectiveMode === 'link') {
      const target = selectedExisting
      if (!target) {
        setLocalError('Select an existing raw item to share, or create a new one.')
        return
      }
      onSave({
        mode: 'link',
        inventoryId: target.inventoryId,
        itemName: target.itemName,
      })
      return
    }

    if (itemName.length < 2) {
      setLocalError('Item name must be at least 2 characters.')
      return
    }

    onSave({
      mode: 'create',
      forceCreate: Boolean(nameMatch),
      itemName,
      variation: normalizeInventoryText(form.variation || '', { trimEdges: true }) || null,
      stocks: Number(form.stocks) || 0,
    })
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="modal modal-sm kit-raw-modal" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <h2>Add raw item</h2>
            <p>
              Add a raw child SKU for <strong>{parentItem?.itemName || 'this Tool Kit'}</strong>.
              Shared parts (e.g. pencil) keep one stock pool across kits.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy}>×</button>
        </div>

        {availableRawItems.length > 0 && (
          <div className="kit-raw-mode-tabs">
            <button
              type="button"
              className={effectiveMode === 'create' && mode !== 'link' ? 'selected' : ''}
              disabled={busy}
              onClick={() => { setMode('create'); setPickedId('') }}
            >
              Create new
            </button>
            <button
              type="button"
              className={effectiveMode === 'link' ? 'selected' : ''}
              disabled={busy}
              onClick={() => { setMode('link'); setPickedId(nameMatch?.inventoryId || availableRawItems[0]?.inventoryId || '') }}
            >
              Use existing
            </button>
          </div>
        )}

        <div className="form-grid">
          {effectiveMode === 'link' ? (
            <label className="full-width">
              Existing raw item *
              <select
                required
                value={selectedExisting?.inventoryId || ''}
                onChange={(e) => {
                  setMode('link')
                  setPickedId(e.target.value)
                  const match = availableRawItems.find((entry) => entry.inventoryId === e.target.value)
                  if (match) set('itemName', match.itemName)
                }}
                disabled={busy}
              >
                <option value="">Select raw item</option>
                {availableRawItems.map((entry) => (
                  <option key={entry.inventoryId} value={entry.inventoryId}>
                    {entry.itemName} · {entry.sku} · stock {Number(entry.stocks) || 0}
                  </option>
                ))}
              </select>
              <small className="field-hint">
                Links the same SKU to this kit. Stock stays shared with other Tool Kits that use it.
              </small>
            </label>
          ) : (
            <>
              <label className="full-width">
                Item name *
                <input
                  required
                  minLength={2}
                  value={form.itemName}
                  onChange={(e) => {
                    setMode('auto')
                    set('itemName', normalizeInventoryText(e.target.value))
                  }}
                  placeholder="e.g. notebook"
                  disabled={busy}
                  autoFocus
                />
                <small className="field-hint">Lowercase only. Spaces become underscores (e.g. blue_notebook).</small>
              </label>
              {nameMatch && (
                <div className="kit-raw-match-banner full-width">
                  <p>
                    <strong>{nameMatch.itemName}</strong> already exists
                    ({nameMatch.sku}, stock {Number(nameMatch.stocks) || 0}).
                  </p>
                  <div className="kit-raw-match-actions">
                    <button
                      type="button"
                      className="primary"
                      disabled={busy}
                      onClick={() => { setMode('link'); setPickedId(nameMatch.inventoryId) }}
                    >
                      Use existing
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => setMode('create')}
                    >
                      Create as new anyway
                    </button>
                  </div>
                </div>
              )}
              {(!nameMatch || mode === 'create') && (
                <>
                  <label>
                    Variation
                    <input
                      value={form.variation}
                      onChange={(e) => set('variation', normalizeInventoryText(e.target.value))}
                      placeholder="optional"
                      disabled={busy}
                    />
                  </label>
                  <label>
                    Initial stock *
                    <input
                      required
                      type="number"
                      min="0"
                      value={form.stocks}
                      onChange={(e) => set('stocks', e.target.value)}
                      disabled={busy}
                    />
                  </label>
                </>
              )}
            </>
          )}
        </div>

        {(localError || error) && <p className="form-error">{localError || error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            className="primary"
            disabled={busy}
            onClick={(e) => {
              // If a name match exists and user hasn't chosen create, submit as link.
              if (nameMatch && mode === 'auto') {
                e.preventDefault()
                setLocalError('')
                onSave({
                  mode: 'link',
                  inventoryId: nameMatch.inventoryId,
                  itemName: nameMatch.itemName,
                })
              }
            }}
          >
            {busy
              ? 'Saving…'
              : (nameMatch && mode === 'auto') || effectiveMode === 'link'
                ? 'Use existing raw item'
                : 'Add raw item'}
          </button>
        </div>
      </form>
    </div>
  )
}
