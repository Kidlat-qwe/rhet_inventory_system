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
| `rename-shirt-items-to-beeli-lca.mjs` | Renames existing Shirt items from Logo 1 / Logo 2 to Beeli / LCA. Updates `item_name` to lowercase underscores (`shirt_beeli`, `shirt_lca`), plus `uniform_type`, `variation`, and SKU (`LOGO1` → `BEELI`, `LOGO2` → `LCA`). |
| `rename-shirt-skus-to-shi.mjs` | Shirt SKU rename. |
| `seed-shirt-logo-sizes.mjs` | Add missing Shirt sizes for a custom logo (e.g. ACC). Skips sizes that already exist; copies price/stock from the first existing row. |
| `seed-school-uniform-blouse-skirt.mjs` | Add School Uniform Blouse + Skirt per-piece rows for one gender/size (default Female · 4XL). Skips pieces that already exist. |

## Seed Shirt logo sizes

```bash
node scripts/seed-shirt-logo-sizes.mjs --logo=ACC
node scripts/seed-shirt-logo-sizes.mjs --logo=ACC --yes
```

Or: `npm run db:seed-shirt-logo-sizes -- --logo=ACC --yes`

Optional flags: `--stocks=50`, `--price=0`, `--internal-price=156`, `--threshold=10`.

## Seed School Uniform Blouse + Skirt

```bash
node scripts/seed-school-uniform-blouse-skirt.mjs
node scripts/seed-school-uniform-blouse-skirt.mjs --yes
```

Or: `npm run db:seed-school-uniform-blouse-skirt -- --yes`

Defaults (from Add School Uniform modal): Female · 4XL · stocks 100 · threshold 20 · Blouse internal ₱300 · Skirt internal ₱240.

Optional flags: `--gender=Female`, `--size=4XL`, `--stocks=100`, `--threshold=20`, `--price=0`, `--blouse-internal=300`, `--skirt-internal=240`, `--update-existing` (sync existing rows).

## Purge operational data (production)

Always uses `DB_*_PRODUCTION` from `.env` (does not follow `NODE_ENV`).

```bash
node scripts/purge-operational-data.mjs
node scripts/purge-operational-data.mjs --production --yes
```

Or: `npm run db:purge-operational-data` (dry run) then `npm run db:purge-operational-data -- --production --yes`.
