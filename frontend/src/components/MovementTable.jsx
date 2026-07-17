import { formatDate, formatMovementType } from '../utils/format'
import { EmptyState } from './EmptyState'

export function MovementTable({ rows }) {
  if (!rows.length) {
    return <EmptyState title="No stock movements yet" message="Transactions will appear here once inventory stock is added, deducted, or adjusted." />
  }

  return (
    <div className="overflow-x-auto rounded-lg table-scroll" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', minWidth: '620px' }}>
        <thead>
          <tr><th>Movement</th><th>Item</th><th>Quantity</th><th>Processed by</th><th>When</th></tr>
        </thead>
        <tbody>
          {rows.map((movement) => {
            const positive = movement.stockDelta > 0
            const qty = `${positive ? '+' : ''}${movement.stockDelta}`
            return (
              <tr key={movement.movementId}>
                <td>
                  <span className={`movement-icon ${positive ? 'in' : 'out'}`}>{positive ? '↙' : '↗'}</span>
                  {formatMovementType(movement.movementType)}
                </td>
                <td><strong>{movement.itemName}</strong><small>{movement.sku}</small></td>
                <td><b className={positive ? 'positive' : 'negative'}>{qty}</b></td>
                <td>{movement.createdByName || movement.fullName || '—'}</td>
                <td className="muted">{formatDate(movement.createdAt)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
