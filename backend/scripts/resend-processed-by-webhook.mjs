import { pool } from '../src/database/pool.js';
import { dispatchStockRequestWebhook } from '../src/services/webhook.service.js';

/**
 * Dry-run / optional re-dispatch of recent webhooks to verify processedBy.
 * Usage:
 *   node scripts/resend-processed-by-webhook.mjs            # print payload only
 *   node scripts/resend-processed-by-webhook.mjs --send     # POST to CMS (status update only; may re-trigger branch stock on fulfill)
 */
const shouldSend = process.argv.includes('--send');
const refs = process.argv.filter((a) => a.startsWith('PSMS-'));

const result = await pool.query(`
  SELECT sr.*, i.item_name, i.stocks AS current_stocks, a.full_name AS processed_by_name
  FROM stock_requests sr
  LEFT JOIN inventory i ON i.inventory_id = sr.inventory_id
  LEFT JOIN users a ON a.user_id = sr.processed_by
  WHERE sr.status IN ('FULFILLED', 'REJECTED')
    AND ($1::text[] IS NULL OR cardinality($1::text[]) = 0 OR sr.external_reference = ANY($1))
  ORDER BY sr.updated_at DESC
  LIMIT 5
`, [refs.length ? refs : null]);

for (const row of result.rows) {
  const event = row.status === 'REJECTED' ? 'stock_request.rejected' : 'stock_request.fulfilled';
  const preview = {
    event,
    externalReference: row.external_reference,
    status: row.status,
    processedBy: row.processed_by_name,
    webhookUrl: row.webhook_url,
  };
  console.log(JSON.stringify(preview, null, 2));

  if (shouldSend) {
    const delivered = await dispatchStockRequestWebhook(row, event);
    console.log('sent =>', delivered);
  }
}

if (!shouldSend) {
  console.log('\nDry run only. Re-run with --send to POST webhooks (fulfill may re-add branch stock on CMS).');
}

await pool.end();
