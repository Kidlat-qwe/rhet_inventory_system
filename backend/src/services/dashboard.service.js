import { pool } from '../database/pool.js';
import { camelize } from '../utils/api.js';

const CONSUMPTION_TYPES = ['ONLINE_SALE', 'MANUAL_SALE', 'RELEASED', 'STOCK_OUT'];

/**
 * Resolve dashboard time window.
 * Default: full current calendar year (YTD through end of year for queries using < end).
 * @param {{ period?: string, year?: string|number, month?: string }} [query]
 */
export function resolveDashboardRange(query = {}) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12

  const period = String(query.period || '').toLowerCase() === 'month' ? 'month' : 'year';
  let year = Number(query.year) || currentYear;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) year = currentYear;

  let month = null;
  if (period === 'month') {
    const monthRaw = String(query.month || '').trim();
    const match = monthRaw.match(/^(\d{4})-(\d{2})$/);
    if (match) {
      year = Number(match[1]);
      month = Number(match[2]);
    } else if (query.month != null && query.month !== '') {
      month = Number(query.month);
    } else {
      month = currentMonth;
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) month = currentMonth;
    if (!Number.isInteger(year) || year < 2000 || year > 2100) year = currentYear;
  }

  let start;
  let end;
  let label;

  if (period === 'month') {
    const mm = String(month).padStart(2, '0');
    start = new Date(`${year}-${mm}-01T00:00:00+08:00`);
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    end = new Date(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00+08:00`);
    label = start.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'Asia/Manila' });
  } else {
    start = new Date(`${year}-01-01T00:00:00+08:00`);
    end = new Date(`${year + 1}-01-01T00:00:00+08:00`);
    label = year === currentYear ? `This year (${year})` : String(year);
  }

  return {
    period,
    year,
    month,
    start,
    end,
    label,
    currentYear,
    currentMonth,
  };
}

export async function dashboardSummary(query = {}) {
  const range = resolveDashboardRange(query);
  const monthCount = range.year === range.currentYear
    ? range.currentMonth
    : 12;

  const [summary, categories, recentItems, movements, monthlyConsumption, reorderItems, channelSales] = await Promise.all([
    pool.query(`SELECT COUNT(*) FILTER (WHERE lifecycle_status='ACTIVE')::int total_items,
      COALESCE(SUM(stocks) FILTER (WHERE lifecycle_status='ACTIVE'),0)::int total_stocks,
      COALESCE(SUM(stocks*price) FILTER (WHERE lifecycle_status='ACTIVE'),0)::numeric total_value,
      COUNT(*) FILTER (WHERE status='LOW_STOCK')::int low_stock_items,
      COUNT(*) FILTER (WHERE status='OUT_OF_STOCK')::int out_of_stock_items,
      COUNT(*) FILTER (WHERE status='ACTIVE')::int healthy_items
      FROM inventory`),
    pool.query(`SELECT c.category_id, c.category_name, COUNT(i.inventory_id)::int item_count,
      COALESCE(SUM(i.stocks),0)::int stocks, COALESCE(SUM(i.stocks*i.price),0)::numeric value
      FROM categories c LEFT JOIN inventory i ON i.category_id=c.category_id AND i.lifecycle_status='ACTIVE'
      WHERE c.status='ACTIVE' GROUP BY c.category_id ORDER BY COALESCE(SUM(i.stocks),0) DESC, c.category_name`),
    pool.query(`SELECT i.inventory_id,i.sku,i.item_name,i.stocks,i.status,i.updated_at,c.category_name
      FROM inventory i JOIN categories c ON c.category_id=i.category_id ORDER BY i.updated_at DESC LIMIT 5`),
    pool.query(
      `SELECT m.movement_id,m.movement_type,m.stock_delta,m.created_at,i.sku,i.item_name,a.full_name
       FROM stock_movements m JOIN inventory i ON i.inventory_id=m.inventory_id
       JOIN users a ON a.user_id=m.created_by
       WHERE m.created_at >= $1 AND m.created_at < $2
       ORDER BY m.created_at DESC LIMIT 6`,
      [range.start, range.end],
    ),
    // Months of the selected year (YTD for current year).
    pool.query(
      `WITH months AS (
         SELECT (make_date($1::int, 1, 1) + (interval '1 month' * g))::date AS month_start
         FROM generate_series(0, $2::int - 1, 1) AS g
       )
       SELECT to_char(months.month_start, 'YYYY-MM') AS month_key,
              to_char(months.month_start, 'Mon YYYY') AS month_label,
              COALESCE(SUM(m.quantity), 0)::int AS quantity
       FROM months
       LEFT JOIN stock_movements m
         ON date_trunc('month', m.created_at) = months.month_start
        AND m.movement_type = ANY($3::text[])
        AND m.stock_delta < 0
       GROUP BY months.month_start
       ORDER BY months.month_start ASC`,
      [range.year, monthCount, CONSUMPTION_TYPES],
    ),
    pool.query(`SELECT i.inventory_id, i.sku, i.item_name, i.stocks, i.low_stock_threshold, i.status, c.category_name
      FROM inventory i
      JOIN categories c ON c.category_id = i.category_id
      WHERE i.lifecycle_status = 'ACTIVE'
        AND i.stocks <= i.low_stock_threshold
      ORDER BY (i.low_stock_threshold - i.stocks) DESC, i.stocks ASC, i.item_name ASC
      LIMIT 100`),
    // Channel sales for selected period (year default, or one month).
    pool.query(
      `SELECT
        COALESCE(SUM(m.quantity) FILTER (WHERE m.movement_type = 'RELEASED'), 0)::int AS stock_request_units,
        COALESCE(SUM(
          m.quantity * COALESCE(NULLIF(i.internal_selling_price, 0), i.price)
        ) FILTER (WHERE m.movement_type = 'RELEASED'), 0)::numeric AS stock_request_value,
        COALESCE(SUM(m.quantity) FILTER (WHERE m.movement_type = 'ONLINE_SALE'), 0)::int AS online_order_units,
        COALESCE(SUM(m.quantity * i.price) FILTER (WHERE m.movement_type = 'ONLINE_SALE'), 0)::numeric AS online_order_value,
        COALESCE(SUM(m.quantity) FILTER (WHERE m.movement_type = 'MANUAL_SALE'), 0)::int AS manual_order_units,
        COALESCE(SUM(m.quantity * i.price) FILTER (WHERE m.movement_type = 'MANUAL_SALE'), 0)::numeric AS manual_order_value
      FROM stock_movements m
      JOIN inventory i ON i.inventory_id = m.inventory_id
      WHERE m.stock_delta < 0
        AND m.movement_type IN ('RELEASED', 'ONLINE_SALE', 'MANUAL_SALE')
        AND m.created_at >= $1
        AND m.created_at < $2`,
      [range.start, range.end],
    ),
  ]);

  const salesRow = channelSales.rows[0] || {};

  return camelize({
    summary: summary.rows[0],
    categories: categories.rows,
    recent_items: recentItems.rows,
    recent_movements: movements.rows,
    monthly_consumption: monthlyConsumption.rows,
    reorder_items: reorderItems.rows,
    period: {
      key: range.period === 'month'
        ? `${range.year}-${String(range.month).padStart(2, '0')}`
        : 'year',
      type: range.period,
      year: range.year,
      month: range.month,
      label: range.label,
      start: range.start.toISOString(),
      end: range.end.toISOString(),
    },
    channel_sales: {
      period: range.period,
      label: range.label,
      stock_requests: {
        units: Number(salesRow.stock_request_units) || 0,
        value: salesRow.stock_request_value ?? 0,
      },
      online_orders: {
        units: Number(salesRow.online_order_units) || 0,
        value: salesRow.online_order_value ?? 0,
      },
      manual_orders: {
        units: Number(salesRow.manual_order_units) || 0,
        value: salesRow.manual_order_value ?? 0,
      },
    },
  });
}
