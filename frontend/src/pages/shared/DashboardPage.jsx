import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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
import { formatCurrency, greetingName } from '../../utils/format'

const CHART_COLORS = ['#395fc7', '#7656c5', '#2e9b82', '#df9a43', '#5b8def', '#9b6bcc', '#e06b6b', '#4aa3a2']
const STOCK_COLOR = '#395fc7'
const THRESHOLD_COLOR = '#df9a43'

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

function ReorderPointChart({ items }) {
  const data = (items || []).map((row) => {
    const stocks = Number(row.stocks) || 0
    const threshold = Number(row.lowStockThreshold) || 0
    return {
      name: row.sku || row.itemName,
      fullName: row.itemName,
      categoryName: row.categoryName,
      stocks,
      threshold,
      shortfall: Math.max(0, threshold - stocks),
    }
  })

  if (!data.length) {
    return <EmptyState title="No reorder alerts" message="All active items are above their low-stock thresholds." />
  }

  const chartHeight = Math.max(220, data.length * 44 + 48)

  return (
    <div className="reorder-chart">
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }} barCategoryGap="28%" barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="#edf0f5" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="name" width={112} tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={chartTooltipStyle()}
            formatter={(value, name) => {
              if (name === 'stocks') return [value, 'Current stock']
              if (name === 'threshold') return [value, 'Reorder threshold']
              return [value, name]
            }}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload
              if (!row) return ''
              const short = row.shortfall > 0 ? ` · need ${row.shortfall} more` : ''
              return `${row.fullName}${short}`
            }}
          />
          <Legend />
          <Bar dataKey="stocks" name="Current stock" fill={STOCK_COLOR} radius={[0, 5, 5, 0]} barSize={12} />
          <Bar dataKey="threshold" name="Threshold" fill={THRESHOLD_COLOR} radius={[0, 5, 5, 0]} barSize={12} />
        </BarChart>
      </ResponsiveContainer>
      <ul className="reorder-shortfall-list">
        {data.map((row) => (
          <li key={row.name}>
            <span>{row.name}</span>
            <strong className={row.shortfall > 0 ? 'danger-text' : ''}>
              {row.shortfall > 0 ? `Short ${row.shortfall}` : 'At threshold'}
            </strong>
          </li>
        ))}
      </ul>
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
          <p>Inventory overview, consumption trends, and reorder signals.</p>
        </div>
        <button type="button" className="primary" onClick={goInventory}>＋ Add new item</button>
      </div>

      <section className="stat-grid">
        {cards.map(([label, num, note, color]) => (
          <div className="stat-card" key={label}>
            <div className={`stat-icon ${color}`}>
              <Icon name={label === 'Stock alerts' ? 'swap' : label === 'Inventory value' ? 'report' : label === 'Available stocks' ? 'box' : 'tag'} />
            </div>
            <p>{label}</p>
            <strong>{num}</strong>
            <span>{note}</span>
          </div>
        ))}
      </section>

      <section className="dashboard-charts">
        <div className="panel chart-panel">
          <div className="panel-head">
            <div>
              <h2>Inventory value</h2>
              <p>Selling-price value share by category</p>
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

        <div className="panel chart-panel">
          <div className="panel-head">
            <div>
              <h2>Reorder point</h2>
              <p>Stock vs threshold for items that need restocking</p>
            </div>
            <button type="button" onClick={goInventory}>View inventory →</button>
          </div>
          <ReorderPointChart items={reorderItems} />
        </div>
      </section>

      <section className="panel recent">
        <div className="panel-head">
          <div>
            <h2>Recent stock movements</h2>
            <p>Latest inventory transactions</p>
          </div>
          <button type="button" onClick={goMovements}>View history →</button>
        </div>
        <MovementTable rows={recentMovements} />
      </section>
    </>
  )
}
