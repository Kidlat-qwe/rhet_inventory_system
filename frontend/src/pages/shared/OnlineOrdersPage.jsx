import { useMemo, useRef, useState } from 'react'
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

// Delivery/fulfillment tracking columns, separate from order_status (SKU
// matching). Mirrors FULFILLMENT_TRANSITIONS in the backend online-order
// service — keep the two in sync if the workflow changes.
const FULFILLMENT_COLUMNS = ['PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'RECEIVED', 'RETURN', 'RETURN_CONFIRMED']

const NEXT_FULFILLMENT_ACTION = {
  PROCESSING: { status: 'READY_TO_SHIP', label: 'Mark ready to ship' },
  READY_TO_SHIP: { status: 'SHIPPED', label: 'Mark shipped' },
  SHIPPED: { status: 'RECEIVED', label: 'Mark received by customer' },
}

function detailValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  return value
}

function canResolveLine(line) {
  return line?.lineStatus === 'UNMATCHED' || line?.lineStatus === 'OVERSOLD'
}

export default function OnlineOrdersPage({ orders, inventory, onRefresh, canManage = false }) {
  const [filter, setFilter] = useState('PROCESSING')
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [mode, setMode] = useState('details')
  const [resolveInventoryId, setResolveInventoryId] = useState('')
  const [resolveItemId, setResolveItemId] = useState('')
  const [returnReusable, setReturnReusable] = useState('true')
  const [returnNotes, setReturnNotes] = useState('')
  const [manualForm, setManualForm] = useState({
    externalOrderId: '',
    buyerName: '',
    notes: '',
    items: [{ ...EMPTY_MANUAL_ITEM }],
  })
  const fileInputRef = useRef(null)

  const shown = useMemo(() => {
    if (!filter) return orders
    return orders.filter((order) => order.fulfillmentStatus === filter)
  }, [orders, filter])

  const { page, setPage, pageItems, total } = usePagination(shown, 15)

  const attentionCount = useMemo(
    () => orders.filter((order) => order.orderStatus === 'NEEDS_ATTENTION').length,
    [orders],
  )

  async function openDetails(order) {
    setError('')
    setMode('details')
    setResolveInventoryId('')
    setResolveItemId('')
    setReturnReusable('true')
    setReturnNotes('')
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
    setResolveInventoryId('')
    setResolveItemId('')
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setBusyId('import')
    setError('')
    try {
      const csvText = await file.text()
      await importOnlineOrdersCsv(csvText)
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
    if (!resolveInventoryId) {
      setError('Select an inventory item to map this Shopee SKU.')
      return
    }

    setBusyId(itemId)
    setError('')
    try {
      const updated = await resolveOnlineOrderItem(itemId, resolveInventoryId)
      setSelected(updated)
      setResolveItemId('')
      setResolveInventoryId('')
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
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  const nextAction = selected ? NEXT_FULFILLMENT_ACTION[selected.fulfillmentStatus] : null
  const canMarkReturn = selected && ['SHIPPED', 'RECEIVED'].includes(selected.fulfillmentStatus)

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Online orders</h1>
          <p>Fulfillment tracking board for Shopee orders. RHET stock is deducted through channel allocation, not order checkout — see the Inventory page.</p>
        </div>
        {canManage && (
          <div className="page-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={handleImportFile}
            />
            <button type="button" className="secondary" disabled={busyId === 'import'} onClick={() => fileInputRef.current?.click()}>
              {busyId === 'import' ? 'Importing…' : 'Import CSV'}
            </button>
            <button type="button" className="primary" onClick={() => { setError(''); setMode('manual') }}>
              Add order
            </button>
          </div>
        )}
      </div>

      <div className="quick-filters">
        {FULFILLMENT_COLUMNS.map((status) => (
          <button key={status} type="button" className={filter === status ? 'selected' : ''} onClick={() => setFilter(status)}>
            <span>{orders.filter((order) => order.fulfillmentStatus === status).length}</span>
            {formatStatus(status)}
          </button>
        ))}
        {attentionCount > 0 && (
          <span className="muted">{attentionCount} order(s) need SKU mapping</span>
        )}
      </div>

      {error && !selected && mode === 'details' && <div className="page-error">{error}</div>}

      <section className="panel recent">
        {shown.length ? (
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
                {pageItems.map((order) => (
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
                ))}
              </tbody>
            </table>
            <Pagination page={page} pageSize={15} total={total} onPageChange={setPage} noun="orders" />
          </div>
        ) : (
          <EmptyState
            title={`No orders in ${formatStatus(filter).toLowerCase()}`}
            message={canManage ? 'Import a Shopee CSV export or add an order manually to start tracking fulfillment.' : 'Online orders will appear here once they are imported.'}
          />
        )}
      </section>

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
          <div className="modal request-detail-modal">
            <div className="modal-head">
              <div>
                <h2>Online order details</h2>
                <p>{selected.externalOrderId} · {selected.channel}</p>
              </div>
              <button type="button" onClick={closeModal}>×</button>
            </div>

            <div className="request-detail-status">
              <StatusBadge status={selected.fulfillmentStatus} />
              <StatusBadge status={selected.orderStatus} />
              <span className="muted">Placed {formatDate(selected.orderPlacedAt || selected.createdAt)}</span>
            </div>

            <div className="request-detail-grid">
              <div><span>Buyer</span><strong>{detailValue(selected.buyerName)}</strong></div>
              <div><span>Total</span><strong>{formatCurrency(selected.totalAmount)}</strong></div>
              <div><span>Source</span><strong>{formatStatus(selected.source)}</strong></div>
              <div><span>Imported by</span><strong>{detailValue(selected.importedByName)}</strong></div>
              {selected.notes && <div className="full"><span>Notes</span><strong>{selected.notes}</strong></div>}
              {selected.fulfillmentStatus === 'RETURN_CONFIRMED' && (
                <div className="full">
                  <span>Return outcome</span>
                  <strong>{selected.returnReusable ? 'Reusable — stock restored to RHET' : 'Not reusable — stock not restored'}</strong>
                </div>
              )}
            </div>

            <div className="overflow-x-auto rounded-lg table-scroll" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', minWidth: '900px' }}>
                <thead>
                  <tr>
                    <th>Shopee SKU</th>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Match status</th>
                    <th>Matched SKU</th>
                    {canManage && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {(selected.items || []).map((line) => (
                    <tr key={line.orderItemId}>
                      <td><strong>{detailValue(line.externalSku)}</strong></td>
                      <td>
                        <strong>{detailValue(line.externalItemName)}</strong>
                        <small>{detailValue(line.externalVariation)}</small>
                      </td>
                      <td>{line.quantity}</td>
                      <td><StatusBadge status={line.lineStatus} /></td>
                      <td>
                        <strong>{detailValue(line.matchedSku)}</strong>
                        {line.failureReason && <small className="danger-text">{line.failureReason}</small>}
                      </td>
                      {canManage && (
                        <td>
                          {canResolveLine(line) ? (
                            resolveItemId === line.orderItemId ? (
                              <div className="row-actions">
                                <select value={resolveInventoryId} onChange={(e) => setResolveInventoryId(e.target.value)}>
                                  <option value="">Select inventory item</option>
                                  {inventory.map((item) => (
                                    <option key={item.inventoryId} value={item.inventoryId}>
                                      {item.sku} · {item.itemName} ({item.stocks} in stock)
                                    </option>
                                  ))}
                                </select>
                                <button type="button" className="primary small-btn" disabled={busyId === line.orderItemId} onClick={() => confirmResolve(line.orderItemId)}>
                                  {busyId === line.orderItemId ? 'Saving…' : 'Map item'}
                                </button>
                                <button type="button" className="secondary small-btn" onClick={() => { setResolveItemId(''); setResolveInventoryId('') }}>
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button type="button" className="primary small-btn" onClick={() => { setResolveItemId(line.orderItemId); setResolveInventoryId('') }}>
                                Map item
                              </button>
                            )
                          ) : '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {canManage && selected.fulfillmentStatus === 'RETURN' && (
              <div className="request-detail-grid" style={{ marginTop: '1rem' }}>
                <div className="full">
                  <span>Return inspection</span>
                  <p className="field-hint">Choose whether the returned item(s) can be resold. Reusable returns restore RHET stock; the Shopee channel quantity is not affected either way.</p>
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
                <div className="full">
                  <button type="button" className="primary" disabled={busyId === 'confirm-return'} onClick={submitReturnConfirmation}>
                    {busyId === 'confirm-return' ? 'Confirming…' : 'Confirm return'}
                  </button>
                </div>
              </div>
            )}

            {error && <div className="page-error">{error}</div>}

            <div className="modal-actions">
              <button type="button" className="secondary" onClick={closeModal} disabled={Boolean(busyId)}>Close</button>
              {canManage && nextAction && (
                <button type="button" className="primary" disabled={busyId === `fulfillment-${nextAction.status}`} onClick={() => moveFulfillment(nextAction.status)}>
                  {busyId === `fulfillment-${nextAction.status}` ? 'Updating…' : nextAction.label}
                </button>
              )}
              {canManage && canMarkReturn && (
                <button type="button" className="secondary" disabled={busyId === 'fulfillment-RETURN'} onClick={() => moveFulfillment('RETURN')}>
                  {busyId === 'fulfillment-RETURN' ? 'Updating…' : 'Mark as return'}
                </button>
              )}
              {canManage && selected.orderStatus !== 'CANCELLED' && (
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
