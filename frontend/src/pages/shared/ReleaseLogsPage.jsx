import { useMemo, useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { StatusBadge } from '../../components/StatusBadge'
import { formatDate } from '../../utils/format'

export default function ReleaseLogsPage({ requests }) {
  const [search, setSearch] = useState('')

  const releaseLogs = useMemo(() => {
    const fulfilled = (requests || [])
      .filter((request) => request.status === 'FULFILLED')
      .slice()
      .sort((a, b) => new Date(b.processedAt || b.updatedAt || b.createdAt) - new Date(a.processedAt || a.updatedAt || a.createdAt))

    const query = search.trim().toLowerCase()
    if (!query) return fulfilled

    return fulfilled.filter((request) => {
      const haystack = [
        request.requestedBy,
        request.sourceSystem,
        request.categoryName,
        request.gender,
        request.itemType,
        request.sizeLabel,
        request.matchedSku,
        request.itemName,
        request.externalReference,
        request.reason,
        request.processedByName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [requests, search])

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Merchandise releasing logs</h1>
          <p>All approved stock requests that deducted inventory from the warehouse.</p>
        </div>
      </div>

      <section className="panel recent">
        <div className="toolbar">
          <label className="search">
            ⌕
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by requester, system, SKU, category..."
            />
          </label>
          <span>{releaseLogs.length} release{releaseLogs.length === 1 ? '' : 's'}</span>
        </div>

        {releaseLogs.length ? (
          <div
            className="overflow-x-auto rounded-lg table-scroll"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}
          >
            <table style={{ width: '100%', minWidth: '1100px' }}>
              <thead>
                <tr>
                  <th>Released</th>
                  <th>Requested by</th>
                  <th>Item</th>
                  <th>Qty released</th>
                  <th>Matched SKU</th>
                  <th>Reason</th>
                  <th>Processed by</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {releaseLogs.map((request) => (
                  <tr key={request.requestId}>
                    <td className="muted">{formatDate(request.processedAt || request.updatedAt || request.createdAt)}</td>
                    <td>
                      <strong>{request.requestedBy}</strong>
                      <small>{request.sourceSystem}{request.externalReference ? ` · ${request.externalReference}` : ''}</small>
                    </td>
                    <td>
                      <strong>{request.itemName || request.categoryName}</strong>
                      <small>
                        {[request.categoryName, request.gender, request.itemType, request.sizeLabel]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </small>
                    </td>
                    <td>
                      <b className="negative">-{request.quantity}</b>
                    </td>
                    <td><code className="api-key-prefix">{request.matchedSku || '—'}</code></td>
                    <td className="reason-cell">{request.reason || '—'}</td>
                    <td>{request.processedByName || '—'}</td>
                    <td><StatusBadge status={request.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No releasing logs yet"
            message="Approved stock requests that deduct inventory will appear here as release logs."
          />
        )}
      </section>
    </>
  )
}
