import { EmptyState } from '../../components/EmptyState'
import { Icon } from '../../components/Icon'
import { MovementTable } from '../../components/MovementTable'
import { formatCurrency, greetingName } from '../../utils/format'

const categoryColors = ['#395fc7', '#7656c5', '#2e9b82', '#df9a43', '#5b8def', '#9b6bcc']

export default function DashboardPage({ dashboard, admin, goInventory, goMovements }) {
  const summary = dashboard?.summary || {}
  const categories = dashboard?.categories || []
  const recentMovements = dashboard?.recentMovements || []
  const alertItems = (dashboard?.recentItems || []).filter((item) => ['LOW_STOCK', 'OUT_OF_STOCK'].includes(item.status))
  const totalStocks = Number(summary.totalStocks) || 0
  const totalValue = Number(summary.totalValue) || 0
  const lowStock = Number(summary.lowStockItems) || 0
  const outOfStock = Number(summary.outOfStockItems) || 0
  const totalItems = Number(summary.totalItems) || 0
  const categoryTotalStocks = categories.reduce((sum, category) => sum + (Number(category.stocks) || 0), 0)
  const donutGradient = categories.length
    ? (() => {
        let offset = 0
        const segments = categories.map((category, index) => {
          const share = categoryTotalStocks > 0 ? (Number(category.stocks) / categoryTotalStocks) * 100 : (100 / categories.length)
          const start = offset
          offset += share
          return `${categoryColors[index % categoryColors.length]} ${start}% ${offset}%`
        })
        return `conic-gradient(${segments.join(', ')})`
      })()
    : 'conic-gradient(#e5e9f0 0 100%)'

  const cards = [
    ['Total merchandise', totalItems, totalItems ? 'Active items in inventory' : 'No merchandise added yet', 'blue'],
    ['Available stocks', totalStocks.toLocaleString(), totalStocks ? 'Across all categories' : 'No stock on hand', 'violet'],
    ['Inventory value', formatCurrency(totalValue), totalValue ? 'Based on selling price' : 'Add items to calculate value', 'green'],
    ['Stock alerts', lowStock + outOfStock, `${lowStock} low · ${outOfStock} out of stock`, 'orange'],
  ]

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Good afternoon, {greetingName(admin?.fullName)}</h1>
          <p>Here’s what’s happening with your inventory today.</p>
        </div>
        <button type="button" className="primary" onClick={goInventory}>＋ Add new item</button>
      </div>
      <section className="stat-grid">
        {cards.map(([label, num, note, color]) => (
          <div className="stat-card" key={label}>
            <div className={`stat-icon ${color}`}><Icon name={label === 'Stock alerts' ? 'swap' : label === 'Inventory value' ? 'report' : label === 'Available stocks' ? 'box' : 'tag'} /></div>
            <p>{label}</p>
            <strong>{num}</strong>
            <span>{note}</span>
          </div>
        ))}
      </section>
      <section className="dashboard-grid">
        <div className="panel category-panel">
          <div className="panel-head"><div><h2>Inventory by category</h2><p>Stock distribution across merchandise</p></div></div>
          {categories.length ? (
            <div className="donut-wrap">
              <div className="donut" style={{ background: donutGradient }}><div><strong>{totalStocks}</strong><span>Total stocks</span></div></div>
              <div className="legend">
                {categories.map((category, index) => {
                  const share = categoryTotalStocks > 0 ? Math.round((Number(category.stocks) / categoryTotalStocks) * 100) : 0
                  return (
                    <div key={category.categoryId || category.categoryName}>
                      <i style={{ background: categoryColors[index % categoryColors.length] }} />
                      <span>{category.categoryName}</span>
                      <strong>{share}%</strong>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <EmptyState title="No category data yet" message="Categories will appear here once merchandise is added to inventory." />
          )}
        </div>
        <div className="panel alerts">
          <div className="panel-head"><div><h2>Stock alerts</h2><p>Items that need your attention</p></div><button type="button" onClick={goInventory}>View all →</button></div>
          {alertItems.length ? alertItems.slice(0, 3).map((item) => (
            <div className="alert-row" key={item.inventoryId}>
              <div className={item.status === 'LOW_STOCK' ? 'warn' : 'danger'}><Icon name="box" /></div>
              <div><strong>{item.itemName}</strong><span>{item.sku} · {item.variation || 'No variation'}</span></div>
              <div><b>{item.stocks}</b><span>in stock</span></div>
            </div>
          )) : (
            <EmptyState title="No stock alerts" message="All items are above their low-stock thresholds." />
          )}
        </div>
      </section>
      <section className="panel recent">
        <div className="panel-head"><div><h2>Recent stock movements</h2><p>Latest inventory transactions</p></div><button type="button" onClick={goMovements}>View history →</button></div>
        <MovementTable rows={recentMovements} />
      </section>
    </>
  )
}
