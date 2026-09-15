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
import { DashboardMonthPicker } from '../../components/DashboardMonthPicker'
import { Icon } from '../../components/Icon'
import { MovementTable } from '../../components/MovementTable'
import { Pagination } from '../../components/Pagination'
import { StatusBadge } from '../../components/StatusBadge'
import { usePagination } from '../../hooks/usePagination'
import { fetchDashboard } from '../../services/inventoryApi'
import { formatCurrency, greetingName, truncateText } from '../../utils/format'
import { chartThemeColors, useIsDarkTheme } from '../../utils/theme'

const CHART_COLORS = ['#395fc7', '#7656c5', '#2e9b82', '#df9a43', '#5b8def', '#9b6bcc', '#e06b6b', '#4aa3a2']
const REORDER_PAGE_SIZE = 8
const CATEGORY_STOCKS_PAGE_SIZE = 6
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function chartTooltipStyle(theme) {
  return {
    borderRadius: 10,
    border: `1px solid ${theme.tooltipBorder}`,
    background: theme.tooltipBg,
    color: theme.tooltipText,
    fontSize: 12,
  }
}

function dashboardFetchParams(periodKey) {
  if (!periodKey || periodKey === 'year') return { period: 'year' }
  return { period: 'month', month: periodKey }
}

function periodScopeLabel(periodKey, periodMeta) {
  if (periodMeta?.label) return periodMeta.label
  if (!periodKey || periodKey === 'year') return 'this year'
  const match = String(periodKey).match(/^(\d{4})-(\d{2})$/)
  if (!match) return 'this period'
  const monthIndex = Number(match[2]) - 1
  return `${MONTH_NAMES[monthIndex] || match[2]} ${match[1]}`
}

function InventoryValueChart({ categories, totalValue }) {
  const isDark = useIsDarkTheme()
  const theme = chartThemeColors(isDark)
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
            contentStyle={chartTooltipStyle(theme)}
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
  const isDark = useIsDarkTheme()
  const theme = chartThemeColors(isDark)
  const data = useMemo(() => (
    (categories || [])
      .map((row) => ({
        name: row.categoryName,
        stocks: Number(row.stocks) || 0,
        items: Number(row.itemCount) || 0,
      }))
      .filter((row) => row.stocks > 0 || row.items > 0)
      .sort((a, b) => b.stocks - a.stocks || a.name.localeCompare(b.name))
  ), [categories])

  const totalPages = Math.max(1, Math.ceil(data.length / CATEGORY_STOCKS_PAGE_SIZE))
  const [page, setPage] = useState(0)

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages - 1))
  }, [totalPages])

  if (!data.length) {
    return <EmptyState title="No category stock yet" message="Category stock levels will appear here once items are added." />
  }

  const start = page * CATEGORY_STOCKS_PAGE_SIZE
  const pageData = data.slice(start, start + CATEGORY_STOCKS_PAGE_SIZE)
  const end = start + pageData.length
  const yMax = Math.max(...data.map((row) => row.stocks), 1)
  const canPrev = page > 0
  const canNext = page < totalPages - 1
  const tickStyle = { fontSize: 11, fill: theme.tick }

  return (
    <div className="category-stocks-chart">
      <div className="category-stocks-chart-toolbar">
        <span className="category-stocks-chart-range">
          Showing {start + 1}–{end} of {data.length}
        </span>
        <div className="category-stocks-chart-nav" role="group" aria-label="Category chart pages">
          <button
            type="button"
            className="category-stocks-chart-arrow"
            aria-label="Previous categories"
            disabled={!canPrev}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
          >
            ‹
          </button>
          <span className="category-stocks-chart-page">
            {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            className="category-stocks-chart-arrow"
            aria-label="Next categories"
            disabled={!canNext}
            onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
          >
            ›
          </button>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={pageData} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
          <XAxis
            dataKey="name"
            tick={tickStyle}
            interval={0}
            angle={-22}
            textAnchor="end"
            height={60}
            stroke={theme.axis}
            tickFormatter={(value) => truncateText(String(value || ''), 16)}
          />
          <YAxis
            allowDecimals={false}
            tick={tickStyle}
            stroke={theme.axis}
            domain={[0, Math.ceil(yMax * 1.05) || 1]}
          />
          <Tooltip contentStyle={chartTooltipStyle(theme)} />
          <Bar dataKey="stocks" name="Stocks" radius={[6, 6, 0, 0]} maxBarSize={48}>
            {pageData.map((entry, index) => (
              <Cell
                key={entry.name}
                fill={CHART_COLORS[(start + index) % CHART_COLORS.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function MonthlyConsumptionChart({ rows }) {
  const isDark = useIsDarkTheme()
  const theme = chartThemeColors(isDark)
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

  const tickStyle = { fontSize: 11, fill: theme.tick }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 10, fill: theme.tick }}
          interval={0}
          angle={-20}
          textAnchor="end"
          height={50}
          stroke={theme.axis}
        />
        <YAxis allowDecimals={false} tick={tickStyle} stroke={theme.axis} />
        <Tooltip contentStyle={chartTooltipStyle(theme)} />
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
      </div>
      <Pagination
          page={page}
          pageSize={REORDER_PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          noun="reorder items"
        />
    </div>
  )
}

export default function DashboardPage({ dashboard, admin, goInventory, goMovements }) {
  const [periodKey, setPeriodKey] = useState('year')
  const [periodDashboard, setPeriodDashboard] = useState(dashboard || null)
  const [periodBusy, setPeriodBusy] = useState(false)
  const [periodError, setPeriodError] = useState('')

  useEffect(() => {
    if (periodKey === 'year' && dashboard) {
      setPeriodDashboard(dashboard)
    }
  }, [dashboard, periodKey])

  useEffect(() => {
    let cancelled = false

    async function loadPeriod() {
      if (periodKey === 'year' && dashboard) {
        setPeriodDashboard(dashboard)
        setPeriodError('')
        return
      }

      setPeriodBusy(true)
      setPeriodError('')
      try {
        const data = await fetchDashboard(dashboardFetchParams(periodKey))
        if (!cancelled) setPeriodDashboard(data)
      } catch (err) {
        if (!cancelled) setPeriodError(err.message || 'Unable to load dashboard period.')
      } finally {
        if (!cancelled) setPeriodBusy(false)
      }
    }

    loadPeriod()
    return () => { cancelled = true }
  }, [periodKey, dashboard])

  const activeDashboard = periodDashboard || dashboard || {}
  const summary = activeDashboard.summary || dashboard?.summary || {}
  const categories = activeDashboard.categories || dashboard?.categories || []
  const recentMovements = activeDashboard.recentMovements || []
  const monthlyConsumption = activeDashboard.monthlyConsumption || []
  const reorderItems = activeDashboard.reorderItems || dashboard?.reorderItems || []
  const periodMeta = activeDashboard.period || {}
  const scopeLabel = periodScopeLabel(periodKey, periodMeta)

  const totalStocks = Number(summary.totalStocks) || 0
  const totalValue = Number(summary.totalValue) || 0
  const lowStock = Number(summary.lowStockItems) || 0
  const outOfStock = Number(summary.outOfStockItems) || 0
  const totalItems = Number(summary.totalItems) || 0

  const channelSales = activeDashboard.channelSales || {}
  const stockRequestSales = channelSales.stockRequests || {}
  const onlineOrderSales = channelSales.onlineOrders || {}
  const manualOrderSales = channelSales.manualOrders || {}

  const overviewCards = [
    {
      key: 'merchandise',
      label: 'Total items',
      value: totalItems,
      note: totalItems
        ? 'Active merchandise and supplies'
        : 'No active inventory items yet',
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
      note: `${Number(stockRequestSales.units) || 0} units released · ${scopeLabel}`,
      color: 'green',
      icon: 'swap',
    },
    {
      key: 'online-orders',
      label: 'Online orders',
      value: formatCurrency(onlineOrderSales.value),
      note: `${Number(onlineOrderSales.units) || 0} units sold · ${scopeLabel}`,
      color: 'blue',
      icon: 'cart',
    },
    {
      key: 'manual-orders',
      label: 'Manual orders',
      value: formatCurrency(manualOrderSales.value),
      note: `${Number(manualOrderSales.units) || 0} units sold · ${scopeLabel}`,
      color: 'violet',
      icon: 'box',
    },
  ]

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Good afternoon, {greetingName(admin?.fullName)}</h1>
          <p>Inventory overview, channel sales, and reorder signals.</p>
        </div>
        <div className="dashboard-title-actions">
          <DashboardMonthPicker
            value={periodKey}
            disabled={periodBusy}
            onChange={setPeriodKey}
          />
          <button type="button" className="primary" onClick={goInventory}>＋ Add new item</button>
        </div>
      </div>

      {periodError && <div className="page-error">{periodError}</div>}

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

      <section className="dashboard-sales" aria-label={`Sales for ${scopeLabel} by channel`}>
        <div className="dashboard-sales-head">
          <div>
            <h2>Sales · {scopeLabel}</h2>
            <p>
              Outbound value by channel · stock requests use internal price when set
              {periodBusy ? ' · Updating…' : ''}
            </p>
          </div>
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
              <p>On-hand units per category · use arrows to browse</p>
            </div>
          </div>
          <CategoryStocksChart categories={categories} />
        </div>

        <div className="panel chart-panel">
          <div className="panel-head">
            <div>
              <h2>Monthly consumption</h2>
              <p>
                {periodKey === 'year'
                  ? `${new Date().getFullYear()} · online / manual sale · released · stock out`
                  : `${scopeLabel} year view · online / manual sale · released · stock out`}
              </p>
            </div>
          </div>
          <MonthlyConsumptionChart rows={monthlyConsumption} />
        </div>

        <div className="panel chart-panel recent-movements-panel">
          <div className="panel-head">
            <div>
              <h2>Recent stock movements</h2>
              <p>Latest activity for {scopeLabel}</p>
            </div>
            <button type="button" onClick={goMovements}>View history →</button>
          </div>
          <MovementTable
            rows={recentMovements}
            compact
            emptyMessage="No stock movements in this period yet."
          />
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
