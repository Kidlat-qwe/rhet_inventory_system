# Stock request + Manual Order integration routes

Base: `/api/v1/integrations` (X-Integration-Key or Bearer).

## Stock requests (CMS / campus partners)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/catalog` | Categories + items |
| GET | `/availability` | Stock check |
| POST | `/stock-requests` | Create (requires `branchName`) |
| GET | `/stock-requests/:id` | Poll status |
| POST | `/stock-requests/:id/deliver` | CMS branch confirm receipt (SHIPPED → DELIVERED) |

Staff UI routes (Firebase): `/api/v1/stock-requests/:id/ship|deliver|return|reject`.

## Manual orders (Scoring Shipping Management — non-Shopee)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/manual-orders` | Header-only create (`items` empty; idempotent `externalReference`) |
| GET | `/manual-orders/:id` | Poll |
| GET | `/manual-orders/by-reference/:reference` | Poll by external reference |
| POST | `/manual-orders/:id/fulfillment-status` | Partner sets `DELIVERED` or `ERROR` |
| POST | `/manual-orders/by-reference/:reference/fulfillment-status` | Same by reference |

Webhooks: `manual_order.created` / `shipped` / `delivered` / `error` → order `webhookUrl`.  
Docs: `docs/external-system-integrations/SCORING_SHIPPING_MANUAL_ORDERS.md`.
