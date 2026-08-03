import { Fragment, useMemo, useRef, useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { Pagination } from '../../components/Pagination'
import { StatusBadge } from '../../components/StatusBadge'
import { usePagination } from '../../hooks/usePagination'
import {
  cancelOnlineOrder,
  confirmOnlineOrderReturn,
  createManualOnlineOrder,
  fetchOnlineOrder,
  importOnlineOrdersCsv,
  previewOnlineOrdersCsv,
  resolveOnlineOrderItem,
  updateOnlineOrderFulfillmentStatus,
} from '../../services/onlineOrdersApi'
import { formatCurrency, formatDate, formatStatus } from '../../utils/format'

const EMPTY_MANUAL_ITEM = {
  externalSku: '',
  externalItemName: '',
  externalVariation: '',
  quantity: 1,
  unitPrice: 0,
}

// Delivery board tabs for Online Orders. Pre-ship statuses (Processing /
// Ready to ship) still exist in the API for CSV sync, but the board shows
// Shipped / Delivered / Returned only. Cancelled orders are filtered out of
// these tabs.
const FULFILLMENT_COLUMNS = [
  'SHIPPED',
  'DELIVERED',
  'RETURNED',
]

const NEXT_FULFILLMENT_ACTION = {
  PROCESSING: { status: 'SHIPPED', label: 'Mark shipped' },
  READY_TO_SHIP: { status: 'SHIPPED', label: 'Mark shipped' },
  SHIPPED: { status: 'DELIVERED', label: 'Mark delivered' },
}

function matchesFulfillmentTab(order, tab) {
  const status = order?.fulfillmentStatus
  if (tab === 'SHIPPED') {
    return ['PROCESSING', 'READY_TO_SHIP', 'SHIPPED'].includes(status)
  }
  return status === tab
}

function detailValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  return value
}

function canResolveLine(line) {
  return line?.lineStatus === 'UNMATCHED' || line?.lineStatus === 'OVERSOLD'
}

function emptyMapRow(quantity = 1) {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    categoryName: '',
    inventoryId: '',
    quantity: Math.max(1, Number(quantity) || 1),
  }
}

function formatMatchedSku(line) {
  const matches = line?.inventoryMatches || []
  if (matches.length > 1) {
    return matches.map((match) => `${match.sku || '—'} ×${match.quantity}`).join(', ')
  }
  if (matches.length === 1) {
    return matches[0].sku || line.matchedSku || '—'
  }
  return detailValue(line?.matchedSku)
}

export default function OnlineOrdersPage({ orders, inventory, onRefresh, canManage = false }) {
  const [filter, setFilter] = useState('SHIPPED')
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [mode, setMode] = useState('details')
  const [resolveMatches, setResolveMatches] = useState([])
  const [resolveItemId, setResolveItemId] = useState('')
  const [returnReusable, setReturnReusable] = useState('true')
  const [returnNotes, setReturnNotes] = useState('')
  const [showReturnForm, setShowReturnForm] = useState(false)
  const [manualForm, setManualForm] = useState({
    externalOrderId: '',
    buyerName: '',
    notes: '',
    items: [{ ...EMPTY_MANUAL_ITEM }],
  })
  const [importPreview, setImportPreview] = useState(null)
  const [importPayload, setImportPayload] = useState(null)
  const [importFileName, setImportFileName] = useState('')
  const fileInputRef = useRef(null)

  const shown = useMemo(() => {
    if (!filter) return orders
    return orders.filter((order) => matchesFulfillmentTab(order, filter))
  }, [orders, filter])

  const { page, setPage, pageItems, total } = usePagination(shown, 15)

  const attentionCount = useMemo(
    () => orders.filter((order) => order.orderStatus === 'NEEDS_ATTENTION').length,
    [orders],
  )

  const tabCounts = useMemo(() => Object.fromEntries(
    FULFILLMENT_COLUMNS.map((status) => [
      status,
      orders.filter((order) => matchesFulfillmentTab(order, status)).length,
    ]),
  ), [orders])

  const inventoryByCategory = useMemo(() => {
    const groups = new Map()
    for (const item of inventory || []) {
      const category = String(item.categoryName || 'Uncategorized').trim() || 'Uncategorized'
      if (!groups.has(category)) groups.set(category, [])
      groups.get(category).push(item)
    }
    return [...groups.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([categoryName, items]) => ({
        categoryName,
        items: [...items].sort((a, b) => String(a.itemName || '').localeCompare(String(b.itemName || ''))),
      }))
  }, [inventory])

  const categoryOptions = useMemo(
    () => inventoryByCategory.map((group) => group.categoryName),
    [inventoryByCategory],
  )

  const itemsByCategoryName = useMemo(() => {
    const map = new Map()
    for (const group of inventoryByCategory) {
      map.set(group.categoryName, group.items)
    }
    return map
  }, [inventoryByCategory])

  function resetResolveState() {
    setResolveItemId('')
    setResolveMatches([])
  }

  function openMapConfig(line) {
    setError('')
    setResolveItemId(line.orderItemId)
    setResolveMatches([emptyMapRow(line.quantity)])
  }

  function updateResolveMatch(key, field, value) {
    setResolveMatches((prev) => prev.map((row) => {
      if (row.key !== key) return row
      if (field === 'categoryName') {
        return { ...row, categoryName: value, inventoryId: '' }
      }
      return { ...row, [field]: value }
    }))
  }

  function addResolveMatch(lineQuantity) {
    setResolveMatches((prev) => [...prev, emptyMapRow(lineQuantity)])
  }

  function removeResolveMatch(key) {
    setResolveMatches((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.key !== key)))
  }

  async function openDetails(order) {
    setError('')
    setMode('details')
    resetResolveState()
    setReturnReusable('true')
    setReturnNotes('')
    setShowReturnForm(false)
    setBusyId(order.orderId)
    try {
      setSelected(await fetchOnlineOrder(order.orderId))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  function closeModal() {
    if (busyId) return
    setSelected(null)
    setMode('details')
    setShowReturnForm(false)
    resetResolveState()
  }

  function closeImportPreview() {
    if (busyId === 'import' || busyId === 'import-preview') return
    setImportPreview(null)
    setImportPayload(null)
    setImportFileName('')
  }

  async function readImportPayload(file) {
    const lower = String(file.name || '').toLowerCase()
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      const chunkSize = 0x8000
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
      }
      return {
        fileBase64: btoa(binary),
        fileName: file.name,
      }
    }
    return {
      csvText: await file.text(),
      fileName: file.name,
    }
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setBusyId('import-preview')
    setError('')
    try {
      const payload = await readImportPayload(file)
      const preview = await previewOnlineOrdersCsv(payload)
      setImportPayload(payload)
      setImportFileName(file.name)
      setImportPreview(preview)
      setMode('import-preview')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  async function confirmImportCsv() {
    if (!importPayload) return
    setBusyId('import')
    setError('')
    try {
      await importOnlineOrdersCsv(importPayload)
      setImportPreview(null)
      setImportPayload(null)
      setImportFileName('')
      setMode('details')
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  function updateManualItem(index, field, value) {
    setManualForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (
        itemIndex === index ? { ...item, [field]: value } : item
      )),
    }))
  }

  function addManualItem() {
    setManualForm((current) => ({
      ...current,
      items: [...current.items, { ...EMPTY_MANUAL_ITEM }],
    }))
  }

  async function submitManualOrder(event) {
    event.preventDefault()
    setBusyId('manual')
    setError('')
    try {
      await createManualOnlineOrder({
        externalOrderId: manualForm.externalOrderId.trim(),
        buyerName: manualForm.buyerName.trim() || null,
        notes: manualForm.notes.trim() || null,
        items: manualForm.items.map((item) => ({
          externalSku: item.externalSku.trim(),
          externalItemName: item.externalItemName.trim() || null,
          externalVariation: item.externalVariation.trim() || '',
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice) || 0,
        })),
      })
      setMode('details')
      setManualForm({
        externalOrderId: '',
        buyerName: '',
        notes: '',
        items: [{ ...EMPTY_MANUAL_ITEM }],
      })
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  async function confirmResolve(itemId) {
    const prepared = resolveMatches
      .map((row) => ({
        inventoryId: row.inventoryId,
        quantity: Number(row.quantity),
      }))
      .filter((row) => row.inventoryId)

    if (!prepared.length) {
      setError('Select at least one RHET inventory item for this Shopee line.')
      return
    }
    if (prepared.some((row) => !Number.isInteger(row.quantity) || row.quantity < 1)) {
      setError('Each mapped item needs a quantity of at least 1.')
      return
    }
    const uniqueIds = new Set(prepared.map((row) => row.inventoryId))
    if (uniqueIds.size !== prepared.length) {
      setError('Remove duplicate inventory items before saving.')
      return
    }

    setBusyId(itemId)
    setError('')
    try {
      const updated = await resolveOnlineOrderItem(itemId, { matches: prepared })
      setSelected(updated)
      resetResolveState()
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  async function confirmCancelOrder() {
    if (!selected?.orderId) return
    setBusyId(selected.orderId)
    setError('')
    try {
      const updated = await cancelOnlineOrder(selected.orderId)
      setSelected(updated)
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  async function moveFulfillment(status) {
    if (!selected?.orderId) return
    setBusyId(`fulfillment-${status}`)
    setError('')
    try {
      const updated = await updateOnlineOrderFulfillmentStatus(selected.orderId, status)
      setSelected(updated)
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  async function submitReturnConfirmation() {
    if (!selected?.orderId) return
    setBusyId('confirm-return')
    setError('')
    try {
      const updated = await confirmOnlineOrderReturn(selected.orderId, returnReusable === 'true', returnNotes.trim() || null)
      setSelected(updated)
      setShowReturnForm(false)
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  const nextAction = selected ? NEXT_FULFILLMENT_ACTION[selected.fulfillmentStatus] : null
  const canMarkReturn = selected && ['SHIPPED', 'DELIVERED'].includes(selected.fulfillmentStatus)

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Online orders</h1>
          <p>
            Fulfillment board for Shopee CSV/XLSX imports. Stock is deducted when an order is marked
            <strong> Shipped</strong> (mapped lines only). Map unmatched items before shipping.
          </p>
        </div>
        {canManage && (
          <div className="page-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              hidden
              onChange={handleImportFile}
            />
            <button type="button" className="secondary" disabled={busyId === 'import' || busyId === 'import-preview'} onClick={() => fileInputRef.current?.click()}>
              {busyId === 'import-preview' ? 'Reading…' : busyId === 'import' ? 'Importing…' : 'Import orders'}
            </button>
            <button type="button" className="primary" onClick={() => { setError(''); setMode('manual') }}>
              Add order
            </button>
          </div>
        )}
      </div>

      <div className="quick-filters">
        {FULFILLMENT_COLUMNS.map((status) => (
          <button
            key={status}
            type="button"
            className={filter === status ? 'selected' : ''}
            onClick={() => { setFilter(status); setPage(1) }}
          >
            <span>{tabCounts[status] || 0}</span>
            {formatStatus(status)}
          </button>
        ))}
        {attentionCount > 0 && (
          <span className="muted">{attentionCount} order(s) need SKU mapping</span>
        )}
      </div>

      {error && !selected && mode === 'details' && !importPreview && <div className="page-error">{error}</div>}

      <section className="panel recent">
        <div className="overflow-x-auto rounded-lg table-scroll" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: '1150px' }}>
            <thead>
              <tr>
                <th>Order #</th>
                <th>Channel</th>
                <th>Buyer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Delivery status</th>
                <th>Match status</th>
                <th>Placed</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length ? pageItems.map((order) => (
                <tr key={order.orderId}>
                  <td>
                    <strong>{order.externalOrderId}</strong>
                    <small>{order.source?.replaceAll('_', ' ')}</small>
                  </td>
                  <td>{order.channel}</td>
                  <td>{detailValue(order.buyerName)}</td>
                  <td>
                    <strong>{order.itemCount ?? '—'}</strong>
                    {order.attentionCount > 0 && <small>{order.attentionCount} need attention</small>}
                  </td>
                  <td>{formatCurrency(order.totalAmount)}</td>
                  <td><StatusBadge status={order.fulfillmentStatus} /></td>
                  <td><StatusBadge status={order.orderStatus} /></td>
                  <td className="muted">{formatDate(order.orderPlacedAt || order.createdAt)}</td>
                  <td>
                    <button
                      type="button"
                      className={order.orderStatus === 'NEEDS_ATTENTION' ? 'primary small-btn' : 'secondary small-btn'}
                      disabled={busyId === order.orderId}
                      onClick={() => openDetails(order)}
                    >
                      {busyId === order.orderId ? 'Loading…' : order.orderStatus === 'NEEDS_ATTENTION' ? 'Review' : 'View'}
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={9}>
                    <EmptyState
                      title={`No orders in ${formatStatus(filter).toLowerCase()}`}
                      message={canManage ? 'Import a Shopee CSV/XLSX export or add an order manually to start tracking fulfillment.' : 'Online orders will appear here once they are imported.'}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <Pagination page={page} pageSize={15} total={total} onPageChange={setPage} noun="orders" />
        </div>
      </section>

      {mode === 'import-preview' && canManage && importPreview && (
        <div className="modal-backdrop">
          <div className="modal request-detail-modal import-preview-modal">
            <div className="modal-head">
              <div>
                <h2>Confirm import</h2>
                <p>
                  Review the parsed Shopee export before saving.
                  {importFileName ? ` File: ${importFileName}` : ''}
                </p>
              </div>
              <button type="button" onClick={() => { closeImportPreview(); setMode('details') }} disabled={busyId === 'import'}>×</button>
            </div>

            <div className="request-detail-grid">
              <div><span>Orders</span><strong>{importPreview.summary?.orderCount ?? 0}</strong></div>
              <div><span>New</span><strong>{importPreview.summary?.newCount ?? 0}</strong></div>
              <div><span>Existing updates</span><strong>{importPreview.summary?.updateCount ?? 0}</strong></div>
              <div><span>Line items</span><strong>{importPreview.summary?.itemCount ?? 0}</strong></div>
              <div><span>Fulfillment changes</span><strong>{importPreview.summary?.fulfillmentChangeCount ?? 0}</strong></div>
              <div>
                <span>Unmapped status text</span>
                <strong>{importPreview.summary?.unmappedStatusCount ?? 0}</strong>
              </div>
            </div>

            <p className="field-hint" style={{ margin: '0 23px 12px' }}>
              Delivery status follows the Shopee export when it advances. Entering <strong>Shipped</strong> deducts
              mapped RHET stock; unmatched lines or insufficient stock keep the previous status until fixed.
              Same status stays unchanged.
            </p>

            <div className="overflow-x-auto rounded-lg table-scroll" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', minWidth: '920px' }}>
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Buyer</th>
                    <th>Items</th>
                    <th>Shopee status</th>
                    <th>Current</th>
                    <th>After import</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(importPreview.orders || []).map((row) => (
                    <tr key={row.externalOrderId}>
                      <td><strong>{row.externalOrderId}</strong></td>
                      <td>{detailValue(row.buyerName)}</td>
                      <td>{row.itemCount}</td>
                      <td>{detailValue(row.externalOrderStatus)}</td>
                      <td>
                        {row.isNew ? <span className="muted">—</span> : <StatusBadge status={row.currentFulfillmentStatus} />}
                      </td>
                      <td><StatusBadge status={row.resultingFulfillmentStatus} /></td>
                      <td>
                        {row.isNew ? 'New order' : row.fulfillmentWillChange
                          ? `${formatStatus(row.currentFulfillmentStatus)} → ${formatStatus(row.proposedFulfillmentStatus)}`
                          : 'Update details'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {error && <div className="page-error">{error}</div>}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={busyId === 'import'}
                onClick={() => { closeImportPreview(); setMode('details'); setError('') }}
              >
                Cancel
              </button>
              <button type="button" className="primary" disabled={busyId === 'import'} onClick={confirmImportCsv}>
                {busyId === 'import' ? 'Importing…' : 'Confirm import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {mode === 'manual' && canManage && (
        <div className="modal-backdrop">
          <form className="modal request-detail-modal" onSubmit={submitManualOrder}>
            <div className="modal-head">
              <div>
                <h2>Add online order</h2>
                <p>Record a Shopee order manually when live API sync is not available yet.</p>
              </div>
              <button type="button" onClick={() => setMode('details')}>×</button>
            </div>

            <div className="request-detail-grid">
              <label>
                <span>Order number *</span>
                <input required value={manualForm.externalOrderId} onChange={(e) => setManualForm((current) => ({ ...current, externalOrderId: e.target.value }))} />
              </label>
              <label>
                <span>Buyer name</span>
                <input value={manualForm.buyerName} onChange={(e) => setManualForm((current) => ({ ...current, buyerName: e.target.value }))} />
              </label>
              <label className="full">
                <span>Notes</span>
                <textarea value={manualForm.notes} onChange={(e) => setManualForm((current) => ({ ...current, notes: e.target.value }))} />
              </label>
            </div>

            {manualForm.items.map((item, index) => (
              <div key={`manual-item-${index}`} className="request-detail-grid">
                <label>
                  <span>Shopee SKU *</span>
                  <input required value={item.externalSku} onChange={(e) => updateManualItem(index, 'externalSku', e.target.value)} />
                </label>
                <label>
                  <span>Item name</span>
                  <input value={item.externalItemName} onChange={(e) => updateManualItem(index, 'externalItemName', e.target.value)} />
                </label>
                <label>
                  <span>Variation</span>
                  <input value={item.externalVariation} onChange={(e) => updateManualItem(index, 'externalVariation', e.target.value)} />
                </label>
                <label>
                  <span>Quantity *</span>
                  <input required type="number" min="1" value={item.quantity} onChange={(e) => updateManualItem(index, 'quantity', e.target.value)} />
                </label>
                <label>
                  <span>Unit price</span>
                  <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateManualItem(index, 'unitPrice', e.target.value)} />
                </label>
              </div>
            ))}

            <div className="modal-actions">
              <button type="button" className="secondary" onClick={addManualItem}>Add line item</button>
            </div>

            {error && <div className="page-error">{error}</div>}

            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setMode('details')} disabled={busyId === 'manual'}>Cancel</button>
              <button className="primary" disabled={busyId === 'manual'}>
                {busyId === 'manual' ? 'Saving…' : 'Save order'}
              </button>
            </div>
          </form>
        </div>
      )}

      {selected && mode === 'details' && (
        <div className="modal-backdrop">
          <div className="modal request-detail-modal online-order-detail-modal">
            <div className="modal-head">
              <div>
                <h2>Online order details</h2>
                <p>{selected.externalOrderId} · {selected.channel}</p>
              </div>
              <button type="button" onClick={closeModal}>×</button>
            </div>

            <div className="request-detail-status online-order-detail-status">
              <StatusBadge status={selected.fulfillmentStatus} />
              <StatusBadge status={selected.orderStatus} />
              <span className="muted">Placed {formatDate(selected.orderPlacedAt || selected.createdAt)}</span>
            </div>

            <div className="request-detail-grid online-order-meta-grid">
              <div><span>Buyer</span><strong>{detailValue(selected.buyerName)}</strong></div>
              <div><span>Total</span><strong>{formatCurrency(selected.totalAmount)}</strong></div>
              <div><span>Source</span><strong>{formatStatus(selected.source)}</strong></div>
              <div><span>Imported by</span><strong>{detailValue(selected.importedByName)}</strong></div>
              {selected.notes && <div className="full"><span>Notes</span><strong>{selected.notes}</strong></div>}
              {selected.fulfillmentStatus === 'RETURNED' && (
                <div className="full">
                  <span>Return outcome</span>
                  <strong>{selected.returnReusable ? 'Reusable — stock restored to RHET' : 'Not reusable — stock not restored'}</strong>
                  {selected.returnNotes ? <small>{selected.returnNotes}</small> : null}
                </div>
              )}
            </div>

            <div
              className="overflow-x-auto rounded-lg table-scroll online-order-lines-scroll"
              style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}
            >
              <table className="online-order-lines-table" style={{ width: '100%', minWidth: '980px' }}>
                <thead>
                  <tr>
                    <th>Shopee SKU</th>
                    <th>Item</th>
                    <th>Variation</th>
                    <th>Qty</th>
                    <th>Match status</th>
                    <th>Matched SKU</th>
                    {canManage && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {(selected.items || []).map((line) => {
                    const mappingOpen = canManage && resolveItemId === line.orderItemId
                    const colSpan = canManage ? 7 : 6
                    return (
                      <Fragment key={line.orderItemId}>
                        <tr className={mappingOpen ? 'online-order-line-active' : undefined}>
                          <td><strong>{detailValue(line.externalSku)}</strong></td>
                          <td className="online-order-item-cell">
                            <strong>{detailValue(line.externalItemName)}</strong>
                          </td>
                          <td>{detailValue(line.externalVariation)}</td>
                          <td>{line.quantity}</td>
                          <td><StatusBadge status={line.lineStatus} /></td>
                          <td>
                            <strong>{formatMatchedSku(line)}</strong>
                            {line.failureReason && !mappingOpen && (
                              <small className="danger-text">{line.failureReason}</small>
                            )}
                          </td>
                          {canManage && (
                            <td className="online-order-actions-cell">
                              {canResolveLine(line) ? (
                                mappingOpen ? (
                                  <span className="muted">Configuring…</span>
                                ) : (
                                  <button
                                    type="button"
                                    className="primary small-btn"
                                    onClick={() => openMapConfig(line)}
                                  >
                                    Map item
                                  </button>
                                )
                              ) : '—'}
                            </td>
                          )}
                        </tr>
                        {mappingOpen && (
                          <tr className="online-order-map-config-row">
                            <td colSpan={colSpan}>
                              <div className="online-order-map-config">
                                <div className="online-order-map-config-intro">
                                  <div>
                                    <span>Shopee line</span>
                                    <strong>
                                      {detailValue(line.externalItemName)}
                                      {line.externalVariation ? ` · ${line.externalVariation}` : ''}
                                      {` · qty ${line.quantity}`}
                                    </strong>
                                  </div>
                                  <p className="field-hint">
                                    Bundle listings can map to multiple RHET items. Set each item quantity independently.
                                  </p>
                                </div>

                                <div className="online-order-map-rows">
                                  {resolveMatches.map((row, index) => {
                                    const categoryItems = row.categoryName
                                      ? (itemsByCategoryName.get(row.categoryName) || [])
                                      : []
                                    return (
                                      <div key={row.key} className="online-order-map-row">
                                        <div className="online-order-map-config-field">
                                          <span>{index === 0 ? 'Category' : `Category ${index + 1}`}</span>
                                          <select
                                            value={row.categoryName}
                                            onChange={(e) => updateResolveMatch(row.key, 'categoryName', e.target.value)}
                                          >
                                            <option value="">Select category</option>
                                            {categoryOptions.map((categoryName) => (
                                              <option key={categoryName} value={categoryName}>
                                                {categoryName}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                        <div className="online-order-map-config-field">
                                          <span>Item</span>
                                          <select
                                            value={row.inventoryId}
                                            disabled={!row.categoryName}
                                            onChange={(e) => updateResolveMatch(row.key, 'inventoryId', e.target.value)}
                                          >
                                            <option value="">
                                              {row.categoryName ? 'Select inventory item' : 'Select a category first'}
                                            </option>
                                            {categoryItems.map((item) => (
                                              <option key={item.inventoryId} value={item.inventoryId}>
                                                {item.sku} · {item.itemName} ({item.stocks} in stock)
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                        <div className="online-order-map-config-field online-order-map-config-qty">
                                          <span>Qty</span>
                                          <input
                                            type="number"
                                            min="1"
                                            value={row.quantity}
                                            onChange={(e) => updateResolveMatch(row.key, 'quantity', e.target.value)}
                                          />
                                        </div>
                                        <div className="online-order-map-config-actions">
                                          {resolveMatches.length > 1 && (
                                            <button
                                              type="button"
                                              className="secondary kit-remove"
                                              aria-label="Remove mapped item"
                                              onClick={() => removeResolveMatch(row.key)}
                                            >
                                              ×
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>

                                <div className="online-order-map-config-footer">
                                  <button
                                    type="button"
                                    className="secondary small-btn"
                                    onClick={() => addResolveMatch(line.quantity)}
                                  >
                                    + Add item
                                  </button>
                                  <div className="online-order-map-config-actions">
                                    <button
                                      type="button"
                                      className="primary small-btn"
                                      disabled={
                                        busyId === line.orderItemId
                                        || !resolveMatches.some((row) => row.inventoryId)
                                      }
                                      onClick={() => confirmResolve(line.orderItemId)}
                                    >
                                      {busyId === line.orderItemId ? 'Saving…' : 'Save mapping'}
                                    </button>
                                    <button
                                      type="button"
                                      className="secondary kit-remove"
                                      aria-label="Cancel mapping"
                                      onClick={() => { resetResolveState(); setError('') }}
                                    >
                                      ×
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {canManage && showReturnForm && canMarkReturn && (
              <div className="request-detail-grid online-order-meta-grid" style={{ marginTop: '1rem' }}>
                <div className="full">
                  <span>Mark as returned</span>
                  <p className="field-hint">
                    Choose whether the returned item(s) can be resold. Reusable returns restore RHET stock;
                    the Shopee channel quantity is not affected either way.
                  </p>
                </div>
                <label>
                  <span>Outcome</span>
                  <select value={returnReusable} onChange={(e) => setReturnReusable(e.target.value)}>
                    <option value="true">Reusable — restore RHET stock</option>
                    <option value="false">Not reusable — do not restore stock</option>
                  </select>
                </label>
                <label className="full">
                  <span>Notes</span>
                  <textarea value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} placeholder="Inspection notes (optional)" />
                </label>
                <div className="full" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button type="button" className="primary" disabled={busyId === 'confirm-return'} onClick={submitReturnConfirmation}>
                    {busyId === 'confirm-return' ? 'Saving…' : 'Confirm returned'}
                  </button>
                  <button type="button" className="secondary" disabled={busyId === 'confirm-return'} onClick={() => setShowReturnForm(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {error && <div className="page-error">{error}</div>}

            <div className="modal-actions">
              <button type="button" className="secondary" onClick={closeModal} disabled={Boolean(busyId)}>Close</button>
              {canManage && nextAction && !showReturnForm && (
                <button type="button" className="primary" disabled={busyId === `fulfillment-${nextAction.status}`} onClick={() => moveFulfillment(nextAction.status)}>
                  {busyId === `fulfillment-${nextAction.status}` ? 'Updating…' : nextAction.label}
                </button>
              )}
              {canManage && canMarkReturn && !showReturnForm && (
                <button type="button" className="secondary" disabled={Boolean(busyId)} onClick={() => { setError(''); setShowReturnForm(true) }}>
                  Mark as returned
                </button>
              )}
              {canManage && selected.orderStatus !== 'CANCELLED' && selected.fulfillmentStatus !== 'CANCELLED' && selected.fulfillmentStatus !== 'RETURNED' && (
                <button type="button" className="secondary" disabled={busyId === selected.orderId} onClick={confirmCancelOrder}>
                  {busyId === selected.orderId ? 'Cancelling…' : 'Cancel order'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
