import { EmptyState } from './EmptyState'
import { formatDate, formatMovementType } from '../utils/format'

export function MovementTable({
  rows,
  showReference = false,
  emptyTitle = 'No stock movements yet',
  emptyMessage = 'Transactions will appear here once inventory stock is added, deducted, or adjusted.',
}) {
  const colSpan = showReference ? 6 : 5

  return (
    <div
      className="overflow-x-auto rounded-lg table-scroll"
      style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}
    >
      <table style={{ width: '100%', minWidth: showReference ? '760px' : '620px' }}>
        <thead>
          <tr>
            <th>Movement</th>
            <th>Item</th>
            <th>Quantity</th>
            {showReference && <th>Order / notes</th>}
            <th>Processed by</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((movement) => {
            const positive = movement.stockDelta > 0
            const qty = `${positive ? '+' : ''}${movement.stockDelta}`
            return (
              <tr key={movement.movementId}>
                <td>
                  <span className={`movement-icon ${positive ? 'in' : 'out'}`}>{positive ? '↙' : '↗'}</span>
                  {formatMovementType(movement.movementType)}
                </td>
                <td>
                  <strong>{movement.itemName}</strong>
                  <small>{movement.sku}</small>
                </td>
                <td><b className={positive ? 'positive' : 'negative'}>{qty}</b></td>
                {showReference && (
                  <td className="reason-cell">
                    <strong>{movement.referenceNumber || '—'}</strong>
                    {movement.remarks ? <small>{movement.remarks}</small> : null}
                  </td>
                )}
                <td>{movement.createdByName || movement.fullName || '—'}</td>
                <td className="muted">{formatDate(movement.createdAt)}</td>
              </tr>
            )
          }) : (
            <tr>
              <td colSpan={colSpan}>
                <EmptyState title={emptyTitle} message={emptyMessage} />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
