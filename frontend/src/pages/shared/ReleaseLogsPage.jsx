import { useMemo, useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { MovementTable } from '../../components/MovementTable'
import { Pagination } from '../../components/Pagination'
import { StatusBadge } from '../../components/StatusBadge'
import { usePagination } from '../../hooks/usePagination'
import { formatDate } from '../../utils/format'

const TABS = [
  { id: 'stock-requests', label: 'Stock requests' },
  { id: 'online-orders', label: 'Online orders' },
]

export default function ReleaseLogsPage({ requests, onlineMovements = [] }) {
  const [tab, setTab] = useState('stock-requests')
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

  const onlineLogs = useMemo(() => {
    const rows = (onlineMovements || [])
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    const query = search.trim().toLowerCase()
    if (!query) return rows

    return rows.filter((movement) => {
      const haystack = [
        movement.itemName,
        movement.sku,
        movement.movementType,
        movement.referenceNumber,
        movement.remarks,
        movement.createdByName,
        movement.fullName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [onlineMovements, search])

  const stockPager = usePagination(releaseLogs, 15)
  const onlinePager = usePagination(onlineLogs, 15)

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Merchandise releasing logs</h1>
          <p>
            Stock request releases and Shopee online-order stock changes (sales, cancels, returns).
          </p>
        </div>
      </div>

      <div className="quick-filters">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'selected' : ''}
            onClick={() => { setTab(item.id); setSearch('') }}
          >
            <span>
              {item.id === 'stock-requests' ? releaseLogs.length : onlineLogs.length}
            </span>
            {item.label}
          </button>
        ))}
      </div>

      <section className="panel recent">
        <div className="toolbar">
          <label className="search">
            ⌕
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                tab === 'online-orders'
                  ? 'Search by SKU, order #, remarks...'
                  : 'Search by requester, system, SKU, category...'
              }
            />
          </label>
          <span>
            {tab === 'online-orders'
              ? `${onlineLogs.length} online movement${onlineLogs.length === 1 ? '' : 's'}`
              : `${releaseLogs.length} release${releaseLogs.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {tab === 'stock-requests' ? (
          releaseLogs.length ? (
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
                  {stockPager.pageItems.map((request) => (
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
              <Pagination
                page={stockPager.page}
                pageSize={15}
                total={stockPager.total}
                onPageChange={stockPager.setPage}
                noun="releases"
              />
            </div>
          ) : (
            <EmptyState
              title="No releasing logs yet"
              message="Approved stock requests that deduct inventory will appear here as release logs."
            />
          )
        ) : (
          <>
            <MovementTable
              rows={onlinePager.pageItems}
              showReference
              emptyTitle="No online order stock logs yet"
              emptyMessage="When Shopee orders are marked shipped, cancelled, or returned, those stock changes appear here."
            />
            {onlineLogs.length > 0 && (
              <Pagination
                page={onlinePager.page}
                pageSize={15}
                total={onlinePager.total}
                onPageChange={onlinePager.setPage}
                noun="movements"
              />
            )}
          </>
        )}
      </section>
    </>
  )
}
