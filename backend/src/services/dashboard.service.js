import { pool } from '../database/pool.js';
import { camelize } from '../utils/api.js';

export async function dashboardSummary() {
  const [summary, categories, recentItems, movements] = await Promise.all([
    pool.query(`SELECT COUNT(*) FILTER (WHERE lifecycle_status='ACTIVE')::int total_items,
      COALESCE(SUM(stocks) FILTER (WHERE lifecycle_status='ACTIVE'),0)::int total_stocks,
      COALESCE(SUM(stocks*price) FILTER (WHERE lifecycle_status='ACTIVE'),0)::numeric total_value,
      COUNT(*) FILTER (WHERE status='LOW_STOCK')::int low_stock_items,
      COUNT(*) FILTER (WHERE status='OUT_OF_STOCK')::int out_of_stock_items FROM inventory`),
    pool.query(`SELECT c.category_name, COUNT(i.inventory_id)::int item_count,
      COALESCE(SUM(i.stocks),0)::int stocks, COALESCE(SUM(i.stocks*i.price),0)::numeric value
      FROM categories c LEFT JOIN inventory i ON i.category_id=c.category_id AND i.lifecycle_status='ACTIVE'
      WHERE c.status='ACTIVE' GROUP BY c.category_id ORDER BY c.category_name`),
    pool.query(`SELECT i.inventory_id,i.sku,i.item_name,i.stocks,i.status,i.updated_at,c.category_name
      FROM inventory i JOIN categories c ON c.category_id=i.category_id ORDER BY i.updated_at DESC LIMIT 5`),
    pool.query(`SELECT m.movement_id,m.movement_type,m.stock_delta,m.created_at,i.sku,i.item_name,a.full_name
      FROM stock_movements m JOIN inventory i ON i.inventory_id=m.inventory_id
      JOIN users a ON a.user_id=m.created_by ORDER BY m.created_at DESC LIMIT 6`),
  ]);
  return camelize({ summary: summary.rows[0], categories: categories.rows, recent_items: recentItems.rows, recent_movements: movements.rows });
}
