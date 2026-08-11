import { useMemo, useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { Pagination } from '../../components/Pagination'
import { StatusBadge } from '../../components/StatusBadge'
import { useSettings } from '../../context/SettingsContext'
import { usePagination } from '../../hooks/usePagination'
import {
  cancelManualOrder,
  confirmManualOrderReturn,
  createManualOrder,
  replaceManualOrderItems,
  updateManualOrder,
  updateManualOrderFulfillmentStatus,
} from '../../services/manualOrdersApi'
import { formatDate, formatManualFulfillmentStatus } from '../../utils/format'

/** Scoring Shipping Management–aligned board tabs. */
const FULFILLMENT_TABS = [
  { key: 'ALL', label: 'ALL' },
  { key: 'PENDING', label: 'Pending', statuses: ['PENDING'] },
  { key: 'PROCESSING', label: 'Processing', statuses: ['PROCESSING'] },
  { key: 'SHIPPED', label: 'Shipped', statuses: ['SHIPPED'] },
  { key: 'DELIVERED', label: 'Delivered', statuses: ['DELIVERED'] },
  { key: 'ERROR', label: 'Error', statuses: ['ERROR'] },
  { key: 'INELIGIBLE', label: 'Ineligible', statuses: ['INELIGIBLE'] },
  { key: 'NEEDS_ATTENTION', label: 'Needs attention', statuses: ['NEEDS_ATTENTION'] },
]

/** Allowed next statuses from current (mirrors backend transitions for the Update Status modal). */
const STATUS_OPTIONS_FROM = {
  PENDING: ['PROCESSING', 'NEEDS_ATTENTION', 'INELIGIBLE', 'ERROR'],
  NEEDS_ATTENTION: ['PROCESSING', 'SHIPPED', 'INELIGIBLE', 'ERROR'],
  PROCESSING: ['SHIPPED', 'NEEDS_ATTENTION', 'INELIGIBLE', 'ERROR'],
  SHIPPED: ['DELIVERED', 'RETURN'],
  DELIVERED: ['RETURN'],
  RETURN: ['RETURN_CONFIRMED'],
  INELIGIBLE: ['ERROR', 'PROCESSING'],
  ERROR: [],
  RETURN_CONFIRMED: [],
}

function matchesFulfillmentTab(order, tabKey) {
  const tab = FULFILLMENT_TABS.find((entry) => entry.key === tabKey)
  if (!tab || tab.key === 'ALL') return true
  return tab.statuses.includes(order?.fulfillmentStatus)
}

function detailValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  return value
}

function formatPaymentDate(value) {
  if (!value) return '—'
  const raw = String(value).slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  return formatDate(value)
}

function emptyLine() {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    categoryName: '',
    inventoryId: '',
    quantity: 1,
  }
}

function emptyCreateForm() {
  return {
    customerName: '',
    customerPhone: '',
    shippingAddress: '',
    courierPreset: '',
    courierOther: '',
    trackingNumber: '',
    notes: '',
    studentName: '',
    programName: '',
    items: [emptyLine()],
  }
}

function resolveCourierName({ courierPreset, courierOther }) {
  const preset = String(courierPreset || '').trim()
  if (!preset) return null
  if (preset === 'OTHER') {
    const custom = String(courierOther || '').trim()
    return custom || null
  }
  return preset
}

function transactionLabel(order) {
  if (order.externalReference) {
    const ref = String(order.externalReference)
    const stripped = ref.replace(/^SCORING-/i, '')
    return stripped || ref
  }
  return order.orderNumber
}

export default function ManualOrdersPage({ orders, inventory, onRefresh, canManage = false }) {
  const settings = useSettings()
  const courierOptions = useMemo(() => {
    const presets = (settings.courierPresets || []).map((name) => ({
      value: name,
      label: name,
    }))
    return [...presets, { value: 'OTHER', label: 'Others' }]
  }, [settings.courierPresets])

  const [filter, setFilter] = useState('PROCESSING')
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [mode, setMode] = useState('details')
  const [returnReusable, setReturnReusable] = useState('true')
  const [returnNotes, setReturnNotes] = useState('')
  const [createForm, setCreateForm] = useState(emptyCreateForm)
  const [statusDraft, setStatusDraft] = useState('')
  const [statusNotes, setStatusNotes] = useState('')
  const [mapLines, setMapLines] = useState([emptyLine()])

  const shown = useMemo(
    () => (orders || []).filter((order) => matchesFulfillmentTab(order, filter)),
    [orders, filter],
  )

  const tabCounts = useMemo(() => {
    const list = orders || []
    return Object.fromEntries(
      FULFILLMENT_TABS.map((tab) => [
        tab.key,
        tab.key === 'ALL'
          ? list.length
          : list.filter((order) => tab.statuses.includes(order.fulfillmentStatus)).length,
      ]),
    )
  }, [orders])

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

  const canMarkReturn = selected
    && (selected.fulfillmentStatus === 'SHIPPED' || selected.fulfillmentStatus === 'DELIVERED')
  const canMapItems = selected
    && ['PENDING', 'PROCESSING', 'NEEDS_ATTENTION'].includes(selected.fulfillmentStatus)

  function openDetails(order) {
    setError('')
    setMode('details')
    setSelected(order)
    setReturnReusable('true')
    setReturnNotes('')
  }

  function openUpdateStatus(order) {
    setError('')
    setSelected(order)
    setMode('updateStatus')
    const options = STATUS_OPTIONS_FROM[order.fulfillmentStatus] || []
    setStatusDraft(options[0] || order.fulfillmentStatus)
    setStatusNotes('')
  }

  function openMapItems(order) {
    setError('')
    setSelected(order)
    setMode('mapItems')
    const existing = (order.items || []).filter((row) => row.lineStatus !== 'CANCELLED')
    if (existing.length) {
      setMapLines(existing.map((row) => ({
        key: row.orderItemId || emptyLine().key,
        categoryName: '',
        inventoryId: row.inventoryId || '',
        quantity: row.quantity || 1,
      })))
    } else {
      setMapLines([emptyLine()])
    }
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
    setCreateForm(emptyCreateForm())
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

  function updateMapLine(key, field, value) {
    setMapLines((prev) => prev.map((row) => {
      if (row.key !== key) return row
      if (field === 'categoryName') return { ...row, categoryName: value, inventoryId: '' }
      return { ...row, [field]: value }
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
      if (createForm.courierPreset === 'OTHER' && !String(createForm.courierOther || '').trim()) {
        setError('Enter the courier name for Others.')
        setBusyId('')
        return
      }
      await createManualOrder({
        customerName: createForm.customerName.trim(),
        customerPhone: createForm.customerPhone.trim() || null,
        shippingAddress: createForm.shippingAddress.trim() || null,
        courierName: resolveCourierName(createForm),
        trackingNumber: createForm.trackingNumber.trim() || null,
        notes: createForm.notes.trim() || null,
        studentName: createForm.studentName.trim() || null,
        programName: createForm.programName.trim() || null,
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

  async function submitUpdateStatus(e) {
    e.preventDefault()
    if (!selected?.orderId || !statusDraft) return
    setBusyId(selected.orderId)
    setError('')
    try {
      if (statusNotes.trim()) {
        const existingNotes = String(selected.notes || '').trim()
        const nextNotes = existingNotes
          ? `${existingNotes} | ${statusNotes.trim()}`
          : statusNotes.trim()
        await updateManualOrder(selected.orderId, { notes: nextNotes })
      }
      if (statusDraft === 'ERROR') {
        const updated = await cancelManualOrder(selected.orderId)
        setSelected(updated)
      } else if (statusDraft === 'RETURN_CONFIRMED') {
        setMode('return')
        setBusyId('')
        return
      } else {
        const updated = await updateManualOrderFulfillmentStatus(selected.orderId, statusDraft)
        setSelected(updated)
      }
      setMode('details')
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  async function submitMapItems(e) {
    e.preventDefault()
    if (!selected?.orderId) return
    setBusyId(selected.orderId)
    setError('')
    try {
      const items = mapLines
        .filter((row) => row.inventoryId)
        .map((row) => ({
          inventoryId: row.inventoryId,
          quantity: Math.max(1, Number(row.quantity) || 1),
        }))
      if (!items.length) {
        setError('Map at least one inventory item.')
        setBusyId('')
        return
      }
      const updated = await replaceManualOrderItems(selected.orderId, items)
      setSelected(updated)
      setMode('details')
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

  const filterLabel = FULFILLMENT_TABS.find((tab) => tab.key === filter)?.label || filter

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Manual orders</h1>
          <p>
            Non-Shopee courier shipments (Lalamove, LBC, Others). Status modules match Scoring Shipping Management.
            Marking shipped deducts warehouse stock.
          </p>
        </div>
        {canManage && (
          <button type="button" className="primary" onClick={openCreate}>
            New manual order
          </button>
        )}
      </div>

      <div className="quick-filters">
        {FULFILLMENT_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={filter === tab.key ? 'selected' : ''}
            onClick={() => { setFilter(tab.key); setPage(1) }}
          >
            <span>{tabCounts[tab.key] || 0}</span>
            {tab.label}
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
                <th>Transaction ID</th>
                <th>Payment Date</th>
                <th>Student Name</th>
                <th>Parent Name</th>
                <th>Program</th>
                <th>Courier</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length ? pageItems.map((order) => (
                <tr key={order.orderId}>
                  <td>
                    <strong>{transactionLabel(order)}</strong>
                    <small>{order.orderNumber}</small>
                  </td>
                  <td className="muted">{formatPaymentDate(order.paymentDate || order.createdAt)}</td>
                  <td>{detailValue(order.studentName)}</td>
                  <td>
                    <strong>{order.customerName}</strong>
                    <small>{order.customerPhone || '—'}</small>
                  </td>
                  <td>{detailValue(order.programName)}</td>
                  <td>{detailValue(order.courierName)}</td>
                  <td>
                    <StatusBadge
                      status={order.fulfillmentStatus}
                      label={formatManualFulfillmentStatus(order.fulfillmentStatus)}
                    />
                  </td>
                  <td>
                    <div className="row-actions">
                      {canManage && (STATUS_OPTIONS_FROM[order.fulfillmentStatus] || []).length > 0 && (
                        <button type="button" className="primary small-btn" onClick={() => openUpdateStatus(order)}>
                          Update Status
                        </button>
                      )}
                      <button type="button" className="secondary small-btn" onClick={() => openDetails(order)}>
                        View
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      title={`No ${String(filterLabel).toLowerCase()} manual orders`}
                      message={canManage
                        ? 'Create a manual order for non-Shopee courier shipments, or wait for Scoring to push Processing orders.'
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
              <label>
                Parent / receiver name *
                <input
                  required
                  minLength={2}
                  value={createForm.customerName}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, customerName: e.target.value }))}
                />
              </label>
              <label>
                Contact number
                <input
                  value={createForm.customerPhone}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, customerPhone: e.target.value }))}
                />
              </label>
              <label>
                Student name
                <input
                  value={createForm.studentName}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, studentName: e.target.value }))}
                />
              </label>
              <label>
                Program
                <input
                  value={createForm.programName}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, programName: e.target.value }))}
                />
              </label>
              <label>
                Courier
                <select
                  value={createForm.courierPreset}
                  onChange={(e) => setCreateForm((prev) => ({
                    ...prev,
                    courierPreset: e.target.value,
                    courierOther: e.target.value === 'OTHER' ? prev.courierOther : '',
                  }))}
                >
                  <option value="">Select courier</option>
                  {courierOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Tracking number
                <input
                  value={createForm.trackingNumber}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, trackingNumber: e.target.value }))}
                />
              </label>
              {createForm.courierPreset === 'OTHER' && (
                <label className="full">
                  Other courier *
                  <input
                    required
                    minLength={2}
                    maxLength={100}
                    value={createForm.courierOther}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, courierOther: e.target.value }))}
                    placeholder="Enter courier name"
                  />
                </label>
              )}
              <label className="full">
                Complete address
                <textarea
                  rows={2}
                  value={createForm.shippingAddress}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, shippingAddress: e.target.value }))}
                />
              </label>
              <label className="full">
                Notes / remarks
                <input
                  value={createForm.notes}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Receiver's Name / Complete Address / Contact Number"
                />
              </label>
            </div>

            <div className="integration-note">Line items</div>
            <div className="manual-order-lines">
              {createForm.items.map((row) => {
                const categoryItems = itemsByCategoryName.get(row.categoryName) || []
                return (
                  <div key={row.key} className="manual-order-line-grid">
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
                    <label className="manual-order-line-item">
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
                    <label className="manual-order-line-qty">
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
            </div>

            <div className="row-actions manual-order-line-actions">
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

      {selected && mode === 'updateStatus' && canManage && (
        <div className="modal-backdrop">
          <form className="modal small" onSubmit={submitUpdateStatus}>
            <div className="modal-head">
              <div>
                <h2>Update status — #{transactionLabel(selected)} {selected.studentName || selected.customerName}</h2>
                <p>{detailValue(selected.courierName)} · {formatManualFulfillmentStatus(selected.fulfillmentStatus)}</p>
              </div>
              <button type="button" onClick={closeModal}>×</button>
            </div>
            <label>
              Shipping Status *
              <select
                required
                value={statusDraft}
                onChange={(e) => setStatusDraft(e.target.value)}
              >
                {(STATUS_OPTIONS_FROM[selected.fulfillmentStatus] || []).map((code) => (
                  <option key={code} value={code}>
                    {formatManualFulfillmentStatus(code)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Notes
              <textarea
                rows={3}
                value={statusNotes}
                onChange={(e) => setStatusNotes(e.target.value)}
                placeholder="Optional notes for this status change"
              />
            </label>
            {statusDraft === 'SHIPPED' && (
              <div className="integration-note">
                Marking shipped deducts mapped warehouse stock as Manual sale.
              </div>
            )}
            {error && <div className="page-error">{error}</div>}
            <div className="modal-actions">
              <button type="submit" className="primary" disabled={busyId === selected.orderId}>
                {busyId === selected.orderId ? 'Saving…' : 'Submit'}
              </button>
              <button type="button" className="secondary" disabled={Boolean(busyId)} onClick={closeModal}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {selected && mode === 'mapItems' && canManage && (
        <div className="modal-backdrop">
          <form className="modal request-detail-modal" onSubmit={submitMapItems}>
            <div className="modal-head">
              <div>
                <h2>Map items — #{transactionLabel(selected)}</h2>
                <p>Use Scoring notes / remarks to choose the correct inventory lines.</p>
              </div>
              <button type="button" onClick={() => setMode('details')}>×</button>
            </div>
            <div className="request-detail-grid">
              <div className="full"><span>Notes</span><strong>{detailValue(selected.notes)}</strong></div>
              <div><span>Student</span><strong>{detailValue(selected.studentName)}</strong></div>
              <div><span>Program</span><strong>{detailValue(selected.programName)}</strong></div>
            </div>
            <div className="manual-order-lines" style={{ marginTop: '1rem' }}>
              {mapLines.map((row) => {
                const categoryItems = itemsByCategoryName.get(row.categoryName) || []
                return (
                  <div key={row.key} className="manual-order-line-grid">
                    <label>
                      Category
                      <select
                        value={row.categoryName}
                        onChange={(e) => updateMapLine(row.key, 'categoryName', e.target.value)}
                      >
                        <option value="">Select category</option>
                        {inventoryByCategory.map((group) => (
                          <option key={group.categoryName} value={group.categoryName}>{group.categoryName}</option>
                        ))}
                      </select>
                    </label>
                    <label className="manual-order-line-item">
                      Item *
                      <select
                        required
                        value={row.inventoryId}
                        onChange={(e) => updateMapLine(row.key, 'inventoryId', e.target.value)}
                      >
                        <option value="">Select item</option>
                        {(row.categoryName ? categoryItems : (inventory || []).filter((i) => String(i.status || '').toUpperCase() !== 'INACTIVE')).map((item) => (
                          <option key={item.inventoryId} value={item.inventoryId}>
                            {item.itemName} · {item.sku} · stock {item.stocks}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="manual-order-line-qty">
                      Qty *
                      <input
                        type="number"
                        min={1}
                        required
                        value={row.quantity}
                        onChange={(e) => updateMapLine(row.key, 'quantity', e.target.value)}
                      />
                    </label>
                  </div>
                )
              })}
            </div>
            <div className="row-actions manual-order-line-actions">
              <button type="button" className="secondary small-btn" onClick={() => setMapLines((prev) => [...prev, emptyLine()])}>
                Add line
              </button>
              {mapLines.length > 1 && (
                <button type="button" className="secondary small-btn" onClick={() => setMapLines((prev) => prev.slice(0, -1))}>
                  Remove last line
                </button>
              )}
            </div>
            {error && <div className="page-error">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="secondary" disabled={Boolean(busyId)} onClick={() => setMode('details')}>
                Back
              </button>
              <button className="primary" disabled={busyId === selected.orderId}>
                {busyId === selected.orderId ? 'Saving…' : 'Save mapped items'}
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
                <h2>#{transactionLabel(selected)} {selected.studentName || selected.customerName}</h2>
                <p>{selected.orderNumber} · {detailValue(selected.courierName)}</p>
              </div>
              <button type="button" onClick={closeModal}>×</button>
            </div>

            <div className="request-detail-status">
              <StatusBadge
                status={selected.fulfillmentStatus}
                label={formatManualFulfillmentStatus(selected.fulfillmentStatus)}
              />
              <span className="muted">Created {formatDate(selected.createdAt)}</span>
            </div>

            <div className="request-detail-grid">
              <div><span>Parent / receiver</span><strong>{detailValue(selected.customerName)}</strong></div>
              <div><span>Contact</span><strong>{detailValue(selected.customerPhone)}</strong></div>
              <div><span>Student</span><strong>{detailValue(selected.studentName)}</strong></div>
              <div><span>Program</span><strong>{detailValue(selected.programName)}</strong></div>
              <div><span>Payment date</span><strong>{formatPaymentDate(selected.paymentDate || selected.createdAt)}</strong></div>
              <div><span>Tracking</span><strong>{detailValue(selected.trackingNumber)}</strong></div>
              <div className="full"><span>Address</span><strong>{detailValue(selected.shippingAddress)}</strong></div>
              <div className="full"><span>Notes / remarks</span><strong>{detailValue(selected.notes)}</strong></div>
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
                  {(selected.items || []).length ? (selected.items || []).map((item) => (
                    <tr key={item.orderItemId}>
                      <td>{detailValue(item.sku)}</td>
                      <td>{detailValue(item.itemName)}</td>
                      <td>{item.quantity}</td>
                      <td><StatusBadge status={item.lineStatus} /></td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={4} className="muted">No items mapped yet — use Map items and the notes above.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {error && <div className="page-error">{error}</div>}

            <div className="integration-note">
              Processing → Shipped deducts mapped warehouse stock. There is no Ready-to-ship step.
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary" onClick={closeModal} disabled={Boolean(busyId)}>Close</button>
              {canManage && canMapItems && (
                <button type="button" className="secondary" disabled={busyId === selected.orderId} onClick={() => openMapItems(selected)}>
                  Map items
                </button>
              )}
              {canManage && selected.fulfillmentStatus === 'RETURN' && (
                <button type="button" className="secondary" disabled={busyId === selected.orderId} onClick={() => setMode('return')}>
                  Confirm return
                </button>
              )}
              {canManage && (STATUS_OPTIONS_FROM[selected.fulfillmentStatus] || []).length > 0 && (
                <button type="button" className="primary" disabled={busyId === selected.orderId} onClick={() => openUpdateStatus(selected)}>
                  Update Status
                </button>
              )}
              {canManage && canMarkReturn && (
                <button
                  type="button"
                  className="secondary"
                  disabled={busyId === selected.orderId}
                  onClick={async () => {
                    setBusyId(selected.orderId)
                    setError('')
                    try {
                      const updated = await updateManualOrderFulfillmentStatus(selected.orderId, 'RETURN')
                      setSelected(updated)
                      await onRefresh()
                    } catch (err) {
                      setError(err.message)
                    } finally {
                      setBusyId('')
                    }
                  }}
                >
                  Mark return
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
