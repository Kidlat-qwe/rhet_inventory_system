import { useMemo, useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { Pagination } from '../../components/Pagination'
import { StatusBadge } from '../../components/StatusBadge'
import { usePagination } from '../../hooks/usePagination'
import {
  cancelManualOrder,
  confirmManualOrderReturn,
  createManualOrder,
  updateManualOrderFulfillmentStatus,
} from '../../services/manualOrdersApi'
import { formatDate, formatStatus } from '../../utils/format'

const FULFILLMENT_COLUMNS = [
  'PROCESSING',
  'READY_TO_SHIP',
  'SHIPPED',
  'RECEIVED',
  'RETURN',
  'RETURN_CONFIRMED',
  'CANCELLED',
]

const NEXT_FULFILLMENT_ACTION = {
  PROCESSING: { status: 'READY_TO_SHIP', label: 'Mark ready to ship' },
  READY_TO_SHIP: { status: 'SHIPPED', label: 'Mark shipped' },
  SHIPPED: { status: 'RECEIVED', label: 'Mark received by customer' },
}

function detailValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  return value
}

function emptyLine() {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    categoryName: '',
    inventoryId: '',
    quantity: 1,
  }
}

export default function ManualOrdersPage({ orders, inventory, onRefresh, canManage = false }) {
  const [filter, setFilter] = useState('PROCESSING')
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [mode, setMode] = useState('details')
  const [returnReusable, setReturnReusable] = useState('true')
  const [returnNotes, setReturnNotes] = useState('')
  const [createForm, setCreateForm] = useState({
    customerName: '',
    customerPhone: '',
    shippingAddress: '',
    courierName: '',
    trackingNumber: '',
    notes: '',
    items: [emptyLine()],
  })

  const shown = useMemo(() => {
    if (!filter) return orders
    return orders.filter((order) => order.fulfillmentStatus === filter)
  }, [orders, filter])

  const { page, setPage, pageItems, total } = usePagination(shown, 15)

  const inventoryByCategory = useMemo(() => {
    const groups = new Map()
    for (const item of inventory || []) {
      if (String(item.status || '').toUpperCase() === 'INACTIVE') continue
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

  const itemsByCategoryName = useMemo(() => {
    const map = new Map()
    for (const group of inventoryByCategory) map.set(group.categoryName, group.items)
    return map
  }, [inventoryByCategory])

  const nextAction = selected ? NEXT_FULFILLMENT_ACTION[selected.fulfillmentStatus] : null
  const canMarkReturn = selected
    && (selected.fulfillmentStatus === 'SHIPPED' || selected.fulfillmentStatus === 'RECEIVED')

  function openDetails(order) {
    setError('')
    setMode('details')
    setSelected(order)
    setReturnReusable('true')
    setReturnNotes('')
  }

  function closeModal() {
    if (busyId) return
    setSelected(null)
    setMode('details')
    setError('')
  }

  function openCreate() {
    setError('')
    setMode('create')
    setSelected(null)
    setCreateForm({
      customerName: '',
      customerPhone: '',
      shippingAddress: '',
      courierName: '',
      trackingNumber: '',
      notes: '',
      items: [emptyLine()],
    })
  }

  function updateCreateLine(key, field, value) {
    setCreateForm((prev) => ({
      ...prev,
      items: prev.items.map((row) => {
        if (row.key !== key) return row
        if (field === 'categoryName') return { ...row, categoryName: value, inventoryId: '' }
        return { ...row, [field]: value }
      }),
    }))
  }

  async function submitCreate(e) {
    e.preventDefault()
    setBusyId('create')
    setError('')
    try {
      const items = createForm.items
        .filter((row) => row.inventoryId)
        .map((row) => ({
          inventoryId: row.inventoryId,
          quantity: Math.max(1, Number(row.quantity) || 1),
        }))
      if (!items.length) {
        setError('Add at least one inventory item.')
        setBusyId('')
        return
      }
      await createManualOrder({
        customerName: createForm.customerName.trim(),
        customerPhone: createForm.customerPhone.trim() || null,
        shippingAddress: createForm.shippingAddress.trim() || null,
        courierName: createForm.courierName.trim() || null,
        trackingNumber: createForm.trackingNumber.trim() || null,
        notes: createForm.notes.trim() || null,
        items,
      })
      setMode('details')
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  async function advanceFulfillment(status) {
    if (!selected?.orderId) return
    setBusyId(selected.orderId)
    setError('')
    try {
      const updated = await updateManualOrderFulfillmentStatus(selected.orderId, status)
      setSelected(updated)
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  async function handleCancel() {
    if (!selected?.orderId) return
    setBusyId(selected.orderId)
    setError('')
    try {
      const updated = await cancelManualOrder(selected.orderId)
      setSelected(updated)
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  async function handleConfirmReturn(e) {
    e.preventDefault()
    if (!selected?.orderId) return
    setBusyId(selected.orderId)
    setError('')
    try {
      const updated = await confirmManualOrderReturn(
        selected.orderId,
        returnReusable === 'true',
        returnNotes.trim() || null,
      )
      setSelected(updated)
      setMode('details')
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Manual orders</h1>
          <p>
            HQ direct shipments using RHET-provided courier. Marking shipped deducts warehouse stock.
          </p>
        </div>
        {canManage && (
          <button type="button" className="primary" onClick={openCreate}>
            New manual order
          </button>
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
            <span>{orders.filter((order) => order.fulfillmentStatus === status).length}</span>
            {formatStatus(status)}
          </button>
        ))}
      </div>

      {error && !selected && mode !== 'create' && <div className="page-error">{error}</div>}

      <section className="panel recent">
        <div
          className="overflow-x-auto rounded-lg table-scroll"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}
        >
          <table style={{ width: '100%', minWidth: '1100px' }}>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Courier</th>
                <th>Items</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length ? pageItems.map((order) => (
                <tr key={order.orderId}>
                  <td>
                    <strong>{order.orderNumber}</strong>
                    <small>{order.trackingNumber || 'No tracking yet'}</small>
                  </td>
                  <td>
                    <strong>{order.customerName}</strong>
                    <small>{order.customerPhone || '—'}</small>
                  </td>
                  <td>{detailValue(order.courierName)}</td>
                  <td>
                    <strong>{(order.items || []).length}</strong>
                    <small>
                      {(order.items || []).slice(0, 2).map((item) => item.sku || item.itemName).filter(Boolean).join(', ')
                        || '—'}
                    </small>
                  </td>
                  <td><StatusBadge status={order.fulfillmentStatus} /></td>
                  <td className="muted">{formatDate(order.createdAt)}</td>
                  <td>
                    <button type="button" className="secondary small-btn" onClick={() => openDetails(order)}>
                      {order.fulfillmentStatus === 'PROCESSING' || order.fulfillmentStatus === 'READY_TO_SHIP'
                        ? 'Manage'
                        : 'View'}
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      title={`No ${formatStatus(filter).toLowerCase()} manual orders`}
                      message={canManage
                        ? 'Create a manual order when HQ ships directly with your courier.'
                        : 'Manual orders will appear here once created.'}
                      action={canManage ? (
                        <button type="button" className="primary" onClick={openCreate}>New manual order</button>
                      ) : null}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <Pagination page={page} pageSize={15} total={total} onPageChange={setPage} noun="orders" />
        </div>
      </section>

      {mode === 'create' && canManage && (
        <div className="modal-backdrop">
          <form className="modal request-detail-modal" onSubmit={submitCreate}>
            <div className="modal-head">
              <div>
                <h2>New manual order</h2>
                <p>Pick RHET inventory items. Stock deducts when you mark shipped.</p>
              </div>
              <button type="button" onClick={() => { if (!busyId) setMode('details') }}>×</button>
            </div>

            <div className="request-detail-grid">
              <label className="full">
                Customer name *
                <input
                  required
                  minLength={2}
                  value={createForm.customerName}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, customerName: e.target.value }))}
                />
              </label>
              <label>
                Phone
                <input
                  value={createForm.customerPhone}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, customerPhone: e.target.value }))}
                />
              </label>
              <label>
                Courier
                <input
                  value={createForm.courierName}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, courierName: e.target.value }))}
                  placeholder="e.g. J&T, LBC"
                />
              </label>
              <label className="full">
                Shipping address
                <textarea
                  rows={2}
                  value={createForm.shippingAddress}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, shippingAddress: e.target.value }))}
                />
              </label>
              <label>
                Tracking number
                <input
                  value={createForm.trackingNumber}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, trackingNumber: e.target.value }))}
                />
              </label>
              <label>
                Notes
                <input
                  value={createForm.notes}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </label>
            </div>

            <div className="integration-note">Line items</div>
            {createForm.items.map((row) => {
              const categoryItems = itemsByCategoryName.get(row.categoryName) || []
              return (
                <div key={row.key} className="request-detail-grid" style={{ marginBottom: '0.75rem' }}>
                  <label>
                    Category
                    <select
                      value={row.categoryName}
                      onChange={(e) => updateCreateLine(row.key, 'categoryName', e.target.value)}
                    >
                      <option value="">Select category</option>
                      {inventoryByCategory.map((group) => (
                        <option key={group.categoryName} value={group.categoryName}>{group.categoryName}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Item *
                    <select
                      required
                      value={row.inventoryId}
                      onChange={(e) => updateCreateLine(row.key, 'inventoryId', e.target.value)}
                    >
                      <option value="">Select item</option>
                      {categoryItems.map((item) => (
                        <option key={item.inventoryId} value={item.inventoryId}>
                          {item.itemName} · {item.sku} · stock {item.stocks}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Qty *
                    <input
                      type="number"
                      min={1}
                      required
                      value={row.quantity}
                      onChange={(e) => updateCreateLine(row.key, 'quantity', e.target.value)}
                    />
                  </label>
                </div>
              )
            })}

            <div className="row-actions" style={{ marginBottom: '1rem' }}>
              <button
                type="button"
                className="secondary small-btn"
                onClick={() => setCreateForm((prev) => ({ ...prev, items: [...prev.items, emptyLine()] }))}
              >
                Add line
              </button>
              {createForm.items.length > 1 && (
                <button
                  type="button"
                  className="secondary small-btn"
                  onClick={() => setCreateForm((prev) => ({
                    ...prev,
                    items: prev.items.slice(0, -1),
                  }))}
                >
                  Remove last line
                </button>
              )}
            </div>

            {error && <div className="page-error">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="secondary" disabled={Boolean(busyId)} onClick={() => setMode('details')}>
                Cancel
              </button>
              <button className="primary" disabled={busyId === 'create'}>
                {busyId === 'create' ? 'Creating…' : 'Create order'}
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
                <h2>{selected.orderNumber}</h2>
                <p>{selected.customerName} · {detailValue(selected.courierName)}</p>
              </div>
              <button type="button" onClick={closeModal}>×</button>
            </div>

            <div className="request-detail-status">
              <StatusBadge status={selected.fulfillmentStatus} />
              <span className="muted">Created {formatDate(selected.createdAt)}</span>
            </div>

            <div className="request-detail-grid">
              <div><span>Phone</span><strong>{detailValue(selected.customerPhone)}</strong></div>
              <div><span>Tracking</span><strong>{detailValue(selected.trackingNumber)}</strong></div>
              <div className="full"><span>Address</span><strong>{detailValue(selected.shippingAddress)}</strong></div>
              <div className="full"><span>Notes</span><strong>{detailValue(selected.notes)}</strong></div>
            </div>

            <div className="overflow-x-auto rounded-lg" style={{ scrollbarWidth: 'thin', marginTop: '1rem' }}>
              <table style={{ width: '100%', minWidth: '520px' }}>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Line status</th>
                  </tr>
                </thead>
                <tbody>
                  {(selected.items || []).map((item) => (
                    <tr key={item.orderItemId}>
                      <td>{detailValue(item.sku)}</td>
                      <td>{detailValue(item.itemName)}</td>
                      <td>{item.quantity}</td>
                      <td><StatusBadge status={item.lineStatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {error && <div className="page-error">{error}</div>}

            <div className="integration-note">
              Marking shipped deducts mapped warehouse stock as Manual sale.
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary" onClick={closeModal} disabled={Boolean(busyId)}>Close</button>
              {canManage && selected.fulfillmentStatus === 'RETURN' && (
                <button type="button" className="secondary" disabled={busyId === selected.orderId} onClick={() => setMode('return')}>
                  Confirm return
                </button>
              )}
              {canManage && nextAction && (
                <button type="button" className="primary" disabled={busyId === selected.orderId} onClick={() => advanceFulfillment(nextAction.status)}>
                  {nextAction.label}
                </button>
              )}
              {canManage && canMarkReturn && (
                <button type="button" className="secondary" disabled={busyId === selected.orderId} onClick={() => advanceFulfillment('RETURN')}>
                  Mark return
                </button>
              )}
              {canManage && selected.fulfillmentStatus !== 'CANCELLED'
                && selected.fulfillmentStatus !== 'SHIPPED'
                && selected.fulfillmentStatus !== 'RECEIVED'
                && selected.fulfillmentStatus !== 'RETURN'
                && selected.fulfillmentStatus !== 'RETURN_CONFIRMED' && (
                <button type="button" className="secondary" disabled={busyId === selected.orderId} onClick={handleCancel}>
                  Cancel order
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {selected && mode === 'return' && canManage && (
        <div className="modal-backdrop">
          <form className="modal small" onSubmit={handleConfirmReturn}>
            <div className="modal-head">
              <div>
                <h2>Confirm return</h2>
                <p>{selected.orderNumber} · {selected.customerName}</p>
              </div>
              <button type="button" onClick={() => setMode('details')}>×</button>
            </div>
            <label>
              Condition
              <select value={returnReusable} onChange={(e) => setReturnReusable(e.target.value)}>
                <option value="true">Reusable — restock inventory</option>
                <option value="false">Not reusable — no restock</option>
              </select>
            </label>
            <label>
              Notes
              <textarea
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="Optional inspection notes"
              />
            </label>
            {error && <div className="page-error">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setMode('details')} disabled={Boolean(busyId)}>
                Back
              </button>
              <button className="primary" disabled={busyId === selected.orderId}>
                {busyId === selected.orderId ? 'Saving…' : 'Confirm return'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
