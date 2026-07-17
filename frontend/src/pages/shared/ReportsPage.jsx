import { EmptyState } from '../../components/EmptyState'
import { formatCurrency } from '../../utils/format'

export default function ReportsPage({ dashboard, onExport }) {
  const summary = dashboard?.summary || {}
  return (
    <>
      <div className="page-title">
        <div><h1>Reports</h1><p>Export inventory summaries and review current stock metrics.</p></div>
        <button type="button" className="primary" onClick={onExport}>⇩ Export inventory CSV</button>
      </div>
      <section className="stat-grid">
        {[
          ['Total merchandise', Number(summary.totalItems) || 0],
          ['Available stocks', Number(summary.totalStocks) || 0],
          ['Inventory value', formatCurrency(summary.totalValue)],
          ['Low stock items', Number(summary.lowStockItems) || 0],
        ].map(([label, value]) => (
          <div className="stat-card" key={label}><p>{label}</p><strong>{value}</strong></div>
        ))}
      </section>
      <section className="panel recent">
        <div className="panel-head"><div><h2>Inventory valuation</h2><p>Current stock value based on selling price.</p></div></div>
        {Number(summary.totalValue) > 0 ? (
          <div className="report-summary"><strong>{formatCurrency(summary.totalValue)}</strong><span>Total inventory value across all active items.</span></div>
        ) : (
          <EmptyState title="No report data yet" message="Reports will populate once merchandise is added to inventory." />
        )}
      </section>
    </>
  )
}
