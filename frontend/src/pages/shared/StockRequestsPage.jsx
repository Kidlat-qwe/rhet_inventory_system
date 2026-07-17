import { useMemo, useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { StatusBadge } from '../../components/StatusBadge'
import { approveStockRequest, rejectStockRequest } from '../../services/inventoryApi'
import { formatDate, formatStatus } from '../../utils/format'

export default function StockRequestsPage({ requests, onRefresh }) {
  const [filter, setFilter] = useState('PENDING')
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [rejecting, setRejecting] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  const shown = useMemo(
    () => (filter ? requests.filter((request) => request.status === filter) : requests),
    [requests, filter],
  )

  async function approve(id) {
    setBusyId(id)
    setError('')
    try {
      await approveStockRequest(id)
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  async function submitReject(e) {
    e.preventDefault()
    setBusyId(rejecting.requestId)
    setError('')
    try {
      await rejectStockRequest(rejecting.requestId, rejectReason.trim())
      setRejecting(null)
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
      {error && <div className="page-error">{error}</div>}
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
                {shown.map((request) => (
                  <tr key={request.requestId}>
                    <td><strong>{request.requestedBy}</strong><small>{request.sourceSystem}</small></td>
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
                          <button type="button" className="primary small-btn" disabled={busyId === request.requestId} onClick={() => approve(request.requestId)}>
                            {busyId === request.requestId ? '…' : 'Approve'}
                          </button>
                          <button type="button" className="secondary small-btn" disabled={busyId === request.requestId} onClick={() => setRejecting(request)}>Reject</button>
                        </div>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={`No ${formatStatus(filter).toLowerCase()} requests`} message="External merchandise requests will appear here for review." />
        )}
      </section>
      {rejecting && (
        <div className="modal-backdrop">
          <form className="modal small" onSubmit={submitReject}>
            <div className="modal-head">
              <div><h2>Reject request</h2><p>{rejecting.requestedBy} · {rejecting.categoryName}</p></div>
              <button type="button" onClick={() => setRejecting(null)}>×</button>
            </div>
            <label>Rejection reason *
              <textarea required minLength="3" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Explain why this request cannot be fulfilled" />
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setRejecting(null)}>Cancel</button>
              <button className="primary" disabled={busyId === rejecting.requestId}>Reject request</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
