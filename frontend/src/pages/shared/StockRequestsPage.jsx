import { useEffect, useLayoutEffect, useMemo, useRef, useState, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { EmptyState } from '../../components/EmptyState'
import { Pagination } from '../../components/Pagination'
import { StatusBadge } from '../../components/StatusBadge'
import { usePagination } from '../../hooks/usePagination'
import {
  rejectStockRequest,
  returnStockRequest,
  shipStockRequest,
} from '../../services/inventoryApi'
import { formatDate, formatStatus } from '../../utils/format'
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

const STATUS_TABS = ['PENDING', 'SHIPPED', 'DELIVERED', 'RETURNED', 'REJECTED']

function detailValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  return value
}

export default function StockRequestsPage({ requests, onRefresh, admin }) {
  const [filter, setFilter] = useState('PENDING')
  const [branchFilter, setBranchFilter] = useState('')
  const [branchMenuOpen, setBranchMenuOpen] = useState(false)
  const [branchMenuCoords, setBranchMenuCoords] = useState({ top: 0, left: 0 })
  const branchHeaderRef = useRef(null)
  const [busyId, setBusyId] = useState('')
  const [batchBusy, setBatchBusy] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [mode, setMode] = useState('details')
  const [rejectReason, setRejectReason] = useState('')
  const [returnNotes, setReturnNotes] = useState('')
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [batchRequests, setBatchRequests] = useState(null)
  const [pickedVerified, setPickedVerified] = useState(false)
  const [batchResult, setBatchResult] = useState(null)

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

  const shown = useMemo(
    () => (filter ? requestsForBranch.filter((request) => request.status === filter) : requestsForBranch),
    [requestsForBranch, filter],
  )

  const { page, setPage, pageItems, total } = usePagination(shown, 15)

  const stockIssue = useMemo(() => getStockIssue(selected), [selected])
  const variation = selected ? requestVariation(selected) : ''

  const selectedPending = useMemo(() => {
    if (filter !== 'PENDING') return []
    return shown.filter((request) => selectedIds.has(request.requestId))
  }, [filter, shown, selectedIds])

  const selectionBranchKey = useMemo(() => {
    if (!selectedPending.length) return ''
    return normalizeBranchKey(selectedPending[0].branchName)
  }, [selectedPending])

  const pageSelectableIds = useMemo(
    () => (filter === 'PENDING' ? pageItems.map((request) => request.requestId) : []),
    [filter, pageItems],
  )

  const allPageSelected = pageSelectableIds.length > 0
    && pageSelectableIds.every((id) => selectedIds.has(id))

  useEffect(() => {
    setSelectedIds(new Set())
    setBatchRequests(null)
    setBatchResult(null)
    setPickedVerified(false)
  }, [filter, branchFilter])

  useEffect(() => {
    if (branchFilter && !branchOptions.some((option) => option.key === branchFilter)) {
      setBranchFilter('')
    }
  }, [branchFilter, branchOptions])

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

  function openDetails(request) {
    setError('')
    setRejectReason('')
    setReturnNotes('')
    setMode('details')
    setSelected(request)
  }

  function closeModal() {
    if (busyId || batchBusy) return
    setSelected(null)
    setMode('details')
    setRejectReason('')
    setReturnNotes('')
  }

  function toggleSelect(requestId) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(requestId)) next.delete(requestId)
      else next.add(requestId)
      return next
    })
  }

  function toggleSelectAllPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allPageSelected) {
        pageSelectableIds.forEach((id) => next.delete(id))
      } else {
        pageSelectableIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  function openBatchShip(requestsToShip) {
    setError('')
    setBatchResult(null)
    setPickedVerified(false)
    const list = [...requestsToShip]
    if (!list.length) {
      setError('Select at least one pending request.')
      return
    }
    const branchKeys = new Set(list.map((request) => normalizeBranchKey(request.branchName)))
    if (branchKeys.size > 1) {
      setError('Select requests from one branch only. Print and ship are batched per branch.')
      return
    }
    setBatchRequests(list)
  }

  function closeBatchShip() {
    if (batchBusy) return
    setBatchRequests(null)
    setPickedVerified(false)
    setBatchResult(null)
  }

  function printBatchChecklist() {
    if (!batchRequests?.length) return
    try {
      openChecklistPrintWindow({
        branchName: batchRequests[0].branchName,
        requests: batchRequests,
        printedBy: admin?.fullName || '',
      })
    } catch (err) {
      setError(err.message || 'Unable to open print window.')
    }
  }

  async function confirmBatchShip() {
    if (!batchRequests?.length || !pickedVerified) return

    const shippable = batchRequests.filter((request) => canShipRequest(request))
    const blocked = batchRequests
      .filter((request) => !canShipRequest(request))
      .map((request) => ({
        request,
        reason: getStockIssue(request)?.message || 'Cannot ship',
      }))

    if (!shippable.length) {
      setBatchResult({ shipped: [], blocked })
      return
    }

    setBatchBusy(true)
    setError('')
    const shipped = []
    const failed = [...blocked]

    for (const request of shippable) {
      try {
        await shipStockRequest(request.requestId)
        shipped.push(request)
      } catch (err) {
        failed.push({
          request,
          reason: err.message || 'Ship failed',
        })
      }
    }

    setBatchResult({ shipped, blocked: failed })
    setSelectedIds((prev) => {
      const next = new Set(prev)
      shipped.forEach((request) => next.delete(request.requestId))
      return next
    })
    await onRefresh()
    setBatchBusy(false)
  }

  async function confirmReturn(e) {
    e.preventDefault()
    if (!selected?.requestId) return
    setBusyId(selected.requestId)
    setError('')
    try {
      await returnStockRequest(selected.requestId, returnNotes.trim())
      setSelected(null)
      setMode('details')
      setReturnNotes('')
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  async function confirmReject(e) {
    e.preventDefault()
    if (!selected?.requestId) return
    setBusyId(selected.requestId)
    setError('')
    try {
      await rejectStockRequest(selected.requestId, rejectReason.trim())
      setSelected(null)
      setMode('details')
      setRejectReason('')
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  const batchBranchName = batchRequests?.length
    ? branchDisplayName(batchRequests[0].branchName)
    : ''
  const batchShippableCount = batchRequests
    ? batchRequests.filter((request) => canShipRequest(request)).length
    : 0
  const batchBlockedCount = batchRequests
    ? batchRequests.length - batchShippableCount
    : 0

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Stock requests</h1>
          <p>
            Select pending requests by branch, print a pickup checklist, then confirm ship to deduct warehouse stock.
            Branch delivery is confirmed in CMS.
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
            <span>{requestsForBranch.filter((request) => request.status === status).length}</span>
            {formatStatus(status)}
          </button>
        ))}
      </div>

      {filter === 'PENDING' && (
        <div className="batch-ship-bar">
          <div>
            <strong>{selectedPending.length}</strong>
            <span> selected</span>
            {selectedPending.length > 0 && (
              <span className="muted"> · {branchDisplayName(selectedPending[0].branchName)}</span>
            )}
          </div>
          <div className="batch-ship-bar-actions">
            {selectedPending.length > 0 && (
              <button type="button" className="secondary" onClick={() => setSelectedIds(new Set())}>
                Clear selection
              </button>
            )}
            <button
              type="button"
              className="primary"
              disabled={!selectedPending.length}
              onClick={() => openBatchShip(selectedPending)}
            >
              Ship selected ({selectedPending.length})
            </button>
          </div>
        </div>
      )}

      {error && !selected && !batchRequests && <div className="page-error">{error}</div>}

      <section className="panel recent">
        <div className="overflow-x-auto rounded-lg table-scroll" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: filter === 'PENDING' ? '1280px' : '1220px' }}>
            <thead>
              <tr>
                {filter === 'PENDING' && (
                  <th className="select-col">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectAllPage}
                      disabled={!pageSelectableIds.length}
                      aria-label="Select all on this page"
                    />
                  </th>
                )}
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
                <th>Item</th>
                <th>Qty</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Requested</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length ? pageItems.map((request) => {
                const checked = selectedIds.has(request.requestId)
                const otherBranchSelected = Boolean(selectionBranchKey)
                  && normalizeBranchKey(request.branchName) !== selectionBranchKey
                  && !checked
                return (
                  <tr key={request.requestId} className={checked ? 'row-selected' : undefined}>
                    {filter === 'PENDING' && (
                      <td className="select-col">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={otherBranchSelected}
                          title={otherBranchSelected ? 'Select one branch at a time' : 'Select for batch ship'}
                          onChange={() => toggleSelect(request.requestId)}
                          aria-label={`Select request ${request.externalReference || request.requestId}`}
                        />
                      </td>
                    )}
                    <td>
                      <strong>{request.requestedBy}</strong>
                      <small>{request.sourceSystem}</small>
                    </td>
                    <td>
                      <strong>{request.branchName || '—'}</strong>
                    </td>
                    <td>
                      <strong>{requestItemLabel(request)}</strong>
                      <small>
                        {requestSkuLabel(request)}
                        {requestVariation(request) ? ` · ${requestVariation(request)}` : ''}
                      </small>
                    </td>
                    <td><strong>{request.quantity}</strong></td>
                    <td className="reason-cell">{request.reason}</td>
                    <td><StatusBadge status={request.status} /></td>
                    <td className="muted">{formatDate(request.createdAt)}</td>
                    <td>
                      <button
                        type="button"
                        className={request.status === 'PENDING' ? 'primary small-btn' : 'secondary small-btn'}
                        onClick={() => openDetails(request)}
                      >
                        {request.status === 'PENDING' || request.status === 'SHIPPED' ? 'Manage' : 'View'}
                      </button>
                    </td>
                  </tr>
                )
              }) : (
                <tr>
                  <td colSpan={filter === 'PENDING' ? 9 : 8}>
                    <EmptyState
                      title={branchFilter
                        ? `No ${formatStatus(filter).toLowerCase()} requests for this branch`
                        : `No ${formatStatus(filter).toLowerCase()} requests`}
                      message="External merchandise requests will appear here for review."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <Pagination page={page} pageSize={15} total={total} onPageChange={setPage} noun="requests" />
        </div>
      </section>

      {batchRequests && (
        <div className="modal-backdrop">
          <div className="modal batch-ship-modal">
            <div className="modal-head">
              <div>
                <h2>{batchResult ? 'Ship results' : 'Ship batch checklist'}</h2>
                <p>
                  {batchBranchName} · {batchRequests.length} line{batchRequests.length === 1 ? '' : 's'}
                  {!batchResult && batchBlockedCount > 0
                    ? ` · ${batchShippableCount} ready, ${batchBlockedCount} stay pending`
                    : ''}
                </p>
              </div>
              <button type="button" onClick={closeBatchShip} disabled={batchBusy}>×</button>
            </div>

            {!batchResult ? (
              <>
                <div className="batch-ship-toolbar">
                  <button type="button" className="batch-print-btn" onClick={printBatchChecklist} disabled={batchBusy}>
                    Print checklist
                  </button>
                  <p className="batch-ship-hint">
                    Print a soft copy for the courier. Then tick the box below after you physically pick and check every line.
                  </p>
                </div>

                <div className="overflow-x-auto rounded-lg table-scroll" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}>
                  <table className="batch-ship-table" style={{ width: '100%', minWidth: '720px' }}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Item name</th>
                        <th>SKU</th>
                        <th>Qty</th>
                        <th>Pick status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batchRequests.map((request, index) => {
                        const issue = getStockIssue(request)
                        const components = Array.isArray(request.components) ? request.components : []
                        return (
                          <Fragment key={request.requestId}>
                            <tr className={issue ? 'batch-row-blocked' : undefined}>
                              <td>{index + 1}</td>
                              <td>
                                <strong>{requestItemLabel(request)}</strong>
                                <small>{request.externalReference || request.requestId}</small>
                              </td>
                              <td>{requestSkuLabel(request)}</td>
                              <td><strong>{request.quantity}</strong></td>
                              <td>
                                {issue ? (
                                  <span className="batch-status warn">{issue.title}</span>
                                ) : (
                                  <span className="batch-status ok">Ready</span>
                                )}
                              </td>
                            </tr>
                            {components.map((component) => (
                              <tr key={`${request.requestId}-${component.requestComponentId || component.matchedSku || component.itemName}`} className="batch-component-row">
                                <td />
                                <td className="batch-component-name">↳ {componentItemLabel(component)}</td>
                                <td>{componentSkuLabel(component)}</td>
                                <td>{component.quantity}</td>
                                <td className="muted">Component</td>
                              </tr>
                            ))}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {batchBlockedCount > 0 && (
                  <div className="integration-note warn">
                    Out-of-stock or unmatched lines stay <strong>Pending</strong>. Ready lines will ship and deduct warehouse stock.
                  </div>
                )}

                <label className={`batch-verify${pickedVerified ? ' is-checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={pickedVerified}
                    onChange={(e) => setPickedVerified(e.target.checked)}
                    disabled={batchBusy || batchShippableCount === 0}
                  />
                  <span>
                    <strong>Items picked &amp; verified</strong>
                    <small>
                      Required before Confirm ship. Means you (or the picker) already pulled these items from the warehouse
                      and checked them against this checklist / printout.
                    </small>
                  </span>
                </label>

                {error && <div className="page-error">{error}</div>}

                <div className="modal-actions">
                  <button type="button" className="secondary" onClick={closeBatchShip} disabled={batchBusy}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={batchBusy || !pickedVerified || batchShippableCount === 0}
                    onClick={confirmBatchShip}
                  >
                    {batchBusy
                      ? 'Shipping…'
                      : `Confirm ship (${batchShippableCount})`}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="integration-note">
                  Shipped <strong>{batchResult.shipped.length}</strong>
                  {batchResult.blocked.length > 0 && (
                    <> · Left pending <strong>{batchResult.blocked.length}</strong></>
                  )}
                </div>
                {batchResult.shipped.length > 0 && (
                  <div className="batch-result-block">
                    <h3>Shipped</h3>
                    <ul>
                      {batchResult.shipped.map((request) => (
                        <li key={request.requestId}>
                          {requestItemLabel(request)} · {requestSkuLabel(request)} · qty {request.quantity}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {batchResult.blocked.length > 0 && (
                  <div className="batch-result-block">
                    <h3>Still pending</h3>
                    <ul>
                      {batchResult.blocked.map(({ request, reason }) => (
                        <li key={request.requestId}>
                          {requestItemLabel(request)} · {requestSkuLabel(request)} — {reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="modal-actions">
                  <button type="button" className="primary" onClick={closeBatchShip}>
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {selected && mode === 'details' && (
        <div className="modal-backdrop">
          <div className="modal request-detail-modal">
            <div className="modal-head">
              <div>
                <h2>Stock request details</h2>
                <p>{selected.requestedBy} · {selected.branchName || 'No branch'} · {selected.sourceSystem}</p>
              </div>
              <button type="button" onClick={closeModal}>×</button>
            </div>

            <div className="request-detail-status">
              <StatusBadge status={selected.status} />
              <span className="muted">Requested {formatDate(selected.createdAt)}</span>
            </div>

            {stockIssue && selected.status === 'PENDING' && (
              <div className="stock-warning-banner">
                <strong>{stockIssue.title}</strong>
                <p>{stockIssue.message}</p>
              </div>
            )}

            <div className="request-detail-grid">
              <div><span>Branch</span><strong>{detailValue(selected.branchName)}</strong></div>
              <div><span>Category</span><strong>{detailValue(selected.categoryName)}</strong></div>
              <div><span>Item name</span><strong>{detailValue(requestItemLabel(selected))}</strong></div>
              <div><span>Variation</span><strong>{detailValue(variation)}</strong></div>
              <div><span>Quantity requested</span><strong>{detailValue(selected.quantity)}</strong></div>
              <div>
                <span>Current stock</span>
                <strong className={stockIssue ? 'danger-text' : ''}>
                  {selected.currentStocks ?? '—'}
                </strong>
              </div>
              <div><span>Matched SKU</span><strong>{detailValue(selected.matchedSku)}</strong></div>
              <div><span>External reference</span><strong>{detailValue(selected.externalReference)}</strong></div>
              <div><span>Request date</span><strong>{formatDate(selected.requestDate)}</strong></div>
              <div className="full"><span>Reason</span><strong>{detailValue(selected.reason)}</strong></div>
              {selected.failureReason && (
                <div className="full"><span>Failure reason</span><strong className="danger-text">{selected.failureReason}</strong></div>
              )}
              {selected.rejectionReason && (
                <div className="full"><span>Notes / rejection</span><strong>{selected.rejectionReason}</strong></div>
              )}
              {selected.deliveryConfirmedBy && (
                <div><span>Delivery confirmed by</span><strong>{selected.deliveryConfirmedBy}</strong></div>
              )}
              {selected.deliveredAt && (
                <div><span>Delivered at</span><strong>{formatDate(selected.deliveredAt)}</strong></div>
              )}
              {selected.deliveryNotes && (
                <div className="full"><span>Delivery notes</span><strong>{selected.deliveryNotes}</strong></div>
              )}
              {selected.processedByName && (
                <div><span>Processed by</span><strong>{selected.processedByName}</strong></div>
              )}
              {selected.processedAt && (
                <div><span>Processed at</span><strong>{formatDate(selected.processedAt)}</strong></div>
              )}
              {(selected.status === 'SHIPPED' || selected.status === 'DELIVERED' || selected.status === 'RETURNED' || selected.status === 'REJECTED') && (
                <div className="full">
                  <span>External webhook</span>
                  <strong className={
                    selected.webhookLastStatus === 'FAILED' || selected.webhookLastStatus === 'SKIPPED'
                      ? 'danger-text'
                      : ''
                  }>
                    {selected.webhookLastStatus || '—'}
                    {selected.webhookLastAttemptAt ? ` · ${formatDate(selected.webhookLastAttemptAt)}` : ''}
                  </strong>
                </div>
              )}
            </div>

            {error && <div className="page-error">{error}</div>}

            {selected.status === 'PENDING' ? (
              <div className={`integration-note ${stockIssue ? 'warn' : ''}`}>
                {stockIssue
                  ? 'Ship is blocked until stock is available or the item is matched. You can reject this request now.'
                  : 'Use Ship selected (with checklist) or ship this line alone. Confirm ship deducts warehouse stock.'}
              </div>
            ) : selected.status === 'SHIPPED' ? (
              <div className="integration-note">
                Goods left the warehouse. Delivery is confirmed by the branch in CMS (POST /deliver).
                Use Mark returned only if goods come back to the warehouse.
              </div>
            ) : selected.status === 'DELIVERED' ? (
              <div className="integration-note">
                Branch received this shipment. You can still mark returned to restock the warehouse (CMS should reverse branch stock).
              </div>
            ) : selected.webhookLastStatus === 'SKIPPED' || selected.webhookLastStatus === 'FAILED' ? (
              <div className="integration-note warn">
                RHET marked this request {formatStatus(selected.status).toLowerCase()}, but the external system may still be out of sync
                because the webhook was {String(selected.webhookLastStatus).toLowerCase()}.
              </div>
            ) : (
              <div className="integration-note">
                This request is already {formatStatus(selected.status).toLowerCase()}.
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="secondary" onClick={closeModal} disabled={Boolean(busyId)}>Close</button>
              {selected.status === 'PENDING' && (
                <>
                  <button type="button" className="secondary" disabled={busyId === selected.requestId} onClick={() => { setError(''); setMode('reject') }}>
                    Reject
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={busyId === selected.requestId}
                    onClick={() => {
                      const request = selected
                      setSelected(null)
                      setMode('details')
                      openBatchShip([request])
                    }}
                  >
                    Ship with checklist
                  </button>
                </>
              )}
              {selected.status === 'SHIPPED' && (
                <button type="button" className="secondary" disabled={busyId === selected.requestId} onClick={() => { setError(''); setMode('return') }}>
                  Mark returned
                </button>
              )}
              {selected.status === 'DELIVERED' && (
                <button type="button" className="secondary" disabled={busyId === selected.requestId} onClick={() => { setError(''); setMode('return') }}>
                  Mark returned
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {selected && mode === 'return' && (
        <div className="modal-backdrop">
          <form className="modal small" onSubmit={confirmReturn}>
            <div className="modal-head">
              <div>
                <h2>Mark returned</h2>
                <p>{selected.requestedBy} · {selected.branchName || '—'} · Qty {selected.quantity}</p>
              </div>
              <button type="button" onClick={closeModal}>×</button>
            </div>
            <div className="integration-note warn">
              Warehouse stock will be restocked. If this was already delivered, CMS should reverse branch stock.
            </div>
            <label>
              Notes
              <textarea
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="Optional return notes"
              />
            </label>
            {error && <div className="page-error">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => { setError(''); setMode('details') }} disabled={Boolean(busyId)}>
                Back to details
              </button>
              <button className="primary" disabled={busyId === selected.requestId}>
                {busyId === selected.requestId ? 'Saving…' : 'Confirm return'}
              </button>
            </div>
          </form>
        </div>
      )}

      {selected && mode === 'reject' && (
        <div className="modal-backdrop">
          <form className="modal small" onSubmit={confirmReject}>
            <div className="modal-head">
              <div>
                <h2>Reject request</h2>
                <p>{selected.requestedBy} · {selected.branchName || '—'} · {selected.categoryName} · Qty {selected.quantity}</p>
              </div>
              <button type="button" onClick={closeModal}>×</button>
            </div>
            <label>
              Rejection reason *
              <textarea
                required
                minLength="3"
                autoFocus
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explain why this request cannot be fulfilled"
              />
            </label>
            {error && <div className="page-error">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => { setError(''); setMode('details') }} disabled={Boolean(busyId)}>
                Back to details
              </button>
              <button className="primary" disabled={busyId === selected.requestId}>
                {busyId === selected.requestId ? 'Rejecting…' : 'Confirm reject'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
