# Backend scripts

One-off maintenance scripts. Run from `backend/`.

Default is a **dry run** unless the script says otherwise. Destructive scripts require `--yes`.

| Script | Purpose |
|--------|---------|
| `purge-operational-data.mjs` | Production only. Deletes stock requests, online/manual orders, release-log source data, and stock movements. **Keeps** categories, inventory, kit BOMs, users, settings, API keys. Inventory quantities are unchanged. |
| `reset-inventory.mjs` | Deletes inventory items (and related stock data). Keeps categories. |
| `update-uniform-internal-prices.mjs` | Sets Shirt / PE Pants / School Set internal selling prices. |
| `seed-uniform-variants.mjs` | Seed uniform SKUs. |
| `normalize-pe-uniform-unisex.mjs` | PE unisex cleanup. |
| `reset-lca-shirt-logos.mjs` | Shirt logo reset. |
| `rename-shirt-skus-to-shi.mjs` | Shirt SKU rename. |

## Purge operational data (production)

Always uses `DB_*_PRODUCTION` from `.env` (does not follow `NODE_ENV`).

```bash
node scripts/purge-operational-data.mjs
node scripts/purge-operational-data.mjs --production --yes
```

Or: `npm run db:purge-operational-data` (dry run) then `npm run db:purge-operational-data -- --production --yes`.
