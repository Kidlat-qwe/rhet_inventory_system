import { useEffect, useLayoutEffect, useMemo, useRef, useState, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { EmptyState } from '../../components/EmptyState'
import { Pagination } from '../../components/Pagination'
import { StatusBadge } from '../../components/StatusBadge'
import { useSettings } from '../../context/SettingsContext'
import { usePagination } from '../../hooks/usePagination'
import {
  fetchStockRequestInvoices,
  issueStockRequestInvoiceAndShip,
  previewStockRequestInvoice,
  rejectStockRequest,
  returnStockRequest,
} from '../../services/inventoryApi'
import { formatCurrency, formatDate, formatStatus } from '../../utils/format'
import {
  branchDisplayName,
  canShipRequest,
  getStockIssue,
  normalizeBranchKey,
  openChecklistPrintWindow,
  requestItemLabel,
  requestSkuLabel,
  requestVariation,
  componentItemLabel,
  componentSkuLabel,
} from '../../utils/stockRequestChecklist'
import { buildStockRequestGroups, groupMatchesReturnOutcome, groupMatchesTab } from '../../utils/stockRequestGroups'
import { formatInvoiceMoney, openInvoicePrintWindow } from '../../utils/stockRequestInvoice'

const STATUS_TABS = ['PENDING', 'SHIPPED', 'DELIVERED', 'RETURNED', 'REJECTED']
const RETURN_OUTCOME_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'REUSABLE', label: 'Reusable' },
  { key: 'NOT_REUSABLE', label: 'Not reusable' },
]

function detailValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  return value
}

function returnOutcomeLabel(request) {
  if (request?.returnReusable === false) return 'Not reusable — stock not restored'
  if (request?.returnReusable === true) return 'Reusable — stock restored to RHET'
  return null
}

function returnNotesDisplay(request) {
  return request?.returnNotes || (request?.status === 'RETURNED' ? request?.rejectionReason : null) || null
}

export default function StockRequestsPage({ requests, onRefresh, admin }) {
  const settings = useSettings()
  const [filter, setFilter] = useState('PENDING')
  const [returnOutcomeFilter, setReturnOutcomeFilter] = useState('ALL')
  const [branchFilter, setBranchFilter] = useState('')
  const [branchMenuOpen, setBranchMenuOpen] = useState(false)
  const [branchMenuCoords, setBranchMenuCoords] = useState({ top: 0, left: 0 })
  const branchHeaderRef = useRef(null)
  const [busyId, setBusyId] = useState('')
  const [invoiceBusy, setInvoiceBusy] = useState(false)
  const [error, setError] = useState('')
  const [selectedGroupKey, setSelectedGroupKey] = useState('')
  const [mode, setMode] = useState('manage')
  const [lineForAction, setLineForAction] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [returnReusable, setReturnReusable] = useState('true')
  const [returnNotes, setReturnNotes] = useState('')
  const [pickedVerified, setPickedVerified] = useState(false)
  const [invoicePreview, setInvoicePreview] = useState(null)
  const [issuedInvoice, setIssuedInvoice] = useState(null)
  const [groupInvoices, setGroupInvoices] = useState([])
  const [selectedShipIds, setSelectedShipIds] = useState(() => new Set())

  const branchOptions = useMemo(() => {
    const map = new Map()
    for (const request of requests) {
      const key = normalizeBranchKey(request.branchName)
      if (!map.has(key)) map.set(key, branchDisplayName(request.branchName))
    }
    return [...map.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
  }, [requests])

  const requestsForBranch = useMemo(() => {
    if (!branchFilter) return requests
    return requests.filter((request) => normalizeBranchKey(request.branchName) === branchFilter)
  }, [requests, branchFilter])

  const groups = useMemo(
    () => buildStockRequestGroups(requestsForBranch),
    [requestsForBranch],
  )

  const shownGroups = useMemo(() => {
    const tabGroups = groups.filter((group) => groupMatchesTab(group, filter))
    if (filter !== 'RETURNED') return tabGroups
    return tabGroups.filter((group) => groupMatchesReturnOutcome(group, returnOutcomeFilter))
  }, [groups, filter, returnOutcomeFilter])

  const tabCounts = useMemo(() => {
    const counts = {}
    for (const status of STATUS_TABS) {
      counts[status] = groups.filter((group) => groupMatchesTab(group, status)).length
    }
    return counts
  }, [groups])

  const returnOutcomeCounts = useMemo(() => {
    const returned = groups.filter((group) => groupMatchesTab(group, 'RETURNED'))
    return {
      ALL: returned.length,
      REUSABLE: returned.filter((group) => groupMatchesReturnOutcome(group, 'REUSABLE')).length,
      NOT_REUSABLE: returned.filter((group) => groupMatchesReturnOutcome(group, 'NOT_REUSABLE')).length,
    }
  }, [groups])

  const { page, setPage, pageItems, total } = usePagination(shownGroups, 15)
  const selectedGroup = useMemo(
    () => groups.find((group) => group.key === selectedGroupKey) || null,
    [groups, selectedGroupKey],
  )

  const shippableLines = useMemo(
    () => (selectedGroup?.requests || []).filter((request) => canShipRequest(request)),
    [selectedGroup],
  )

  const selectedShippableLines = useMemo(
    () => shippableLines.filter((request) => selectedShipIds.has(request.requestId)),
    [shippableLines, selectedShipIds],
  )

  const selectedShipmentTotal = useMemo(
    () => selectedShippableLines.reduce(
      (sum, request) => sum + Number(request.quantity || 0) * Number(request.internalSellingPrice || 0),
      0,
    ),
    [selectedShippableLines],
  )

  const allShippableSelected = shippableLines.length > 0
    && shippableLines.every((request) => selectedShipIds.has(request.requestId))

  useEffect(() => {
    if (!selectedGroup) return
    const shippableIds = new Set(
      selectedGroup.requests.filter((request) => canShipRequest(request)).map((request) => request.requestId),
    )
    setSelectedShipIds((prev) => new Set([...prev].filter((id) => shippableIds.has(id))))
  }, [selectedGroup])

  useEffect(() => {
    setSelectedGroupKey('')
    setInvoicePreview(null)
    setIssuedInvoice(null)
    setPickedVerified(false)
    setSelectedShipIds(new Set())
    setMode('manage')
    setLineForAction(null)
    if (filter !== 'RETURNED') setReturnOutcomeFilter('ALL')
  }, [filter, branchFilter])

  useEffect(() => {
    if (branchFilter && !branchOptions.some((option) => option.key === branchFilter)) {
      setBranchFilter('')
    }
  }, [branchFilter, branchOptions])

  useEffect(() => {
    if (!selectedGroup?.batchReference || selectedGroup.requestKind === 'RETURN') {
      setGroupInvoices([])
      return undefined
    }
    let cancelled = false
    fetchStockRequestInvoices({
      batchReference: selectedGroup.batchReference,
      sourceSystem: selectedGroup.sourceSystem || 'PSMS',
    })
      .then((rows) => {
        if (!cancelled) setGroupInvoices(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (!cancelled) setGroupInvoices([])
      })
    return () => { cancelled = true }
  }, [selectedGroup?.batchReference, selectedGroup?.sourceSystem, selectedGroup?.shippedCount, selectedGroup?.pendingCount])

  const branchFilterLabel = useMemo(() => {
    if (!branchFilter) return 'Branch'
    return branchOptions.find((option) => option.key === branchFilter)?.label || 'Branch'
  }, [branchFilter, branchOptions])

  const repositionBranchMenu = () => {
    const rect = branchHeaderRef.current?.getBoundingClientRect()
    if (!rect) return
    setBranchMenuCoords({ top: rect.bottom + 4, left: rect.left })
  }

  useLayoutEffect(() => {
    if (branchMenuOpen) repositionBranchMenu()
  }, [branchMenuOpen])

  useEffect(() => {
    if (!branchMenuOpen) return undefined
    const close = () => setBranchMenuOpen(false)
    const onKey = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [branchMenuOpen])

  function selectBranchFilter(nextKey) {
    setBranchFilter(nextKey)
    setPage(1)
    setBranchMenuOpen(false)
  }

  function openManage(group) {
    setError('')
    setRejectReason('')
    setReturnNotes('')
    setPickedVerified(false)
    setInvoicePreview(null)
    setIssuedInvoice(null)
    setMode('manage')
    setLineForAction(null)
    setSelectedShipIds(new Set(
      (group.requests || []).filter((request) => canShipRequest(request)).map((request) => request.requestId),
    ))
    setSelectedGroupKey(group.key)
  }

  function closeModal() {
    if (busyId || invoiceBusy) return
    setSelectedGroupKey('')
    setMode('manage')
    setLineForAction(null)
    setRejectReason('')
    setReturnNotes('')
    setInvoicePreview(null)
    setIssuedInvoice(null)
    setPickedVerified(false)
    setSelectedShipIds(new Set())
  }

  function toggleShipLine(requestId) {
    setSelectedShipIds((prev) => {
      const next = new Set(prev)
      if (next.has(requestId)) next.delete(requestId)
      else next.add(requestId)
      return next
    })
  }

  function toggleAllShippable() {
    if (!shippableLines.length) return
    setSelectedShipIds(allShippableSelected
      ? new Set()
      : new Set(shippableLines.map((request) => request.requestId)))
  }

  function printGroupChecklist() {
    const toPrint = selectedShippableLines.length
      ? selectedShippableLines
      : shippableLines
    if (!toPrint.length) {
      setError('Select at least one ready line to print a checklist for this shipment.')
      return
    }
    try {
      openChecklistPrintWindow({
        branchName: selectedGroup.branchName,
        requests: toPrint,
        printedBy: admin?.fullName || '',
        organizationName: settings.organizationName,
        timezone: settings.timezone,
      })
    } catch (err) {
      setError(err.message || 'Unable to open print window.')
    }
  }

  function printInvoice(invoice) {
    if (!invoice) return
    try {
      openInvoicePrintWindow({
        invoice,
        printedBy: admin?.fullName || invoice.createdByName || '',
        organizationName: settings.organizationName,
        timezone: settings.timezone,
      })
    } catch (err) {
      setError(err.message || 'Unable to open invoice print window.')
    }
  }

  async function openInvoicePreview() {
    if (!selectedGroup) return
    const readyIds = selectedShippableLines.map((request) => request.requestId)
    if (!readyIds.length) {
      setError('Select at least one ready line for this shipment. Unchecked lines stay pending for later.')
      return
    }
    setInvoiceBusy(true)
    setError('')
    try {
      const preview = await previewStockRequestInvoice(readyIds)
      setIssuedInvoice(null)
      setInvoicePreview(preview)
      setMode('invoice')
    } catch (err) {
      setError(err.message || 'Unable to preview invoice.')
    } finally {
      setInvoiceBusy(false)
    }
  }

  async function confirmInvoiceAndShip() {
    if (!selectedGroup || !pickedVerified) return
    const readyIds = selectedShippableLines.map((request) => request.requestId)
    if (!readyIds.length) return
    setInvoiceBusy(true)
    setError('')
    try {
      const result = await issueStockRequestInvoiceAndShip(readyIds)
      setIssuedInvoice(result.invoice)
      setInvoicePreview(null)
      setMode('invoice')
      await onRefresh()
    } catch (err) {
      setError(err.message || 'Unable to issue invoice and ship.')
    } finally {
      setInvoiceBusy(false)
    }
  }

  async function confirmReturn(e) {
    e.preventDefault()
    if (!lineForAction?.requestId) return
    if (selectedGroup?.requestKind !== 'RETURN' && lineForAction?.requestKind !== 'RETURN') return
    setBusyId(lineForAction.requestId)
    setError('')
    try {
      await returnStockRequest(lineForAction.requestId, {
        reusable: returnReusable === 'true',
        notes: returnNotes.trim(),
      })
      setMode('manage')
      setLineForAction(null)
      setReturnNotes('')
      setReturnReusable('true')
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  async function confirmReject(e) {
    e.preventDefault()
    if (!lineForAction?.requestId) return
    setBusyId(lineForAction.requestId)
    setError('')
    try {
      await rejectStockRequest(lineForAction.requestId, rejectReason.trim())
      setMode('manage')
      setLineForAction(null)
      setRejectReason('')
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  const isBranchReturn = selectedGroup?.requestKind === 'RETURN'
  const shippableCount = selectedGroup?.shippableCount || 0
  const selectedShipCount = selectedShippableLines.length
  const activeInvoice = issuedInvoice || invoicePreview
  const leftoverPendingCount = Math.max(
    0,
    (selectedGroup?.pendingCount || 0) - selectedShipCount,
  )
  const showShipSelect = !isBranchReturn && (selectedGroup?.pendingCount || 0) > 0
  const showLineActions = Boolean(selectedGroup?.requests?.some((row) => row.status === 'PENDING'))

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Stock requests</h1>
          <p>
            Each CMS cart is one request group. Open Manage, check the lines for this shipment, preview the invoice,
            then confirm ship. CMS Return Stock arrives on Pending for inspection, then moves to Returned as reusable or not reusable.
          </p>
        </div>
      </div>
      <div className="quick-filters">
        {STATUS_TABS.map((status) => (
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
      </div>
      {filter === 'RETURNED' && (
        <div className="quick-filters sub-filters">
          {RETURN_OUTCOME_FILTERS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className={returnOutcomeFilter === entry.key ? 'selected' : ''}
              onClick={() => { setReturnOutcomeFilter(entry.key); setPage(1) }}
            >
              <span>{returnOutcomeCounts[entry.key] || 0}</span>
              {entry.label}
            </button>
          ))}
        </div>
      )}

      {error && !selectedGroup && <div className="page-error">{error}</div>}

      <section className="panel recent">
        <div className="overflow-x-auto rounded-lg table-scroll" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: '1180px' }}>
            <thead>
              <tr>
                <th>Requested by</th>
                <th className="branch-col-header">
                  <button
                    ref={branchHeaderRef}
                    type="button"
                    className={`branch-col-trigger${branchFilter ? ' is-active' : ''}${branchMenuOpen ? ' is-open' : ''}`}
                    aria-haspopup="menu"
                    aria-expanded={branchMenuOpen}
                    aria-label="Filter by branch"
                    title={branchFilter ? branchFilterLabel : 'Filter by branch'}
                    onClick={() => setBranchMenuOpen((open) => !open)}
                  >
                    <span className="branch-col-label">{branchFilterLabel}</span>
                    <span className="branch-col-caret" aria-hidden="true">▾</span>
                  </button>
                  {branchMenuOpen && createPortal(
                    <>
                      <button
                        type="button"
                        className="actions-menu-overlay"
                        aria-label="Close branch filter"
                        onClick={() => setBranchMenuOpen(false)}
                      />
                      <div
                        className="branch-col-menu"
                        role="menu"
                        style={{ position: 'fixed', top: branchMenuCoords.top, left: branchMenuCoords.left }}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          className={!branchFilter ? 'is-selected' : undefined}
                          onClick={() => selectBranchFilter('')}
                        >
                          All branches
                        </button>
                        {branchOptions.map((option) => (
                          <button
                            key={option.key}
                            type="button"
                            role="menuitem"
                            className={branchFilter === option.key ? 'is-selected' : undefined}
                            title={option.label}
                            onClick={() => selectBranchFilter(option.key)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </>,
                    document.body,
                  )}
                </th>
                <th>Items</th>
                <th>Qty</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Requested</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length ? pageItems.map((group) => (
                <tr key={group.key}>
                  <td>
                    <strong>{group.requestedBy}</strong>
                    <small>{group.requestKind === 'RETURN' ? 'CMS branch return' : group.sourceSystem}</small>
                  </td>
                  <td>
                    <strong>{group.branchName || '—'}</strong>
                    <small>{group.batchReference}</small>
                  </td>
                  <td>
                    <strong>{group.lineCount} item{group.lineCount === 1 ? '' : 's'}</strong>
                    <small>{group.itemPreview.slice(0, 3).join(', ')}{group.itemPreview.length > 3 ? '…' : ''}</small>
                  </td>
                  <td><strong>{group.totalQty}</strong></td>
                  <td className="reason-cell">{group.reason}</td>
                  <td>
                    <StatusBadge status={group.status} />
                    {group.requestKind === 'RETURN' && group.status === 'PENDING' && (
                      <small>Awaiting return check</small>
                    )}
                    {group.requestKind === 'RETURN' && group.status === 'PARTIAL' && (
                      <small>{group.pendingCount} to check · {group.returnedCount || 0} inspected</small>
                    )}
                    {group.requestKind === 'RETURN' && group.status === 'RETURNED' && (
                      <small>
                        {group.reusableCount && group.notReusableCount
                          ? `${group.reusableCount} reusable · ${group.notReusableCount} not reusable`
                          : group.notReusableCount
                            ? 'Not reusable'
                            : 'Reusable'}
                      </small>
                    )}
                    {group.requestKind !== 'RETURN' && group.status === 'PARTIAL' && (
                      <small>{group.pendingCount} pending · {group.shippedCount} shipped</small>
                    )}
                  </td>
                  <td className="muted">{formatDate(group.createdAt)}</td>
                  <td>
                    <button
                      type="button"
                      className={group.pendingCount > 0 ? 'primary small-btn' : 'secondary small-btn'}
                      onClick={() => openManage(group)}
                    >
                      {group.requestKind === 'RETURN' && group.pendingCount > 0
                        ? 'Inspect'
                        : (group.pendingCount > 0 || group.shippedCount > 0 ? 'Manage' : 'View')}
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      title={branchFilter
                        ? `No ${formatStatus(filter).toLowerCase()} request groups for this branch`
                        : `No ${formatStatus(filter).toLowerCase()} request groups`}
                      message={filter === 'RETURNED'
                        ? 'After you inspect a CMS return, it moves here. Use Reusable / Not reusable to filter.'
                        : filter === 'PENDING'
                          ? 'Stock requests and CMS returns awaiting inspection appear here, grouped by cart.'
                          : 'External merchandise requests will appear here grouped by CMS cart.'}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <Pagination page={page} pageSize={15} total={total} onPageChange={setPage} noun="request groups" />
        </div>
      </section>

      {selectedGroup && mode === 'manage' && (
        <div className="modal-backdrop">
          <div className="modal request-group-modal">
            <div className="modal-head">
              <div>
                <h2>
                  {isBranchReturn
                    ? (selectedGroup.pendingCount > 0 ? 'Check returned items' : 'Branch stock return')
                    : 'Manage stock request'}
                </h2>
                <p>
                  {selectedGroup.requestedBy} · {selectedGroup.branchName || 'No branch'} · {selectedGroup.sourceSystem}
                </p>
              </div>
              <button type="button" onClick={closeModal} disabled={invoiceBusy || Boolean(busyId)}>×</button>
            </div>

            <div className="request-detail-status">
              <StatusBadge status={selectedGroup.status} />
              <span className="muted">
                {selectedGroup.lineCount} line{selectedGroup.lineCount === 1 ? '' : 's'} · {isBranchReturn ? 'Branch return' : 'Requested'} {formatDate(selectedGroup.createdAt)}
                {!isBranchReturn && selectedGroup.receivedAt ? ` · Received ${formatDate(selectedGroup.receivedAt)}` : ''}
              </span>
            </div>

            {isBranchReturn ? (
              <div className="request-detail-grid">
                <div><span>Branch</span><strong>{detailValue(selectedGroup.branchName)}</strong></div>
                <div><span>Group reference</span><strong>{detailValue(selectedGroup.batchReference)}</strong></div>
                <div><span>Returned by</span><strong>{detailValue(selectedGroup.requestedBy)}</strong></div>
                <div><span>Returned at</span><strong>{formatDate(selectedGroup.createdAt)}</strong></div>
                <div className="full"><span>Reason</span><strong>{detailValue(selectedGroup.reason)}</strong></div>
              </div>
            ) : (
              <div className="request-detail-grid">
                <div><span>Branch</span><strong>{detailValue(selectedGroup.branchName)}</strong></div>
                <div><span>Group reference</span><strong>{detailValue(selectedGroup.batchReference)}</strong></div>
                <div><span>Requested total</span><strong>{formatCurrency(selectedGroup.requestedTotal)}</strong></div>
                <div><span>This shipment</span><strong>{formatCurrency(selectedShipmentTotal)}</strong></div>
                <div>
                  <span>Branch received</span>
                  <strong>{selectedGroup.receivedAt ? formatDate(selectedGroup.receivedAt) : '—'}</strong>
                  {selectedGroup.receivedBy ? <small>{selectedGroup.receivedBy}</small> : null}
                </div>
                <div className="full"><span>Reason</span><strong>{detailValue(selectedGroup.reason)}</strong></div>
              </div>
            )}

            {isBranchReturn && (
              <div className="integration-note">
                {selectedGroup.pendingCount > 0
                  ? 'CMS already deducted branch qty. Check each item: reusable restores warehouse stock; not reusable records the return only.'
                  : 'Inspection complete. Reusable lines were added back to warehouse stock with a RETURN movement.'}
              </div>
            )}

            <div className="overflow-x-auto rounded-lg table-scroll group-lines-scroll" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}>
              <table className="batch-ship-table" style={{ width: '100%', minWidth: isBranchReturn ? '760px' : (showShipSelect || showLineActions ? '920px' : '780px') }}>
                <thead>
                  <tr>
                    {showShipSelect && (
                      <th className="select-col">
                        <input
                          type="checkbox"
                          checked={allShippableSelected}
                          disabled={!shippableLines.length || invoiceBusy}
                          onChange={toggleAllShippable}
                          aria-label="Select all ready lines for this shipment"
                        />
                      </th>
                    )}
                    <th>#</th>
                    <th>Item</th>
                    <th>SKU</th>
                    <th>Qty</th>
                    <th>Internal price</th>
                    <th>Amount</th>
                    <th>Status</th>
                    {showLineActions && <th>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {selectedGroup.requests.map((request, index) => {
                    const issue = getStockIssue(request)
                    const shippable = canShipRequest(request)
                    const checked = selectedShipIds.has(request.requestId)
                    const components = Array.isArray(request.components) ? request.components : []
                    const amount = Number(request.quantity || 0) * Number(request.internalSellingPrice || 0)
                    return (
                      <Fragment key={request.requestId}>
                        <tr className={request.status === 'PENDING' && issue ? 'batch-row-blocked' : undefined}>
                          {showShipSelect && (
                            <td className="select-col">
                              {request.status === 'PENDING' ? (
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={!shippable || invoiceBusy}
                                  title={shippable
                                    ? (checked ? 'Include in this shipment' : 'Leave pending for a later shipment')
                                    : (issue?.title || 'Cannot ship yet')}
                                  onChange={() => toggleShipLine(request.requestId)}
                                  aria-label={`Include ${requestItemLabel(request)} in this shipment`}
                                />
                              ) : null}
                            </td>
                          )}
                          <td>{index + 1}</td>
                          <td>
                            <strong>{requestItemLabel(request)}</strong>
                            <small>
                              {request.categoryName}
                              {requestVariation(request) ? ` · ${requestVariation(request)}` : ''}
                              {request.externalReference ? ` · ${request.externalReference}` : ''}
                            </small>
                          </td>
                          <td>{requestSkuLabel(request)}</td>
                          <td><strong>{request.quantity}</strong></td>
                          <td>{formatCurrency(request.internalSellingPrice)}</td>
                          <td><strong>{formatCurrency(amount)}</strong></td>
                          <td>
                            {isBranchReturn && request.status === 'PENDING' ? (
                              <>
                                <StatusBadge status={request.status} />
                                <small>Awaiting return check</small>
                              </>
                            ) : request.status === 'PENDING' && issue ? (
                              <span className="batch-status warn">{issue.title}</span>
                            ) : (
                              <>
                                <StatusBadge status={request.status} />
                                {request.deliveredAt && (request.status === 'DELIVERED' || request.status === 'RETURNED') ? (
                                  <small>
                                    Received {formatDate(request.deliveredAt)}
                                    {request.deliveryConfirmedBy ? ` · ${request.deliveryConfirmedBy}` : ''}
                                  </small>
                                ) : null}
                                {request.status === 'RETURNED' && returnOutcomeLabel(request) ? (
                                  <small>
                                    {returnOutcomeLabel(request)}
                                    {returnNotesDisplay(request) ? ` · ${returnNotesDisplay(request)}` : ''}
                                  </small>
                                ) : null}
                              </>
                            )}
                          </td>
                          {showLineActions && (
                            <td>
                              {isBranchReturn && request.status === 'PENDING' && (
                                <button
                                  type="button"
                                  className="primary small-btn"
                                  disabled={Boolean(busyId) || invoiceBusy}
                                  onClick={() => {
                                    setError('')
                                    setReturnReusable('true')
                                    setReturnNotes('')
                                    setLineForAction(request)
                                    setMode('return')
                                  }}
                                >
                                  Check item
                                </button>
                              )}
                              {!isBranchReturn && request.status === 'PENDING' && (
                                <button
                                  type="button"
                                  className="secondary small-btn"
                                  disabled={Boolean(busyId) || invoiceBusy}
                                  onClick={() => {
                                    setError('')
                                    setLineForAction(request)
                                    setMode('reject')
                                  }}
                                >
                                  Reject
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                        {components.map((component) => (
                          <tr key={`${request.requestId}-${component.requestComponentId || component.matchedSku || component.itemName}`} className="batch-component-row">
                            {showShipSelect && <td />}
                            <td />
                            <td className="batch-component-name">↳ {componentItemLabel(component)}</td>
                            <td>{componentSkuLabel(component)}</td>
                            <td>{component.quantity}</td>
                            <td colSpan={showLineActions ? 4 : 3} className="muted">Component</td>
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {!isBranchReturn && groupInvoices.length > 0 && (
              <div className="group-invoice-list">
                <h3>Issued invoices</h3>
                {groupInvoices.map((invoice) => (
                  <div key={invoice.invoiceId} className="group-invoice-row">
                    <div>
                      <strong>{invoice.invoiceNumber}</strong>
                      <small>
                        Shipment {invoice.shipmentSeq} · {formatCurrency(invoice.subtotal)} · {formatDate(invoice.createdAt)}
                      </small>
                    </div>
                    <button type="button" className="secondary small-btn" onClick={() => printInvoice(invoice)}>
                      Reprint
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!isBranchReturn && selectedGroup.pendingCount > 0 && (
              <>
                <div className="batch-ship-toolbar">
                  <button type="button" className="batch-print-btn" onClick={printGroupChecklist} disabled={invoiceBusy}>
                    Print checklist
                  </button>
                  <p className="batch-ship-hint">
                    Check only the lines for this box. Unchecked ready lines stay Pending for shipment 2+.
                    Out-of-stock lines cannot be selected.
                  </p>
                </div>
                <label className={`batch-verify${pickedVerified ? ' is-checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={pickedVerified}
                    onChange={(e) => setPickedVerified(e.target.checked)}
                    disabled={invoiceBusy || selectedShipCount === 0}
                  />
                  <span>
                    <strong>Items picked &amp; verified</strong>
                    <small>
                      This shipment: {selectedShipCount} of {shippableCount} ready line{shippableCount === 1 ? '' : 's'}.
                      {leftoverPendingCount > 0 ? ` ${leftoverPendingCount} stay pending.` : ''}
                    </small>
                  </span>
                </label>
              </>
            )}

            {error && <div className="page-error">{error}</div>}

            <div className="modal-actions">
              <button type="button" className="secondary" onClick={closeModal} disabled={invoiceBusy || Boolean(busyId)}>
                Close
              </button>
              {!isBranchReturn && selectedGroup.pendingCount > 0 && (
                <button
                  type="button"
                  className="primary"
                  disabled={invoiceBusy || !pickedVerified || selectedShipCount === 0}
                  onClick={openInvoicePreview}
                >
                  {invoiceBusy ? 'Preparing…' : `Preview invoice (${selectedShipCount})`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedGroup && mode === 'invoice' && activeInvoice && (
        <div className="modal-backdrop">
          <div className="modal invoice-preview-modal">
            <div className="modal-head">
              <div>
                <h2>{issuedInvoice ? 'Invoice issued' : 'Invoice preview'}</h2>
                <p>
                  {selectedGroup.branchName || 'No branch'} · {activeInvoice.invoiceNumber || 'Draft'} · Shipment {activeInvoice.shipmentSeq || 1}
                </p>
              </div>
              <button type="button" onClick={() => {
                if (invoiceBusy) return
                if (issuedInvoice) {
                  closeModal()
                  return
                }
                setMode('manage')
                setInvoicePreview(null)
              }}
              >
                ×
              </button>
            </div>

            {issuedInvoice ? (
              <div className="integration-note">
                Invoice <strong>{issuedInvoice.invoiceNumber}</strong> saved. Warehouse stock was deducted for this shipment.
                {leftoverPendingCount > 0
                  ? ` ${leftoverPendingCount} line${leftoverPendingCount === 1 ? '' : 's'} remain pending for a later shipment.`
                  : ''}
              </div>
            ) : (
              <div className={`integration-note${activeInvoice.zeroPriceCount ? ' warn' : ''}`}>
                Draft only. Confirm ship creates the invoice snapshot and deducts warehouse stock.
                {activeInvoice.zeroPriceCount > 0 && (
                  <> {activeInvoice.zeroPriceCount} line{activeInvoice.zeroPriceCount === 1 ? '' : 's'} have internal selling price ₱0.</>
                )}
              </div>
            )}

            <div className="overflow-x-auto rounded-lg table-scroll" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}>
              <table className="invoice-preview-table" style={{ width: '100%', minWidth: '720px' }}>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>SKU</th>
                    <th>Qty</th>
                    <th>Unit price</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(activeInvoice.lines || []).map((line, index) => (
                    <tr key={line.requestId || `${line.sku}-${index}`}>
                      <td>
                        <strong>{line.itemName}</strong>
                        {line.variation ? <small>{line.variation}</small> : null}
                      </td>
                      <td>{line.sku || '—'}</td>
                      <td><strong>{line.quantity}</strong></td>
                      <td>{formatInvoiceMoney(line.unitPrice)}</td>
                      <td><strong>{formatInvoiceMoney(line.lineTotal)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="invoice-total-row">
              <span>Total due</span>
              <strong>{formatInvoiceMoney(activeInvoice.subtotal)}</strong>
            </div>

            {!!activeInvoice.blocked?.length && (
              <div className="integration-note warn">
                Left pending: {activeInvoice.blocked.map((row) => row.itemName || row.requestId).join(', ')}
              </div>
            )}

            {error && <div className="page-error">{error}</div>}

            <div className="modal-actions">
              {!issuedInvoice && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => { setMode('manage'); setInvoicePreview(null) }}
                  disabled={invoiceBusy}
                >
                  Back
                </button>
              )}
              <button
                type="button"
                className="secondary"
                onClick={() => printInvoice(activeInvoice)}
                disabled={invoiceBusy || !(activeInvoice.lines || []).length}
              >
                Print invoice
              </button>
              {issuedInvoice ? (
                <button type="button" className="primary" onClick={closeModal}>
                  Done
                </button>
              ) : (
                <button
                  type="button"
                  className="primary"
                  disabled={invoiceBusy || !pickedVerified || !(activeInvoice.lines || []).length}
                  onClick={confirmInvoiceAndShip}
                >
                  {invoiceBusy ? 'Shipping…' : 'Confirm ship & save invoice'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedGroup && isBranchReturn && mode === 'return' && lineForAction && (
        <div className="modal-backdrop">
          <form className="modal small" onSubmit={confirmReturn}>
            <div className="modal-head">
              <div>
                <h2>Check returned item</h2>
                <p>
                  {requestItemLabel(lineForAction)} · Qty {lineForAction.quantity}
                  {lineForAction.branchName ? ` · ${lineForAction.branchName}` : ''}
                </p>
              </div>
              <button type="button" onClick={() => { if (!busyId) { setMode('manage'); setLineForAction(null) } }}>×</button>
            </div>
            <div className="integration-note warn">
              Reusable adds this quantity back to warehouse stock and writes a RETURN movement.
              Not reusable keeps warehouse qty unchanged.
            </div>
            <label>
              Outcome
              <select value={returnReusable} onChange={(e) => setReturnReusable(e.target.value)}>
                <option value="true">Reusable — add back to RHET stock</option>
                <option value="false">Not reusable — do not add to stock</option>
              </select>
            </label>
            <label>
              Notes
              <textarea
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="Inspection notes (optional)"
              />
            </label>
            {error && <div className="page-error">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => { setError(''); setMode('manage'); setLineForAction(null) }} disabled={Boolean(busyId)}>
                Back
              </button>
              <button className="primary" disabled={busyId === lineForAction.requestId}>
                {busyId === lineForAction.requestId ? 'Saving…' : 'Confirm check'}
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedGroup && mode === 'reject' && lineForAction && (
        <div className="modal-backdrop">
          <form className="modal small" onSubmit={confirmReject}>
            <div className="modal-head">
              <div>
                <h2>Reject line</h2>
                <p>{lineForAction.requestedBy} · {lineForAction.branchName || '—'} · {requestItemLabel(lineForAction)} · Qty {lineForAction.quantity}</p>
              </div>
              <button type="button" onClick={() => { if (!busyId) { setMode('manage'); setLineForAction(null) } }}>×</button>
            </div>
            <label>
              Rejection reason *
              <textarea
                required
                minLength="3"
                autoFocus
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explain why this line cannot be fulfilled"
              />
            </label>
            {error && <div className="page-error">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => { setError(''); setMode('manage'); setLineForAction(null) }} disabled={Boolean(busyId)}>
                Back
              </button>
              <button className="primary" disabled={busyId === lineForAction.requestId}>
                {busyId === lineForAction.requestId ? 'Rejecting…' : 'Confirm reject'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
