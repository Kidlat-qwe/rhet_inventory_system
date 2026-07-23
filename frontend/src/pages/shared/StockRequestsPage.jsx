import { useMemo, useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { Pagination } from '../../components/Pagination'
import { StatusBadge } from '../../components/StatusBadge'
import { usePagination } from '../../hooks/usePagination'
import { approveStockRequest, rejectStockRequest } from '../../services/inventoryApi'
import { formatDate, formatStatus } from '../../utils/format'

function detailValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  return value
}

function getStockIssue(request) {
  if (!request) return null

  const hasMatch = Boolean(request.matchedSku || request.inventoryId)
  const available = Number(request.currentStocks)
  const needed = Number(request.quantity) || 0

  if (!hasMatch) {
    return {
      code: 'UNMATCHED',
      title: 'Item not matched in inventory',
      message: 'This request does not match an inventory item yet. You cannot approve until the category, gender, type, and size match a stocked item.',
      available: null,
      canApprove: false,
    }
  }

  if (!Number.isFinite(available)) {
    return {
      code: 'UNKNOWN_STOCK',
      title: 'Current stock unavailable',
      message: 'Unable to verify current warehouse stock for this item. Check Inventory before approving.',
      available: null,
      canApprove: false,
    }
  }

  if (available <= 0) {
    return {
      code: 'OUT_OF_STOCK',
      title: 'Out of stock',
      message: `This item is out of stock (0 available), but the request needs ${needed} unit(s). Add stock first, or reject this request.`,
      available,
      canApprove: false,
    }
  }

  if (available < needed) {
    return {
      code: 'INSUFFICIENT',
      title: 'Insufficient stock',
      message: `Only ${available} unit(s) are available, but this request needs ${needed}. Add stock first, or reject / ask the branch to reduce quantity.`,
      available,
      canApprove: false,
    }
  }

  return null
}

export default function StockRequestsPage({ requests, onRefresh }) {
  const [filter, setFilter] = useState('PENDING')
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [mode, setMode] = useState('details')
  const [rejectReason, setRejectReason] = useState('')

  const shown = useMemo(
    () => (filter ? requests.filter((request) => request.status === filter) : requests),
    [requests, filter],
  )

  const { page, setPage, pageItems, total } = usePagination(shown, 15)

  const stockIssue = useMemo(() => getStockIssue(selected), [selected])
  const variation = selected
    ? [selected.gender, selected.itemType, selected.sizeLabel].filter(Boolean).join(' · ')
    : ''

  function openDetails(request) {
    setError('')
    setRejectReason('')
    setMode('details')
    setSelected(request)
  }

  function closeModal() {
    if (busyId) return
    setSelected(null)
    setMode('details')
    setRejectReason('')
  }

  function openApproveWarning() {
    setError('')
    setMode('approve')
  }

  async function confirmApprove() {
    if (!selected?.requestId) return
    if (stockIssue && !stockIssue.canApprove) {
      setError(stockIssue.message)
      return
    }

    setBusyId(selected.requestId)
    setError('')
    try {
      await approveStockRequest(selected.requestId)
      setSelected(null)
      setMode('details')
      await onRefresh()
    } catch (err) {
      setError(err.message)
      setMode('approve')
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

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Stock requests</h1>
          <p>Review merchandise requests submitted by external systems. Approving a request automatically deducts inventory stock.</p>
        </div>
      </div>
      <div className="quick-filters">
        {['PENDING', 'FULFILLED', 'REJECTED', 'FAILED'].map((status) => (
          <button key={status} type="button" className={filter === status ? 'selected' : ''} onClick={() => setFilter(status)}>
            <span>{requests.filter((request) => request.status === status).length}</span>{formatStatus(status)}
          </button>
        ))}
      </div>
      {error && !selected && <div className="page-error">{error}</div>}
      <section className="panel recent">
        {shown.length ? (
          <div className="overflow-x-auto rounded-lg table-scroll" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', minWidth: '1100px' }}>
              <thead>
                <tr>
                  <th>Requested by</th>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Requested</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((request) => (
                  <tr key={request.requestId}>
                    <td>
                      <strong>{request.requestedBy}</strong>
                      <small>{request.sourceSystem}</small>
                    </td>
                    <td>
                      <strong>{request.categoryName}</strong>
                      <small>
                        {[request.gender, request.itemType, request.sizeLabel].filter(Boolean).join(' · ') || request.matchedSku || 'No match yet'}
                      </small>
                    </td>
                    <td><strong>{request.quantity}</strong></td>
                    <td className="reason-cell">{request.reason}</td>
                    <td><StatusBadge status={request.status} /></td>
                    <td className="muted">{formatDate(request.createdAt)}</td>
                    <td>
                      {request.status === 'PENDING' ? (
                        <div className="row-actions">
                          <button type="button" className="primary small-btn" onClick={() => openDetails(request)}>
                            Review
                          </button>
                        </div>
                      ) : (
                        <button type="button" className="secondary small-btn" onClick={() => openDetails(request)}>
                          View
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} pageSize={15} total={total} onPageChange={setPage} noun="requests" />
          </div>
        ) : (
          <EmptyState title={`No ${formatStatus(filter).toLowerCase()} requests`} message="External merchandise requests will appear here for review." />
        )}
      </section>

      {selected && mode === 'details' && (
        <div className="modal-backdrop">
          <div className="modal request-detail-modal">
            <div className="modal-head">
              <div>
                <h2>Stock request details</h2>
                <p>{selected.requestedBy} · {selected.sourceSystem}</p>
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
              <div><span>Category</span><strong>{detailValue(selected.categoryName)}</strong></div>
              <div><span>Variation</span><strong>{detailValue(variation)}</strong></div>
              <div><span>Quantity requested</span><strong>{detailValue(selected.quantity)}</strong></div>
              <div>
                <span>Current stock</span>
                <strong className={stockIssue ? 'danger-text' : ''}>
                  {selected.currentStocks ?? '—'}
                </strong>
              </div>
              <div><span>Matched SKU</span><strong>{detailValue(selected.matchedSku)}</strong></div>
              <div><span>Item name</span><strong>{detailValue(selected.itemName)}</strong></div>
              <div><span>External reference</span><strong>{detailValue(selected.externalReference)}</strong></div>
              <div><span>Request date</span><strong>{formatDate(selected.requestDate)}</strong></div>
              <div className="full"><span>Reason</span><strong>{detailValue(selected.reason)}</strong></div>
              {selected.failureReason && (
                <div className="full"><span>Failure reason</span><strong className="danger-text">{selected.failureReason}</strong></div>
              )}
              {selected.rejectionReason && (
                <div className="full"><span>Rejection reason</span><strong>{selected.rejectionReason}</strong></div>
              )}
              {selected.processedByName && (
                <div><span>Processed by</span><strong>{selected.processedByName}</strong></div>
              )}
              {selected.processedAt && (
                <div><span>Processed at</span><strong>{formatDate(selected.processedAt)}</strong></div>
              )}
            </div>

            {error && <div className="page-error">{error}</div>}

            {selected.status === 'PENDING' ? (
              <div className={`integration-note ${stockIssue ? 'warn' : ''}`}>
                {stockIssue
                  ? 'Approve is blocked until stock is available or the item is matched. You can reject this request now.'
                  : `Approving will deduct ${selected.quantity} unit(s) from inventory${selected.matchedSku ? ` (${selected.matchedSku})` : ''}.`}
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
                  <button type="button" className="primary" disabled={busyId === selected.requestId} onClick={openApproveWarning}>
                    Approve
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {selected && mode === 'approve' && (
        <div className="modal-backdrop">
          <div className="modal small approve-warning-modal">
            <div className="modal-head">
              <div>
                <h2>{stockIssue ? 'Cannot approve request' : 'Confirm approval'}</h2>
                <p>{selected.requestedBy} · {selected.categoryName} · Qty {selected.quantity}</p>
              </div>
              <button type="button" onClick={closeModal}>×</button>
            </div>

            {stockIssue ? (
              <div className="stock-warning-banner">
                <strong>{stockIssue.title}</strong>
                <p>{stockIssue.message}</p>
                <ul className="stock-warning-list">
                  <li>Requested: <strong>{selected.quantity}</strong></li>
                  <li>Available now: <strong>{stockIssue.available ?? '—'}</strong></li>
                  <li>Matched SKU: <strong>{selected.matchedSku || 'Not matched'}</strong></li>
                </ul>
              </div>
            ) : (
              <div className="integration-note warn">
                You are about to approve this request and deduct <strong>{selected.quantity}</strong> unit(s)
                from warehouse stock{selected.matchedSku ? ` (${selected.matchedSku})` : ''}.
                Available stock after approval: <strong>{Number(selected.currentStocks) - Number(selected.quantity)}</strong>.
              </div>
            )}

            {error && <div className="page-error">{error}</div>}

            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => { setError(''); setMode('details') }} disabled={Boolean(busyId)}>
                Back to details
              </button>
              {stockIssue ? (
                <button type="button" className="primary" onClick={() => { setError(''); setMode('reject') }}>
                  Reject instead
                </button>
              ) : (
                <button type="button" className="primary" disabled={busyId === selected.requestId} onClick={confirmApprove}>
                  {busyId === selected.requestId ? 'Approving…' : 'Confirm approve'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {selected && mode === 'reject' && (
        <div className="modal-backdrop">
          <form className="modal small" onSubmit={confirmReject}>
            <div className="modal-head">
              <div>
                <h2>Reject request</h2>
                <p>{selected.requestedBy} · {selected.categoryName} · Qty {selected.quantity}</p>
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
