import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { EmptyState } from '../../components/EmptyState'
import { Icon } from '../../components/Icon'
import { MovementTable } from '../../components/MovementTable'
import { Pagination } from '../../components/Pagination'
import { StatusBadge } from '../../components/StatusBadge'
import { usePagination } from '../../hooks/usePagination'
import { formatCurrency, greetingName, truncateText } from '../../utils/format'

const CHART_COLORS = ['#395fc7', '#7656c5', '#2e9b82', '#df9a43', '#5b8def', '#9b6bcc', '#e06b6b', '#4aa3a2']
const REORDER_PAGE_SIZE = 8

function chartTooltipStyle() {
  return {
    borderRadius: 10,
    border: '1px solid #e5e9f0',
    fontSize: 12,
  }
}

function InventoryValueChart({ categories, totalValue }) {
  const data = (categories || [])
    .map((row) => ({
      name: row.categoryName,
      value: Number(row.value) || 0,
      stocks: Number(row.stocks) || 0,
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value)

  if (!data.length) {
    return <EmptyState title="No inventory value yet" message="Add priced merchandise to see value by category." />
  }

  return (
    <div className="value-chart-wrap">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={62}
            outerRadius={92}
            paddingAngle={2}
          >
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={chartTooltipStyle()}
            formatter={(value, _name, props) => [
              formatCurrency(value),
              props?.payload?.name || 'Category',
            ]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="value-chart-center">
        <strong>{formatCurrency(totalValue)}</strong>
        <span>Total value</span>
      </div>
      <div className="value-chart-legend">
        {data.map((entry, index) => {
          const share = totalValue > 0 ? Math.round((entry.value / totalValue) * 100) : 0
          return (
            <div key={entry.name}>
              <i style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
              <span>{entry.name}</span>
              <strong>{share}%</strong>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CategoryStocksChart({ categories }) {
  const data = (categories || [])
    .map((row) => ({
      name: row.categoryName,
      stocks: Number(row.stocks) || 0,
      items: Number(row.itemCount) || 0,
    }))
    .filter((row) => row.stocks > 0 || row.items > 0)

  if (!data.length) {
    return <EmptyState title="No category stock yet" message="Category stock levels will appear here once items are added." />
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#edf0f5" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-28} textAnchor="end" height={60} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={chartTooltipStyle()} />
        <Bar dataKey="stocks" name="Stocks" radius={[6, 6, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function MonthlyConsumptionChart({ rows }) {
  const data = (rows || []).map((row) => ({
    month: row.monthLabel || row.monthKey,
    quantity: Number(row.quantity) || 0,
  }))

  if (!data.some((row) => row.quantity > 0)) {
    return (
      <EmptyState
        title="No consumption yet"
        message="Outbound stock (online sale, manual sale, released, stock out) will chart here by month."
      />
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#edf0f5" />
        <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={chartTooltipStyle()} />
        <Line
          type="monotone"
          dataKey="quantity"
          name="Units out"
          stroke="#7656c5"
          strokeWidth={2.5}
          dot={{ r: 4, fill: '#7656c5' }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

function buildReorderRows(items = []) {
  return items.map((row) => {
    const stocks = Number(row.stocks) || 0
    const threshold = Math.max(0, Number(row.lowStockThreshold) || 0)
    const shortfall = Math.max(0, threshold - stocks)
    const fillPct = threshold > 0 ? Math.min(100, Math.round((stocks / threshold) * 100)) : 0
    const severity = stocks <= 0 ? 'OUT' : 'LOW'
    return {
      id: row.inventoryId || row.sku || row.itemName,
      itemName: row.itemName || '—',
      sku: row.sku || '—',
      categoryName: row.categoryName || '—',
      stocks,
      threshold,
      shortfall,
      fillPct,
      severity,
      status: row.status || (severity === 'OUT' ? 'OUT_OF_STOCK' : 'LOW_STOCK'),
    }
  })
}

function ReorderPointPanel({ items }) {
  const [query, setQuery] = useState('')
  const [severity, setSeverity] = useState('ALL')
  const [sortBy, setSortBy] = useState('shortfall')

  const allRows = useMemo(() => buildReorderRows(items), [items])

  const outCount = useMemo(() => allRows.filter((row) => row.severity === 'OUT').length, [allRows])
  const lowCount = useMemo(() => allRows.filter((row) => row.severity === 'LOW').length, [allRows])

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    let rows = allRows
    if (severity === 'OUT') rows = rows.filter((row) => row.severity === 'OUT')
    if (severity === 'LOW') rows = rows.filter((row) => row.severity === 'LOW')
    if (needle) {
      rows = rows.filter((row) => (
        row.itemName.toLowerCase().includes(needle)
        || row.sku.toLowerCase().includes(needle)
        || row.categoryName.toLowerCase().includes(needle)
      ))
    }
    const sorted = [...rows]
    if (sortBy === 'name') {
      sorted.sort((a, b) => a.itemName.localeCompare(b.itemName))
    } else if (sortBy === 'stock') {
      sorted.sort((a, b) => a.stocks - b.stocks || b.shortfall - a.shortfall)
    } else {
      sorted.sort((a, b) => b.shortfall - a.shortfall || a.stocks - b.stocks)
    }
    return sorted
  }, [allRows, query, severity, sortBy])

  const { page, setPage, pageItems, total } = usePagination(filteredRows, REORDER_PAGE_SIZE)

  useEffect(() => {
    setPage(1)
  }, [query, severity, sortBy, setPage])

  if (!allRows.length) {
    return <EmptyState title="No reorder alerts" message="All active items are above their low-stock thresholds." />
  }

  return (
    <div className="reorder-panel">
      <div className="reorder-summary">
        <span className="reorder-chip">
          <strong>{allRows.length}</strong> need restock
        </span>
        <span className="reorder-chip out">
          <strong>{outCount}</strong> out of stock
        </span>
        <span className="reorder-chip low">
          <strong>{lowCount}</strong> low stock
        </span>
      </div>

      <div className="reorder-toolbar">
        <div className="search reorder-search">
          <Icon name="search" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search item, SKU, or category"
            aria-label="Search reorder items"
          />
        </div>
        <div className="reorder-filters" role="group" aria-label="Severity filter">
          {[
            ['ALL', 'All'],
            ['OUT', 'Out'],
            ['LOW', 'Low'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={severity === value ? 'selected' : undefined}
              onClick={() => setSeverity(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="reorder-sort">
          Sort
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="shortfall">Highest shortfall</option>
            <option value="stock">Lowest stock</option>
            <option value="name">Item name</option>
          </select>
        </label>
      </div>

      <div
        className="overflow-x-auto rounded-lg table-scroll"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e0 #f7fafc', WebkitOverflowScrolling: 'touch' }}
      >
        <table className="reorder-table" style={{ width: '100%', minWidth: '640px' }}>
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th>Stock vs threshold</th>
              <th>Short</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length ? pageItems.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong title={row.itemName}>{truncateText(row.itemName, 42)}</strong>
                  <small title={row.sku}>{row.sku}</small>
                </td>
                <td className="muted">{row.categoryName}</td>
                <td>
                  <div className="reorder-meter" title={`${row.stocks} of ${row.threshold}`}>
                    <div className="reorder-meter-track">
                      <div
                        className={`reorder-meter-fill${row.severity === 'OUT' ? ' empty' : ' low'}`}
                        style={{ width: `${row.fillPct}%` }}
                      />
                    </div>
                    <span className="reorder-meter-label">{row.stocks} / {row.threshold}</span>
                  </div>
                </td>
                <td>
                  <strong className={row.shortfall > 0 ? 'danger-text' : ''}>
                    {row.shortfall > 0 ? row.shortfall : '—'}
                  </strong>
                </td>
                <td><StatusBadge status={row.status} /></td>
              </tr>
            )) : (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    title="No matching items"
                    message="Try a different search or severity filter."
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination
          page={page}
          pageSize={REORDER_PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          noun="reorder items"
        />
      </div>
    </div>
  )
}

export default function DashboardPage({ dashboard, admin, goInventory, goMovements }) {
  const summary = dashboard?.summary || {}
  const categories = dashboard?.categories || []
  const recentMovements = dashboard?.recentMovements || []
  const monthlyConsumption = dashboard?.monthlyConsumption || []
  const reorderItems = dashboard?.reorderItems || []

  const totalStocks = Number(summary.totalStocks) || 0
  const totalValue = Number(summary.totalValue) || 0
  const lowStock = Number(summary.lowStockItems) || 0
  const outOfStock = Number(summary.outOfStockItems) || 0
  const totalItems = Number(summary.totalItems) || 0

  const channelSales = dashboard?.channelSales || {}
  const stockRequestSales = channelSales.stockRequests || {}
  const onlineOrderSales = channelSales.onlineOrders || {}
  const manualOrderSales = channelSales.manualOrders || {}

  const overviewCards = [
    {
      key: 'merchandise',
      label: 'Total merchandise',
      value: totalItems,
      note: totalItems ? 'Active items in inventory' : 'No merchandise added yet',
      color: 'blue',
      icon: 'tag',
    },
    {
      key: 'stocks',
      label: 'Available stocks',
      value: totalStocks.toLocaleString(),
      note: totalStocks ? 'Across all categories' : 'No stock on hand',
      color: 'violet',
      icon: 'box',
    },
    {
      key: 'alerts',
      label: 'Stock alerts',
      value: lowStock + outOfStock,
      note: `${lowStock} low · ${outOfStock} out of stock`,
      color: 'orange',
      icon: 'swap',
    },
  ]

  const salesCards = [
    {
      key: 'stock-requests',
      label: 'Stock requests',
      value: formatCurrency(stockRequestSales.value),
      note: `${Number(stockRequestSales.units) || 0} units released this month`,
      color: 'green',
      icon: 'swap',
    },
    {
      key: 'online-orders',
      label: 'Online orders',
      value: formatCurrency(onlineOrderSales.value),
      note: `${Number(onlineOrderSales.units) || 0} units sold this month`,
      color: 'blue',
      icon: 'cart',
    },
    {
      key: 'manual-orders',
      label: 'Manual orders',
      value: formatCurrency(manualOrderSales.value),
      note: `${Number(manualOrderSales.units) || 0} units sold this month`,
      color: 'violet',
      icon: 'box',
    },
  ]

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Good afternoon, {greetingName(admin?.fullName)}</h1>
          <p>Inventory overview, channel sales this month, and reorder signals.</p>
        </div>
        <button type="button" className="primary" onClick={goInventory}>＋ Add new item</button>
      </div>

      <section className="stat-grid overview-stat-grid" aria-label="Inventory overview">
        {overviewCards.map((card) => (
          <div className="stat-card" key={card.key}>
            <div className={`stat-icon ${card.color}`}>
              <Icon name={card.icon} />
            </div>
            <p>{card.label}</p>
            <strong>{card.value}</strong>
            <span>{card.note}</span>
          </div>
        ))}
      </section>

      <section className="dashboard-sales" aria-label="Sales this month by channel">
        <div className="dashboard-sales-head">
          <h2>Sales this month</h2>
          <p>Outbound value by channel · stock requests use internal price when set</p>
        </div>
        <div className="stat-grid sales-stat-grid">
          {salesCards.map((card) => (
            <div className="stat-card sales-stat-card" key={card.key}>
              <div className={`stat-icon ${card.color}`}>
                <Icon name={card.icon} />
              </div>
              <p>{card.label}</p>
              <strong>{card.value}</strong>
              <span>{card.note}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-charts">
        <div className="panel chart-panel">
          <div className="panel-head">
            <div>
              <h2>Inventory value</h2>
              <p>On-hand selling-price value share by category</p>
            </div>
          </div>
          <InventoryValueChart categories={categories} totalValue={totalValue} />
        </div>

        <div className="panel chart-panel">
          <div className="panel-head">
            <div>
              <h2>Stocks by category</h2>
              <p>On-hand units per merchandise category</p>
            </div>
          </div>
          <CategoryStocksChart categories={categories} />
        </div>

        <div className="panel chart-panel">
          <div className="panel-head">
            <div>
              <h2>Monthly consumption</h2>
              <p>Last 12 months · online / manual sale · released · stock out</p>
            </div>
          </div>
          <MonthlyConsumptionChart rows={monthlyConsumption} />
        </div>

        <div className="panel chart-panel recent-movements-panel">
          <div className="panel-head">
            <div>
              <h2>Recent stock movements</h2>
              <p>Latest inventory transactions</p>
            </div>
            <button type="button" onClick={goMovements}>View history →</button>
          </div>
          <MovementTable rows={recentMovements} compact />
        </div>

        <div className="panel chart-panel reorder-panel-wrap">
          <div className="panel-head">
            <div>
              <h2>Reorder point</h2>
              <p>Items at or below threshold — search, filter, and page through large lists</p>
            </div>
            <button type="button" onClick={goInventory}>View inventory →</button>
          </div>
          <ReorderPointPanel items={reorderItems} />
        </div>
      </section>
    </>
  )
}
